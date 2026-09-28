import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateAdmin } from '../_lib/ai/caller'
import { todayInZone } from '../_lib/ai/clock'
import { loadAiConfig, type ModelTier } from '../_lib/ai/config'
import { matchStandingInstruction, type InstructionMatch } from '../_lib/ai/instructions'
import { chat, type ChatMessage } from '../_lib/ai/openrouter'
import { buildSystemPrompt, gatherPromptState } from '../_lib/ai/prompt'
import { runTriggers } from '../_lib/ai/triggers'
import { findTool, runToolCall, toolDefinitions } from '../_lib/ai/tools'
import type { ToolContext } from '../_lib/ai/tools/kit'

/**
 * Ro's chat turn.
 *
 * The shape of one turn: authenticate the owner, read today's real state, build
 * §4's prompt around it, hand the model §3's catalog, and run the tool loop
 * until it answers in prose.
 *
 * Tier routing, per §10 — the caller picks the tier, the model never asks for a
 * bigger one:
 *
 *  - Tier 0 (intent) runs the turn and every read. That is the "which tool,
 *    which arguments" job it was chosen for.
 *  - Tier 1 (drafting) takes over the moment a draft-tier tool is wanted. The
 *    wording a parent actually reads is Tier 1's job, so the draft call is
 *    re-issued there rather than keeping whatever body the intent model wrote.
 *  - Tier 2 (escalation) is the fallback, not a default: it runs when Tier 0
 *    cannot be reached at all, or when Tier 0 tries to call a tool that does not
 *    exist, which is the observable form of low confidence here — the models in
 *    tiers 0 and 1 return no confidence score, so inventing a numeric threshold
 *    would be inventing a measurement.
 *
 * Phase 1 writes nothing. The catalog contains no send or mutate tool, so the
 * loop has nothing to chain a draft into.
 *
 * §8's audit log is not yet a table. Every tool run is returned to the caller for
 * the activity feed and logged server-side, which is proportionate while nothing
 * can be changed — but a durable audit table has to exist before the first write
 * tool ships, not alongside it.
 */

const MAX_HISTORY = 20
const MAX_MESSAGE_CHARS = 4000
/** Read, think, read again, answer. Four covers real chains without looping. */
const MAX_ROUNDS = 4

interface IncomingTurn {
  message: string
  history: { role: 'user' | 'assistant'; content: string }[]
}

function readTurn(raw: unknown): IncomingTurn | string {
  if (typeof raw !== 'object' || raw === null) return 'Malformed request body'
  const body = raw as Record<string, unknown>

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (message.length === 0) return 'A message is required'
  if (message.length > MAX_MESSAGE_CHARS) return 'That message is too long'

  const history: IncomingTurn['history'] = []
  if (Array.isArray(body.history)) {
    for (const entry of body.history.slice(-MAX_HISTORY)) {
      if (typeof entry !== 'object' || entry === null) continue
      const turn = entry as Record<string, unknown>
      const role = turn.role
      const content = turn.content
      if (role !== 'user' && role !== 'assistant') continue
      if (typeof content !== 'string' || content.trim().length === 0) continue
      history.push({ role, content: content.slice(0, MAX_MESSAGE_CHARS) })
    }
  }
  return { message, history }
}

/** A draft a tool produced, pulled out for the console to render and confirm. */
interface DraftRecord {
  tool: string
  draft: unknown
}

function extractDraft(tool: string, data: unknown): DraftRecord | null {
  if (typeof data !== 'object' || data === null) return null
  const record = data as Record<string, unknown>
  if (record.drafted !== true) return null
  const draft = record.draft
  if (typeof draft !== 'object' || draft === null) return null
  return { tool, draft }
}

interface RunRecord {
  name: string
  tier: string | null
  ok: boolean
  arguments: string
  error?: string
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const config = loadAiConfig()
  if (!config.ok) {
    res.status(500).json({ error: config.error })
    return
  }
  if (!config.config.enabled) {
    res.status(503).json({
      error: 'Ro is turned off. Set AI_ASSISTANT_ENABLED=true to switch her on.',
      enabled: false,
    })
    return
  }

  const caller = await authenticateAdmin(req.headers.authorization)
  if (!caller.ok) {
    res.status(caller.status).json({ error: caller.error })
    return
  }

  const turn = readTurn(req.body)
  if (typeof turn === 'string') {
    res.status(400).json({ error: turn })
    return
  }

  const ctx: ToolContext = { caller: caller.caller, today: todayInZone() }
  const warnings: string[] = []

  // Today's state, read before the model is involved in anything.
  const { sweep, failures: sweepFailures } = await runTriggers(ctx)
  for (const failure of sweepFailures) {
    warnings.push(`Could not check ${failure.kind}: ${failure.detail}`)
  }
  const { state, failures: stateFailures } = await gatherPromptState(ctx, sweep)
  warnings.push(...stateFailures.map((failure) => `Could not read ${failure}`))

  // §6's fast path. Informs the turn; never replaces it.
  const instruction: InstructionMatch | null = matchStandingInstruction(turn.message)

  const systemPrompt =
    instruction === null
      ? buildSystemPrompt(state)
      : `${buildSystemPrompt(state)}\n\n---\n\nNOTE ON WHAT SHE JUST SAID\n\n` +
        `That reads like a standing instruction (${instruction.shape}). You cannot ` +
        `save standing instructions yet — there is nowhere to put them. Acknowledge ` +
        `it plainly, say you will not remember it after this conversation, and answer ` +
        `anything else she asked in the same message.`

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...turn.history.map((entry) =>
      entry.role === 'user'
        ? ({ role: 'user', content: entry.content } as const)
        : ({ role: 'assistant', content: entry.content } as const),
    ),
    { role: 'user', content: turn.message },
  ]

  const tools = toolDefinitions()
  const runs: RunRecord[] = []
  const drafts: DraftRecord[] = []

  let tier: ModelTier = 'intent'
  let escalated = false
  let answeredBy = ''
  let reply = ''

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const result = await chat(config.config, tier, { messages, tools, toolChoice: 'auto' })

    if (!result.ok) {
      console.error('[ro] tier failed', tier, JSON.stringify(result.attempts))
      if (tier !== 'escalation' && !escalated) {
        // Tier 0 unreachable is exactly what §10's escalation tier is for.
        escalated = true
        tier = 'escalation'
        warnings.push('The usual model was unavailable, so this answer came from the backup.')
        continue
      }
      res.status(result.status).json({ error: result.error, warnings })
      return
    }

    answeredBy = result.model

    if (result.toolCalls.length === 0) {
      reply = result.content
      break
    }

    // A draft belongs to Tier 1. Re-issue the round there rather than keeping
    // wording the intent model wrote.
    const wantsDraft = result.toolCalls.some((call) => findTool(call.function.name)?.tier === 'draft')
    if (wantsDraft && tier === 'intent') {
      tier = 'drafting'
      continue
    }

    // An invented tool name is the signal to escalate — see the header.
    const invented = result.toolCalls.filter((call) => findTool(call.function.name) === undefined)
    if (invented.length > 0 && !escalated && tier !== 'escalation') {
      console.warn('[ro] invented tool(s)', invented.map((call) => call.function.name).join(', '))
      escalated = true
      tier = 'escalation'
      continue
    }

    messages.push({ role: 'assistant', content: result.content, tool_calls: result.toolCalls })

    for (const call of result.toolCalls) {
      const run = await runToolCall(call.function, ctx)
      const record: RunRecord = {
        name: run.name,
        tier: run.tier,
        ok: run.outcome.ok,
        arguments: run.rawArguments,
      }
      if (!run.outcome.ok) record.error = run.outcome.error
      runs.push(record)
      console.info('[ro] tool', run.name, run.outcome.ok ? 'ok' : `failed: ${record.error ?? ''}`)

      if (run.outcome.ok) {
        const draft = extractDraft(run.name, run.outcome.data)
        if (draft !== null) drafts.push(draft)
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(run.outcome.ok ? run.outcome.data : { error: run.outcome.error }),
      })
    }
  }

  if (reply.length === 0) {
    // Out of rounds with no prose. Better to say so than to ship a blank bubble.
    reply =
      runs.length > 0
        ? "I looked that up but couldn't put an answer together. Ask me again?"
        : "I couldn't work out what to do with that. Can you say it another way?"
    warnings.push(`No reply after ${MAX_ROUNDS} rounds.`)
  }

  res.status(200).json({
    reply,
    model: answeredBy,
    tier,
    escalated,
    drafts,
    toolRuns: runs,
    notices: sweep.triggers,
    quietHours: sweep.quietHours,
    standingInstruction: instruction,
    warnings,
  })
}

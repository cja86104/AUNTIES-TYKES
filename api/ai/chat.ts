import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateAdmin } from '../_lib/ai/caller.js'
import { todayInZone } from '../_lib/ai/clock.js'
import { loadAiConfig, type ModelTier } from '../_lib/ai/config.js'
import { matchStandingInstruction, type InstructionMatch } from '../_lib/ai/instructions.js'
import { chat, type ChatMessage } from '../_lib/ai/openrouter.js'
import { buildSystemPrompt, gatherPromptState } from '../_lib/ai/prompt.js'
import { runTriggers } from '../_lib/ai/triggers.js'
import { findTool, runToolCall, toolDefinitions } from '../_lib/ai/tools/index.js'
import { readActionPreview, type ActionPreview, type ToolContext } from '../_lib/ai/tools/kit.js'

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
 * What this loop can and cannot cause: a tool here may PROPOSE an action, which
 * writes a row to `ai_audit_log` and returns a preview. It cannot execute one.
 * The writes live in `api/_lib/ai/execute.ts` behind `api/ai/confirm.ts`, so no
 * path through this handler changes a business record, however the conversation
 * goes. The one exception is `commitment.note`/`commitment.close`, which write to
 * Ro's own follow-up list and nothing else.
 */

const MAX_HISTORY = 20
const MAX_MESSAGE_CHARS = 4000
/**
 * How many times the model may be called in one turn.
 *
 * Raised from 4 to 8 on 2026-09-28, after "don't message the Brooks family until
 * Friday" came back as "I looked that up but couldn't put an answer together."
 * Four was budgeted for reads, where two lookups and an answer is plenty. An
 * action needs more: resolve the family, propose the rule, then speak — three
 * before a word is said, with nothing left over for a second lookup or a retry.
 * The budget had no slack for the work it was being asked to do.
 *
 * Eight is still a ceiling rather than a target: the loop breaks the moment the
 * model answers in prose, so a normal read turn costs the same two calls it
 * always did. It only spends more where the alternative was spending everything
 * and producing nothing.
 */
const MAX_ROUNDS = 8

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

  // `instruction` is her sentence, verbatim, so §8's audit rows record what caused
  // an action rather than the model's paraphrase of it. `model` is filled in each
  // round once the tier that answered is known.
  const ctx: ToolContext = {
    caller: caller.caller,
    today: todayInZone(),
    instruction: turn.message,
    model: '',
    proposedThisTurn: new Map(),
    seenThisTurn: new Map(),
  }
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
        `That reads like a standing instruction (${instruction.shape}) — a plain regex ` +
        `spotted the shape, not you, so treat it as a hint and not a verdict. If it is ` +
        `one, save it with rule.save: resolve the family first if it names one, put her ` +
        `own words in said and your reading of it in summary. She approves it with a ` +
        `tap, so tell her it is waiting rather than that it is saved. If the shape ` +
        `matched something that was not actually an instruction, ignore this note. ` +
        `Either way, answer anything else she asked in the same message.`

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
  const actions: ActionPreview[] = []

  let tier: ModelTier = 'intent'
  let escalated = false
  let answeredBy = ''
  let reply = ''

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    // The last round is reserved for prose. Without this, a model that keeps
    // reaching for tools simply runs out and she gets nothing — which is exactly
    // what happened to a "Monday rundown" that spent eight rounds looking up
    // family names. Forbidding tools on the final call guarantees an answer from
    // whatever was gathered, which is always better than an apology.
    // Tools are omitted entirely rather than sent with tool_choice: 'none'. A
    // request with no tools cannot call one under any provider's rules, whereas
    // 'none' is a newer field whose support varies — and this runs against three
    // different providers.
    const lastCall = round === MAX_ROUNDS - 1
    const result = await chat(
      config.config,
      tier,
      lastCall ? { messages } : { messages, tools, toolChoice: 'auto' },
    )

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
    if (result.toolCalls.some((call) => findTool(call.function.name)?.tier === 'send')) {
      // The wording a parent actually reads is Tier 1's job, the same as a draft.
      if (tier === 'intent') {
        tier = 'drafting'
        continue
      }
    }

    // An invented tool name is the signal to escalate — see the header.
    const invented = result.toolCalls.filter((call) => findTool(call.function.name) === undefined)
    if (invented.length > 0 && !escalated && tier !== 'escalation') {
      console.warn('[ro] invented tool(s)', invented.map((call) => call.function.name).join(', '))
      escalated = true
      tier = 'escalation'
      continue
    }

    // Whichever tier answered is the one that chose these calls, so it is the one
    // an audit row should name.
    ctx.model = result.model

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
        const action = readActionPreview(run.outcome.data)
        if (action !== null) actions.push(action)
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(run.outcome.ok ? run.outcome.data : { error: run.outcome.error }),
      })
    }
  }

  if (reply.length === 0) {
    // Out of rounds with no prose. The work may still have happened — a card is
    // rendered from `actions` and a draft from `drafts` whatever this text says —
    // so the fallback has to describe what is actually on her screen. Saying
    // "couldn't put an answer together" above a card she can tap is worse than
    // saying nothing: it tells her the thing in front of her failed.
    if (actions.length > 0) {
      reply =
        actions.length === 1
          ? `${actions[0]?.summary ?? 'One thing'} — it's below, waiting on you.`
          : `${String(actions.length)} things are below, waiting on you.`
    } else if (drafts.length > 0) {
      reply = "Draft's below — I ran out of room to say more about it."
    } else {
      reply =
        runs.length > 0
          ? "I looked that up but couldn't put an answer together. Ask me again?"
          : "I couldn't work out what to do with that. Can you say it another way?"
    }
    warnings.push(
      `No reply after ${String(MAX_ROUNDS)} model calls. Tools run: ` +
        (runs.length > 0 ? runs.map((run) => run.name).join(' → ') : 'none'),
    )
  }

  res.status(200).json({
    reply,
    model: answeredBy,
    tier,
    escalated,
    drafts,
    actions,
    toolRuns: runs,
    notices: sweep.triggers,
    quietHours: sweep.quietHours,
    standingInstruction: instruction,
    warnings,
  })
}

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { settleProposal, type Decision } from '../_lib/ai/approval.js'
import { authenticateAdmin } from '../_lib/ai/caller.js'
import { todayInZone } from '../_lib/ai/clock.js'
import { loadAiConfig } from '../_lib/ai/config.js'
import type { ToolContext } from '../_lib/ai/tools/kit.js'

/**
 * Her tap — §7's confirmation gate.
 *
 * Deliberately thin: method, config, auth, body, then `settleProposal`. The
 * decision sequence lives in `../_lib/ai/approval.ts` so it can be exercised
 * without auth or a live database standing in the way, and so this file has
 * nothing in it worth hiding a bug in.
 *
 * Note what is NOT here: no prompt, no model call, no tool selection. The action's
 * arguments were stored when Ro proposed it, and they are what runs.
 */

interface Incoming {
  proposalId: string
  decision: Decision
}

function readBody(raw: unknown): Incoming | string {
  if (typeof raw !== 'object' || raw === null) return 'Malformed request body'
  const body = raw as Record<string, unknown>
  const proposalId = typeof body.proposalId === 'string' ? body.proposalId.trim() : ''
  if (proposalId.length === 0 || proposalId.length > 120) return 'A proposalId is required'
  const decision = body.decision
  if (decision !== 'approve' && decision !== 'decline' && decision !== 'undo') {
    return "decision must be 'approve', 'decline' or 'undo'"
  }
  return { proposalId, decision }
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
  // A switched-off Ro must not execute actions she proposed while she was on.
  if (!config.config.enabled) {
    res.status(503).json({ error: 'Ro is turned off, so nothing of hers can run.', enabled: false })
    return
  }

  const caller = await authenticateAdmin(req.headers.authorization)
  if (!caller.ok) {
    res.status(caller.status).json({ error: caller.error })
    return
  }

  const body = readBody(req.body)
  if (typeof body === 'string') {
    res.status(400).json({ error: body })
    return
  }

  // No model ran, so there is no instruction or model to attribute here. The audit
  // row already carries both from when the action was proposed.
  const ctx: ToolContext = {
    caller: caller.caller,
    today: todayInZone(),
    instruction: '',
    model: '',
    // Nothing proposes anything here, and nothing reads twice; this endpoint only
    // runs what was already proposed.
    proposedThisTurn: new Map(),
    seenThisTurn: new Map(),
  }

  const result = await settleProposal(ctx, body.proposalId, body.decision)
  res.status(result.status).json(result.body)
}

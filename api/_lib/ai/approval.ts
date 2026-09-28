/**
 * What happens when she taps — §7's gate, as logic rather than as an endpoint.
 *
 * This lives apart from `api/ai/confirm.ts` so the decision sequence can be run
 * and checked without standing up auth, a model or a live database. The endpoint
 * is deliberately thin around it: method, config, auth, body, then this.
 *
 * No model is involved anywhere below. The action's arguments were stored before
 * she ever saw the preview, and they are read back from that row — so what runs
 * is what she approved, and nothing gets a second turn to reinterpret it. A
 * confirmation flow that asked a model what to do after she said yes would be a
 * confirmation of nothing.
 *
 * The order is the safety property:
 *
 *  1. Claim the row, atomically. A second tap finds nothing to claim.
 *  2. Find the executor. An action whose tool no longer exists is failed, not
 *     crashed — an audit row outlives the deploy that wrote it.
 *  3. For anything that sends, re-check the standing rules. Not at proposal time:
 *     she may have added "don't message the Brooks family" in between, and the
 *     check that counts is the one nearest the send.
 *  4. Run it, then settle the row with what actually happened.
 */

import { claimProposal, declineProposal, settle } from './audit.js'
import { findExecutor } from './execute.js'
import { rulesBlocking } from './rules.js'
import type { ToolContext } from './tools/kit.js'

export type Decision = 'approve' | 'decline'

export interface ConfirmBody {
  outcome?: 'executed' | 'declined' | 'failed'
  summary?: string
  error?: string
  undoUntil?: string | null
  blockedBy?: string[]
}

export interface ConfirmResult {
  /**
   * 409 means the action was not hers to decide any more — already done, already
   * dismissed, or gone. A 200 with `outcome: 'failed'` means it was hers, it ran,
   * and it did not work: a real outcome the audit row records, not a transport
   * error.
   */
  status: number
  body: ConfirmBody
}

export async function settleProposal(
  ctx: ToolContext,
  proposalId: string,
  decision: Decision,
): Promise<ConfirmResult> {
  if (decision === 'decline') {
    const declined = await declineProposal(ctx, proposalId)
    if (!declined.ok) return { status: 500, body: { error: declined.error } }
    if (!declined.value) return { status: 409, body: { error: 'That one is no longer waiting on you.' } }
    return { status: 200, body: { outcome: 'declined', summary: 'Dismissed. Nothing was changed.' } }
  }

  const claim = await claimProposal(ctx, proposalId)
  if (!claim.ok) return { status: 409, body: { error: claim.error } }
  const proposal = claim.value

  const executor = findExecutor(proposal.tool)
  if (executor === undefined) {
    const error = `I can no longer run ${proposal.tool} — it has been changed or removed since I offered it.`
    await settle(ctx, proposal.id, 'failed', { error })
    return { status: 200, body: { outcome: 'failed', error } }
  }

  // §7's send-time rule check, on the generic path so no executor can skip it.
  if (executor.sendTarget !== undefined) {
    const target = executor.sendTarget(proposal)
    if (target !== null) {
      const blocking = await rulesBlocking(ctx, target)
      if (!blocking.ok) {
        // Fails closed: an unreadable rules table refuses the send. Treating it as
        // "no rules" is how a message reaches a family she told Ro to leave alone
        // because of a database hiccup.
        await settle(ctx, proposal.id, 'failed', { error: blocking.error })
        return { status: 200, body: { outcome: 'failed', error: blocking.error } }
      }
      if (blocking.value.length > 0) {
        const summaries = blocking.value.map((rule) => rule.summary)
        const error = `I stopped that — one of your own rules says not to: ${summaries.join('; ')}`
        await settle(ctx, proposal.id, 'failed', { error })
        return { status: 200, body: { outcome: 'failed', error, blockedBy: summaries } }
      }
    }
  }

  const result = await executor.run(ctx, proposal)
  if (!result.ok) {
    await settle(ctx, proposal.id, 'failed', { error: result.error })
    return { status: 200, body: { outcome: 'failed', error: result.error } }
  }

  await settle(ctx, proposal.id, 'executed', {
    targets: result.targets,
    undoUntilMs: result.undoMs,
  })

  return {
    status: 200,
    body: {
      outcome: 'executed',
      summary: result.summary,
      undoUntil: result.undoMs === undefined ? null : new Date(Date.now() + result.undoMs).toISOString(),
    },
  }
}

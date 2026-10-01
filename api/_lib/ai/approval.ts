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

import {
  abandonUndo,
  claimProposal,
  claimUndo,
  declineProposal,
  pendingProposalTool,
  sendsInLastHour,
  settle,
} from './audit.js'
import { findExecutor } from './execute.js'
import { rulesBlocking } from './rules.js'
import type { ToolContext } from './tools/kit.js'

/**
 * §8's hard ceilings on how much can go out in an hour.
 *
 * Sized for what this business actually is: a home daycare with about a dozen
 * families. Normal use never comes close — a busy morning is a handful of
 * messages. These are not a budget to spend, they are a tripwire for something
 * having gone wrong: a loop, a misread instruction, an announcement re-posted
 * over and over. Both are counted, because they fail differently. Twenty single
 * messages is a stuck process; two announcements to everyone, twice, is a small
 * number of actions that reached every parent four times.
 */
const MAX_SEND_ACTIONS_PER_HOUR = 20
const MAX_RECIPIENTS_PER_HOUR = 120

export type Decision = 'approve' | 'decline' | 'undo'

export interface ConfirmBody {
  outcome?: 'executed' | 'declined' | 'failed' | 'undone'
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

/**
 * `secret` is a value she typed on the card at her tap — a parent login's
 * password — or null. It is checked against what the action declares before
 * anything is claimed, handed to that one executor, and otherwise never stored,
 * logged or returned. See `ActionPreview.secret` for why it travels this way.
 */
export async function settleProposal(
  ctx: ToolContext,
  proposalId: string,
  decision: Decision,
  secret: string | null = null,
): Promise<ConfirmResult> {
  if (secret !== null && decision !== 'approve') {
    return { status: 400, body: { error: 'Only an approval can carry a password.' } }
  }

  if (decision === 'undo') {
    const claimed = await claimUndo(ctx, proposalId)
    if (!claimed.ok) return { status: 409, body: { error: claimed.error } }

    const executor = findExecutor(claimed.value.tool)
    if (executor?.undo === undefined) {
      const error = `I cannot take back a ${claimed.value.tool}.`
      await abandonUndo(ctx, claimed.value.id, error)
      return { status: 200, body: { outcome: 'executed', error } }
    }

    const result = await executor.undo(ctx, claimed.value.targets)
    if (!result.ok) {
      // The claim goes back: it was not undone, and the trail must keep saying
      // the thing went out, because it did.
      await abandonUndo(ctx, claimed.value.id, result.error)
      return { status: 200, body: { outcome: 'executed', error: result.error } }
    }
    return { status: 200, body: { outcome: 'undone', summary: result.summary } }
  }

  if (decision === 'decline') {
    const declined = await declineProposal(ctx, proposalId)
    if (!declined.ok) return { status: 500, body: { error: declined.error } }
    if (!declined.value) return { status: 409, body: { error: 'That one is no longer waiting on you.' } }
    return { status: 200, body: { outcome: 'declined', summary: 'Dismissed. Nothing was changed.' } }
  }

  // Before the claim, because a claim is final: a password that is too short must
  // be refused while she can still fix it on the same card. And a password sent
  // for an action that takes none is refused outright rather than ignored, so a
  // value she typed can never be carried somewhere it was not meant to go.
  const pendingTool = await pendingProposalTool(ctx, proposalId)
  if (!pendingTool.ok) return { status: 500, body: { error: pendingTool.error } }
  if (pendingTool.value !== null) {
    const wants = findExecutor(pendingTool.value)?.secret
    if (wants === undefined && secret !== null) {
      return { status: 400, body: { error: 'That action does not take a password.' } }
    }
    if (wants !== undefined) {
      if (secret === null || secret.length < wants.minLength) {
        return {
          status: 422,
          body: { error: `The password needs at least ${String(wants.minLength)} characters.` },
        }
      }
      if (secret.length > wants.maxLength) {
        return { status: 422, body: { error: 'That password is too long.' } }
      }
    }
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

  // §7's send-time rule check and §8's ceilings, both on the generic path so no
  // executor can skip either. Declaring `sendTarget` is what opts a tool in, and
  // it is the only thing that does — there is no per-tool flag to forget.
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

      // Checked here, after the claim, which costs her this proposal if it trips.
      // That is the intended trade: at these ceilings a trip means something is
      // wrong, and a hard stop with a row in the trail saying so is worth more
      // than a smoother retry. It also cannot be raced by a double tap, because
      // the claim above already happened.
      const reach = executor.recipientCount?.(proposal) ?? 1
      const sent = await sendsInLastHour(ctx)
      if (!sent.ok) {
        // Fails closed, for the same reason the rule check does.
        await settle(ctx, proposal.id, 'failed', { error: sent.error })
        return { status: 200, body: { outcome: 'failed', error: sent.error } }
      }
      const overActions = sent.value.actions + 1 > MAX_SEND_ACTIONS_PER_HOUR
      const overRecipients = sent.value.recipients + reach > MAX_RECIPIENTS_PER_HOUR
      if (overActions || overRecipients) {
        const error = overActions
          ? `That would be ${String(sent.value.actions + 1)} sends in an hour, and I cap it at ` +
            `${String(MAX_SEND_ACTIONS_PER_HOUR)}. Nothing went out. If that many really are ` +
            'meant to go, send them from Messages yourself — the cap is on me, not on you.'
          : `That would reach ${String(sent.value.recipients + reach)} families in an hour, and I ` +
            `cap it at ${String(MAX_RECIPIENTS_PER_HOUR)}. Nothing went out. If it really is meant ` +
            'to go, send it from Messages yourself — the cap is on me, not on you.'
        await settle(ctx, proposal.id, 'failed', { error })
        return { status: 200, body: { outcome: 'failed', error } }
      }
    }
  }

  // Only an executor that declared it gets the secret — checked above, and again
  // here so the hand-off does not depend on that check staying where it is.
  const result = await executor.run(ctx, proposal, executor.secret === undefined ? null : secret)
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

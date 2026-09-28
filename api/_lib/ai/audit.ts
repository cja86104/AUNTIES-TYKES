/**
 * The audit trail, and the proposal ledger — they are the same table.
 *
 * §8 requires that every AI-initiated action record the instruction that caused
 * it, the tool, the arguments and what it touched. `ai_audit_log` does that, and
 * it doubles as the store for actions waiting on Melissa's tap, which is what
 * makes the confirmation gate in §7 trustworthy rather than cosmetic.
 *
 * The important property: a proposal is written with its arguments BEFORE she
 * sees it, and executing it reads those stored arguments back. The model gets no
 * second chance to change the payload between the preview she approved and the
 * write that happens. A confirmation flow that re-asked a model what to do after
 * she said yes would be a confirmation of nothing.
 *
 * Lifecycle: proposed -> confirmed -> executed, or -> declined, or -> failed. The
 * proposed -> confirmed step is a compare-and-swap, which is what makes a double
 * tap impossible rather than unlikely — see `claimProposal`.
 * `undone` is set by the undo window. Nothing is ever deleted; a declined
 * proposal is kept because a pattern of declines says something about Ro.
 */

import { uid } from './ids.js'
import type { ToolContext } from './tools/kit.js'

export type AuditOutcome = 'proposed' | 'confirmed' | 'executed' | 'failed' | 'declined' | 'undone'

export interface AuditSubject {
  familyId?: string | null
  familyLabel?: string
  childId?: string | null
  childLabel?: string
  /** Invoice ids, thread ids, recipient lists — whatever else it touched. */
  targets?: unknown[]
}

export interface ProposalInput {
  /** What she said, verbatim, before any model touched it. */
  instruction: string
  tool: string
  riskTier: string
  /** Exactly what will execute if she approves. Stored, then read back. */
  arguments: Record<string, unknown>
  subject?: AuditSubject
  model?: string
}

export interface Proposal {
  id: string
  tool: string
  riskTier: string
  arguments: Record<string, unknown>
  instruction: string
  outcome: AuditOutcome
  familyId: string | null
  familyLabel: string
  childId: string | null
  childLabel: string
}

export type AuditResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** The one insert. `propose` and `record` differ only in the outcome they open with. */
async function write(
  ctx: ToolContext,
  input: ProposalInput,
  outcome: AuditOutcome,
  detail: { error?: string } = {},
): Promise<AuditResult<string>> {
  const id = uid('act')
  const subject = input.subject ?? {}
  const { error } = await ctx.caller.db.from('ai_audit_log').insert({
    id,
    actor_id: ctx.caller.id,
    actor_name: ctx.caller.name,
    instruction: input.instruction.slice(0, 4000),
    tool: input.tool,
    risk_tier: input.riskTier,
    arguments: input.arguments,
    family_id: subject.familyId ?? null,
    family_label: subject.familyLabel ?? '',
    child_id: subject.childId ?? null,
    child_label: subject.childLabel ?? '',
    targets: subject.targets ?? [],
    outcome,
    error: detail.error?.slice(0, 2000) ?? '',
    model: input.model ?? '',
  })
  if (error !== null) return { ok: false, error: `Could not record the action: ${error.message}` }
  return { ok: true, value: id }
}

/**
 * Records an action awaiting approval and returns its id.
 *
 * Deliberately not optimistic: if this insert fails, the caller must not offer
 * the action. An unlogged write is exactly what §8 exists to prevent, so a
 * broken audit trail has to block the thing it audits rather than be skipped.
 */
export async function propose(
  ctx: ToolContext,
  input: ProposalInput,
): Promise<AuditResult<string>> {
  return write(ctx, input, 'proposed')
}

/**
 * Records an action that has already run, for the tools that need no approval.
 *
 * Only for writes that touch Ro's own tables — her follow-up notes. Anything
 * that changes a business record, sends a message or moves money goes through
 * `propose` and the confirm endpoint, per §7, which has no exceptions in v1.
 *
 * Called AFTER the write, not before, and on purpose: an action that ran must be
 * logged whether or not the log insert then succeeds, and an action that failed
 * must be logged as failed. Logging first would need a second update either way.
 */
export async function record(
  ctx: ToolContext,
  input: ProposalInput,
  outcome: 'executed' | 'failed',
  detail: { error?: string } = {},
): Promise<AuditResult<string>> {
  return write(ctx, input, outcome, detail)
}

const PROPOSAL_COLUMNS =
  'id, tool, risk_tier, arguments, instruction, outcome, family_id, family_label, child_id, child_label'

/**
 * Claims a proposal for execution, atomically.
 *
 * A compare-and-swap rather than a read-then-write: the update only matches a
 * row still `proposed`, so two taps on the same card — a double click, a retried
 * request, the panel restored in a second tab — cannot both come back holding the
 * same action. One wins and gets the row; the other is told what already happened
 * to it. A read followed by a separate write would leave exactly the window where
 * a message gets sent twice or a payment recorded twice.
 *
 * The claim also means a crash between here and the write leaves a `confirmed`
 * row rather than a `proposed` one, so a later tap will not run it again. That is
 * the safer of the two failures: an action she approved that may not have run is
 * recoverable by looking, whereas one that ran twice is not.
 */
export async function claimProposal(
  ctx: ToolContext,
  id: string,
): Promise<AuditResult<Proposal>> {
  const claimed = await ctx.caller.db
    .from('ai_audit_log')
    .update({ outcome: 'confirmed' })
    .eq('id', id)
    .eq('outcome', 'proposed')
    .select(PROPOSAL_COLUMNS)

  if (claimed.error !== null) {
    return { ok: false, error: `Could not read that action: ${claimed.error.message}` }
  }

  const row = claimed.data[0]
  if (row === undefined) {
    // Nothing matched: either it is gone, or it is no longer waiting. Read it
    // back so she is told which, instead of a generic failure.
    const existing = await ctx.caller.db
      .from('ai_audit_log')
      .select('outcome')
      .eq('id', id)
      .maybeSingle()
    if (existing.error !== null) {
      return { ok: false, error: `Could not read that action: ${existing.error.message}` }
    }
    if (existing.data === null) return { ok: false, error: 'That action no longer exists' }
    return {
      ok: false,
      error:
        existing.data.outcome === 'executed'
          ? 'That one is already done — nothing was repeated.'
          : `That action is no longer waiting for approval (${existing.data.outcome}).`,
    }
  }

  return {
    ok: true,
    value: {
      id: row.id,
      tool: row.tool,
      riskTier: row.risk_tier,
      arguments: row.arguments,
      instruction: row.instruction,
      outcome: row.outcome,
      familyId: row.family_id,
      familyLabel: row.family_label,
      childId: row.child_id,
      childLabel: row.child_label,
    },
  }
}

/**
 * Marks a proposal declined, and reports whether it was still hers to decline.
 *
 * Guarded on `proposed` for the same reason as the claim: dismissing something
 * that already ran must not record it as declined, or the trail would say an
 * action she approved was one she refused.
 */
export async function declineProposal(
  ctx: ToolContext,
  id: string,
): Promise<AuditResult<boolean>> {
  const { data, error } = await ctx.caller.db
    .from('ai_audit_log')
    .update({ outcome: 'declined' })
    .eq('id', id)
    .eq('outcome', 'proposed')
    .select('id')
  if (error !== null) return { ok: false, error: `Could not dismiss that action: ${error.message}` }
  return { ok: true, value: data.length > 0 }
}

export interface UndoableAction {
  id: string
  tool: string
  targets: unknown[]
  familyLabel: string
}

/**
 * Claims an executed action for undoing — §8's undo window.
 *
 * Same compare-and-swap shape as `claimProposal`, with the window as an extra
 * condition, so an expired undo and a second tap both simply fail to match. The
 * row is marked undone BEFORE the rows are actually removed, which is the wrong
 * order for honesty and is why `abandonUndo` exists: if the removal then fails,
 * the claim is put back and the trail goes on saying the thing was sent, because
 * it still was. A trail that claims something was pulled back when it wasn't is
 * worse than no undo at all.
 */
export async function claimUndo(
  ctx: ToolContext,
  id: string,
  now: Date = new Date(),
): Promise<AuditResult<UndoableAction>> {
  const stamp = now.toISOString()
  const claimed = await ctx.caller.db
    .from('ai_audit_log')
    .update({ outcome: 'undone', undone_at: stamp })
    .eq('id', id)
    .eq('outcome', 'executed')
    .gt('undo_until', stamp)
    .select('id, tool, targets, family_label')

  if (claimed.error !== null) {
    return { ok: false, error: `Could not undo that: ${claimed.error.message}` }
  }
  const row = claimed.data[0]
  if (row === undefined) {
    const existing = await ctx.caller.db
      .from('ai_audit_log')
      .select('outcome, undo_until')
      .eq('id', id)
      .maybeSingle()
    if (existing.error !== null) {
      return { ok: false, error: `Could not undo that: ${existing.error.message}` }
    }
    if (existing.data === null) return { ok: false, error: 'That action no longer exists' }
    if (existing.data.outcome === 'undone') return { ok: false, error: 'That was already pulled back.' }
    if (existing.data.outcome !== 'executed') {
      return { ok: false, error: `That never went out (${existing.data.outcome}), so there is nothing to undo.` }
    }
    return { ok: false, error: 'The undo window for that has closed.' }
  }

  return {
    ok: true,
    value: { id: row.id, tool: row.tool, targets: row.targets, familyLabel: row.family_label },
  }
}

/** Puts a claimed undo back, when the removal itself failed. */
export async function abandonUndo(ctx: ToolContext, id: string, error: string): Promise<void> {
  const { error: writeError } = await ctx.caller.db
    .from('ai_audit_log')
    .update({ outcome: 'executed', undone_at: null, error: error.slice(0, 2000) })
    .eq('id', id)
  if (writeError !== null) console.error('[ro] abandonUndo failed', id, writeError.message)
}

/** Moves a proposal to its final state. */
export async function settle(
  ctx: ToolContext,
  id: string,
  outcome: Exclude<AuditOutcome, 'proposed'>,
  detail: { error?: string; undoUntilMs?: number; targets?: unknown[] } = {},
): Promise<void> {
  // Typed rather than a loose record: the generated Update shape rejects an
  // index signature, and an audit write is the last place to want a cast.
  const patch: { outcome: AuditOutcome; error?: string; targets?: unknown[]; undo_until?: string } =
    { outcome }
  if (detail.error !== undefined) patch.error = detail.error.slice(0, 2000)
  if (detail.targets !== undefined) patch.targets = detail.targets
  if (detail.undoUntilMs !== undefined) {
    patch.undo_until = new Date(Date.now() + detail.undoUntilMs).toISOString()
  }
  const { error } = await ctx.caller.db.from('ai_audit_log').update(patch).eq('id', id)
  // A failed audit update must not mask the outcome of the action itself, which
  // has already happened by this point. Logged loudly, not thrown.
  if (error !== null) console.error('[ro] audit settle failed', id, outcome, error.message)
}

/**
 * How much has actually gone out in the last hour — §8's rate limit, measured.
 *
 * Counts from the audit trail rather than from a counter, because the trail is
 * the thing that cannot drift: every send that happened has a row, whether it was
 * started from Ro, retried, or later undone. Undone sends are counted too. They
 * reached the portal before they were pulled back, so for the purpose of "is
 * something going wrong right now" they happened.
 */
export async function sendsInLastHour(
  ctx: ToolContext,
  now: Date = new Date(),
): Promise<AuditResult<{ actions: number; recipients: number }>> {
  const since = new Date(now.getTime() - 3_600_000).toISOString()
  const { data, error } = await ctx.caller.db
    .from('ai_audit_log')
    .select('arguments, outcome')
    .eq('risk_tier', 'send')
    .gte('at', since)
    .limit(500)
  if (error !== null) return { ok: false, error: `Could not check the send history: ${error.message}` }

  let actions = 0
  let recipients = 0
  for (const row of data) {
    if (row.outcome !== 'executed' && row.outcome !== 'undone') continue
    actions += 1
    const count = row.arguments.recipientCount
    recipients += typeof count === 'number' && Number.isFinite(count) ? Math.max(1, count) : 1
  }
  return { ok: true, value: { actions, recipients } }
}

/** The recent trail, for the activity feed. */
export async function recentActions(
  ctx: ToolContext,
  limit = 25,
): Promise<AuditResult<{ id: string; at: string; tool: string; outcome: string; summary: string }[]>> {
  const { data, error } = await ctx.caller.db
    .from('ai_audit_log')
    .select('id, at, tool, outcome, family_label, instruction')
    .order('at', { ascending: false })
    .limit(limit)
  if (error !== null) return { ok: false, error: error.message }
  return {
    ok: true,
    value: data.map((row) => ({
      id: row.id,
      at: row.at,
      tool: row.tool,
      outcome: row.outcome,
      summary: row.family_label.length > 0 ? `${row.tool} — ${row.family_label}` : row.tool,
    })),
  }
}

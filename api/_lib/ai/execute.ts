/**
 * The executor registry — where an approved proposal actually runs.
 *
 * This file is the single write path for every gated action, and
 * `api/ai/confirm.ts` is its only caller. That is the whole design: a tool that
 * needs her approval contains no write of its own, so there is no route from a
 * model's tool call to a changed record except through a proposal she tapped.
 * Phase 1's guarantee was "the gate is the absence of the tool"; this is the same
 * guarantee once the tools exist.
 *
 * An executor reads its arguments back out of the stored proposal rather than
 * being handed them. They were written before she saw the preview, so what runs
 * is what the preview described — the model gets no second turn between her
 * approval and the write. They come back out of jsonb as `unknown`, so they are
 * re-validated here through the same readers the tool used, not cast.
 *
 * `sendTarget` is how §7's send-time rule check becomes unskippable. Any executor
 * that puts a message in front of a family declares who it reaches, and the
 * generic path in confirm.ts checks the standing rules before dispatching. Put
 * inside each send executor instead, it would be one forgotten call away from a
 * message going to a family Melissa said to leave alone — which is the exact
 * failure `ai_standing_rules` exists to prevent.
 */

import type { Proposal } from './audit.js'
import { uid } from './ids.js'
import { retireRule, saveRule, type SendTarget } from './rules.js'
import { readPendingRule } from './tools/rules.js'
import { readInt, readString, type ToolContext } from './tools/kit.js'

/**
 * How long "undo" stays offered after a send — §8's undo window.
 *
 * Five minutes, and it is a real undo rather than a gesture: a send here writes
 * database rows and nothing else, so deleting them removes the message from the
 * parent's portal completely. §8 hedges with "if the transport allows"; with no
 * email integration in this codebase, it entirely does. The only thing undo
 * cannot take back is a parent who already had the portal open and read it,
 * which no window length fixes.
 */
const UNDO_WINDOW_MS = 5 * 60_000

/** The author fields on anything Ro sends. She writes as Melissa, not as herself. */
function authorOf(ctx: ToolContext): { author_id: string; author_name: string } {
  return {
    author_id: ctx.caller.id,
    // Same fallback as AdminMessages.tsx, so a profile with no name reads the
    // same whether the message came from the form or from Ro.
    author_name: ctx.caller.name.length > 0 ? ctx.caller.name : 'Aunties Tykes',
  }
}

export type ExecutionOutcome =
  | {
      ok: true
      /** One line for her, for the audit row and for the panel. */
      summary: string
      /** Ids of whatever was created or changed, for the audit row. */
      targets?: unknown[]
      /** How long "undo" stays offered, per §8. Omitted when undo is impossible. */
      undoMs?: number
    }
  | { ok: false; error: string }

export interface Executor {
  tool: string
  run: (ctx: ToolContext, proposal: Proposal) => Promise<ExecutionOutcome>
  /**
   * Set by anything that sends. Declaring it opts the executor into the
   * standing-rule check and the rate limit; returning null means this particular
   * proposal reaches nobody.
   */
  sendTarget?: (proposal: Proposal) => SendTarget | null
  /** How many families this proposal reaches, for §8's blast-radius accounting. */
  recipientCount?: (proposal: Proposal) => number
  /**
   * Takes it back, within §8's undo window. Set only where that is genuinely
   * possible — an executor without this one offers no undo rather than offering a
   * button that cannot deliver. `targets` is what the executed run recorded.
   */
  undo?: (ctx: ToolContext, targets: unknown[]) => Promise<ExecutionOutcome>
}

/** Reads the ids an executed run recorded, discarding anything else. */
function idsFrom(targets: unknown[]): string[] {
  return targets.filter((value): value is string => typeof value === 'string' && value.length > 0)
}

const saveRuleExecutor: Executor = {
  tool: 'rule.save',
  run: async (ctx, proposal) => {
    const pending = readPendingRule(proposal.arguments)
    if (typeof pending === 'string') return { ok: false, error: pending }

    const saved = await saveRule(ctx, {
      kind: pending.kind,
      said: pending.said,
      summary: pending.summary,
      familyId: pending.familyId,
      familyLabel: pending.familyLabel,
      channel: pending.channel,
      blocksSends: pending.blocksSends,
      holdUntil: pending.holdUntil,
    })
    if (!saved.ok) return { ok: false, error: saved.error }
    return { ok: true, summary: `Saved: ${pending.summary}`, targets: [saved.value.id] }
  },
}

const retireRuleExecutor: Executor = {
  tool: 'rule.retire',
  run: async (ctx, proposal) => {
    const ruleId = readString(proposal.arguments, 'ruleId')
    if (ruleId === null) return { ok: false, error: 'That action is missing the rule it referred to' }

    const retired = await retireRule(ctx, ruleId)
    if (!retired.ok) return { ok: false, error: retired.error }
    if (!retired.value) {
      // Turned off in the meantime — by her, or by a second tap on the same card.
      return { ok: false, error: 'That rule was already turned off' }
    }
    return { ok: true, summary: 'Rule turned off. It stays on record.', targets: [ruleId] }
  },
}

/**
 * Sends one message, mirroring `startThread` / `sendThreadMessage` in useStore.ts.
 *
 * Thread row first, then the message — the same order the store uses, and for the
 * store's stated reason: `threads.updated_at` drives the inbox ordering, and the
 * message rows reference the thread. The store's own comment records what
 * happened when that was got wrong ("the opening message stayed in the cache
 * alone, so it vanished on reload and the owner never saw it").
 */
const sendMessageExecutor: Executor = {
  tool: 'message.send',
  sendTarget: (proposal): SendTarget | null => {
    const familyId = readString(proposal.arguments, 'familyId')
    return familyId === null ? null : { familyIds: [familyId], channel: 'message' }
  },
  recipientCount: () => 1,
  run: async (ctx, proposal) => {
    const familyId = readString(proposal.arguments, 'familyId')
    const body = readString(proposal.arguments, 'body')
    const subject = readString(proposal.arguments, 'subject')
    if (familyId === null || body === null) {
      return { ok: false, error: 'That message is missing who it was for, or what it said' }
    }

    const now = new Date().toISOString()
    let threadId = readString(proposal.arguments, 'threadId')

    if (threadId === null) {
      if (subject === null) return { ok: false, error: 'That message has no subject' }
      threadId = uid('thr')
      const created = await ctx.caller.db
        .from('threads')
        .insert({ id: threadId, family_id: familyId, subject, updated_at: now })
      if (created.error !== null) {
        return { ok: false, error: `Could not start that conversation: ${created.error.message}` }
      }
    } else {
      // Re-checked at execution, not trusted from the proposal: the thread could
      // have been deleted, or (worse) the family boundary could have changed,
      // between her reading the preview and tapping it.
      const thread = await ctx.caller.db
        .from('threads')
        .select('id, family_id')
        .eq('id', threadId)
        .maybeSingle()
      if (thread.error !== null) {
        return { ok: false, error: `Could not read that conversation: ${thread.error.message}` }
      }
      if (thread.data === null) return { ok: false, error: 'That conversation no longer exists' }
      if (thread.data.family_id !== familyId) {
        return { ok: false, error: 'That conversation belongs to a different family now' }
      }
      const touched = await ctx.caller.db
        .from('threads')
        .update({ updated_at: now })
        .eq('id', threadId)
      if (touched.error !== null) {
        return { ok: false, error: `Could not update that conversation: ${touched.error.message}` }
      }
    }

    const messageId = uid('msg')
    const written = await ctx.caller.db.from('thread_messages').insert({
      id: messageId,
      thread_id: threadId,
      from_role: 'admin',
      body,
      at: now,
      ...authorOf(ctx),
    })
    if (written.error !== null) {
      return { ok: false, error: `Could not send that message: ${written.error.message}` }
    }

    return {
      ok: true,
      summary: `Sent to ${proposal.familyLabel}. They'll see it in their portal.`,
      targets: [threadId, messageId],
      undoMs: UNDO_WINDOW_MS,
    }
  },
  undo: async (ctx, targets) => {
    const [threadId, messageId] = idsFrom(targets)
    if (threadId === undefined || messageId === undefined) {
      return { ok: false, error: 'I did not record enough about that send to take it back' }
    }

    const removed = await ctx.caller.db.from('thread_messages').delete().eq('id', messageId)
    if (removed.error !== null) {
      return { ok: false, error: `Could not pull that message back: ${removed.error.message}` }
    }

    // A conversation Ro started and then unsent would otherwise sit in the inbox
    // as an empty thread. Removed only when nothing else is in it — a reply that
    // was undone must never take an existing conversation down with it.
    const remaining = await ctx.caller.db
      .from('thread_messages')
      .select('id')
      .eq('thread_id', threadId)
      .limit(1)
    if (remaining.error === null && remaining.data.length === 0) {
      await ctx.caller.db.from('threads').delete().eq('id', threadId)
    }

    return { ok: true, summary: 'Pulled back. It is gone from their portal.' }
  },
}

/** Posts one announcement, mirroring `addAnnouncement` in useStore.ts. */
const sendAnnouncementExecutor: Executor = {
  tool: 'announcement.send',
  sendTarget: (proposal): SendTarget | null => {
    const audience = readString(proposal.arguments, 'audience')
    if (audience === null) return null
    return {
      familyIds: audience === 'all' ? 'all' : [audience],
      channel: 'announcement',
    }
  },
  recipientCount: (proposal) => readInt(proposal.arguments, 'recipientCount', 1, 500, 1),
  run: async (ctx, proposal) => {
    const audience = readString(proposal.arguments, 'audience')
    const title = readString(proposal.arguments, 'title')
    const body = readString(proposal.arguments, 'body')
    if (audience === null || title === null || body === null) {
      return { ok: false, error: 'That announcement is missing its audience, title or wording' }
    }

    const id = uid('an')
    const written = await ctx.caller.db.from('announcements').insert({
      id,
      title,
      body,
      // NULL is the app's 'all' audience — see fromAnnouncement in src/lib/db.ts.
      audience_family_id: audience === 'all' ? null : audience,
      date: new Date().toISOString(),
    })
    if (written.error !== null) {
      return { ok: false, error: `Could not post that announcement: ${written.error.message}` }
    }

    const reach = readInt(proposal.arguments, 'recipientCount', 1, 500, 1)
    return {
      ok: true,
      summary:
        reach > 1
          ? `Posted to ${String(reach)} families. They'll see it in their portals.`
          : `Posted for ${proposal.familyLabel}. They'll see it in their portal.`,
      targets: [id],
      undoMs: UNDO_WINDOW_MS,
    }
  },
  undo: async (ctx, targets) => {
    const [id] = idsFrom(targets)
    if (id === undefined) {
      return { ok: false, error: 'I did not record enough about that post to take it back' }
    }
    const removed = await ctx.caller.db.from('announcements').delete().eq('id', id)
    if (removed.error !== null) {
      return { ok: false, error: `Could not pull that announcement back: ${removed.error.message}` }
    }
    return { ok: true, summary: 'Pulled back. It is gone from their portals.' }
  },
}

const executors: Executor[] = [
  saveRuleExecutor,
  retireRuleExecutor,
  sendMessageExecutor,
  sendAnnouncementExecutor,
]

const byTool = new Map<string, Executor>(executors.map((executor) => [executor.tool, executor]))

/**
 * The executor for a proposed tool, or undefined.
 *
 * Undefined is a real case worth handling rather than asserting away: an audit
 * row outlives the code that wrote it, so a proposal made before a deploy can be
 * approved after one that no longer has that tool. Better to tell her the action
 * can no longer be run than to crash on her tap.
 */
export function findExecutor(tool: string): Executor | undefined {
  return byTool.get(tool)
}

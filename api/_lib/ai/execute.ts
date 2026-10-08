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
import type { Incident } from '../../../src/types.js'
import { uid } from './ids.js'
import { retireRule, saveRule, type SendTarget } from './rules.js'
import { readPendingRule } from './tools/rules.js'
import { readAmount, readInvoiceBalance, readMethod, toCents } from './tools/billing.js'
import { DEFAULT_TEACHER, exactPattern, pickHue, readPendingFamily } from './tools/families.js'
import { emailInUse, LOGIN_SECRET, readPendingLogin } from './tools/accounts.js'
import { familyWithEmail, readEnrollmentSnapshot } from './tools/enrollments.js'
import { createParentAccount } from '../parentLogin.js'
import { money } from './projection.js'
import { readInt, readString, type ToolContext } from './tools/kit.js'
import { attendanceId, mergeIncident, readIncidentArgs, stampTime } from './tools/records.js'

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
  /**
   * `secret` is the value she typed on the card at her tap, or null. Only an
   * executor that declares `secret` below is ever handed one — approval.ts
   * refuses a secret sent for any other — and it must not be returned, logged or
   * put into an outcome.
   */
  run: (ctx: ToolContext, proposal: Proposal, secret: string | null) => Promise<ExecutionOutcome>
  /**
   * Declared by an executor that needs a value typed at her tap. approval.ts
   * checks the length BEFORE claiming the proposal, so a short password leaves
   * the card live to correct rather than spent.
   */
  secret?: { minLength: number; maxLength: number }
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

/**
 * Sets attendance, mirroring `checkIn` / `checkOut` / `markAbsent` in useStore.ts.
 *
 * `attendance` carries `unique (child_id, date)`, so this reads before it writes
 * rather than blind-inserting — the same shape the store's own upsert-by-hand
 * takes. Re-read at execution, not trusted from the proposal: she may have
 * checked the child in from the attendance sheet in the meantime.
 */
const attendanceExecutor: Executor = {
  tool: 'attendance.set',
  run: async (ctx, proposal) => {
    const childId = readString(proposal.arguments, 'childId')
    const date = readString(proposal.arguments, 'date')
    const action = readString(proposal.arguments, 'action')
    const note = readString(proposal.arguments, 'note') ?? ''
    if (childId === null || date === null || action === null) {
      return { ok: false, error: 'That attendance change is missing who or when it was for' }
    }

    const existing = await ctx.caller.db
      .from('attendance')
      .select('id, check_out')
      .eq('child_id', childId)
      .eq('date', date)
      .maybeSingle()
    if (existing.error !== null) {
      return { ok: false, error: `Could not read that attendance record: ${existing.error.message}` }
    }

    const at = stampTime()
    const label = proposal.childLabel.length > 0 ? proposal.childLabel : 'They'

    if (action === 'out') {
      if (existing.data === null) return { ok: false, error: 'There is no record for them that day' }
      if (existing.data.check_out !== null) return { ok: false, error: 'They were already checked out' }
      const done = await ctx.caller.db
        .from('attendance')
        .update({ check_out: at, status: 'checked-out' })
        .eq('id', existing.data.id)
      if (done.error !== null) return { ok: false, error: `Could not check them out: ${done.error.message}` }
      return { ok: true, summary: `${label} checked out at ${at}.`, targets: [existing.data.id] }
    }

    const patch =
      action === 'absent'
        ? { status: 'absent' as const, check_in: null, check_out: null, note }
        : { status: 'present' as const, check_in: at, check_out: null }

    if (existing.data !== null) {
      const done = await ctx.caller.db.from('attendance').update(patch).eq('id', existing.data.id)
      if (done.error !== null) return { ok: false, error: `Could not update that record: ${done.error.message}` }
      return {
        ok: true,
        summary: action === 'absent' ? `${label} marked absent.` : `${label} checked in at ${at}.`,
        targets: [existing.data.id],
      }
    }

    const id = attendanceId()
    const created = await ctx.caller.db
      .from('attendance')
      .insert({ id, child_id: childId, date, note: action === 'absent' ? note : '', ...patch })
    if (created.error !== null) {
      return { ok: false, error: `Could not record that: ${created.error.message}` }
    }
    return {
      ok: true,
      summary: action === 'absent' ? `${label} marked absent.` : `${label} checked in at ${at}.`,
      targets: [id],
    }
  },
}

/** Writes or updates one daily log, mirroring `addDailyLog` / `updateDailyLog`. */
const dailyLogExecutor: Executor = {
  tool: 'dailyLog.write',
  run: async (ctx, proposal) => {
    const childId = readString(proposal.arguments, 'childId')
    const date = readString(proposal.arguments, 'date')
    if (childId === null || date === null) {
      return { ok: false, error: 'That log is missing who or when it was for' }
    }

    const rawFields = proposal.arguments.fields
    const fields: Record<string, string> = {}
    if (typeof rawFields === 'object' && rawFields !== null) {
      for (const [key, value] of Object.entries(rawFields as Record<string, unknown>)) {
        if (typeof value === 'string') fields[key] = value
      }
    }
    const rawActivities = proposal.arguments.activities
    const activities = Array.isArray(rawActivities)
      ? rawActivities.filter((entry): entry is string => typeof entry === 'string')
      : null

    const incidentChanges = readIncidentArgs(proposal.arguments.incident)
    const removeIncident = proposal.arguments.removeIncident === true

    // Re-read rather than trusting the proposal's logId: she may have written the
    // log herself between reading this and tapping it.
    const existing = await ctx.caller.db
      .from('daily_logs')
      .select('id, incident')
      .eq('child_id', childId)
      .eq('date', date)
      .maybeSingle()
    if (existing.error !== null) {
      return { ok: false, error: `Could not read that log: ${existing.error.message}` }
    }

    const label = proposal.childLabel.length > 0 ? proposal.childLabel : 'that child'

    // Merged against the incident as it is now, not as it was when proposed.
    let incident: Incident | null | undefined
    if (removeIncident) {
      incident = null
    } else if (incidentChanges !== null) {
      const merged = mergeIncident(existing.data?.incident ?? null, incidentChanges, new Date().toISOString())
      if (!merged.ok) {
        return { ok: false, error: `The incident report is missing: ${merged.missing.join(', ')}` }
      }
      incident = merged.incident
    }

    if (existing.data !== null) {
      // Typed rather than a loose record: the generated Update shape rejects an
      // index signature, and a silent cast here would let a stray key through to
      // a child's record.
      const patch: {
        meals?: string
        naps?: string
        potty?: string
        mood?: string
        notes?: string
        activities?: string[]
        incident?: Incident | null
      } = {}
      if (fields.meals !== undefined) patch.meals = fields.meals
      if (fields.naps !== undefined) patch.naps = fields.naps
      if (fields.potty !== undefined) patch.potty = fields.potty
      if (fields.mood !== undefined) patch.mood = fields.mood
      if (fields.notes !== undefined) patch.notes = fields.notes
      if (activities !== null) patch.activities = activities
      if (incident !== undefined) patch.incident = incident
      const done = await ctx.caller.db.from('daily_logs').update(patch).eq('id', existing.data.id)
      if (done.error !== null) return { ok: false, error: `Could not update that log: ${done.error.message}` }
      return { ok: true, summary: `Updated ${label}'s log.`, targets: [existing.data.id] }
    }

    const id = uid('dl')
    const created = await ctx.caller.db.from('daily_logs').insert({
      id,
      child_id: childId,
      date,
      meals: fields.meals ?? '',
      naps: fields.naps ?? '',
      potty: fields.potty ?? '',
      mood: fields.mood ?? '',
      notes: fields.notes ?? '',
      activities: activities ?? [],
      incident: incident ?? null,
      // Written as her, the same as a log typed into the console.
      author: ctx.caller.name.length > 0 ? ctx.caller.name : 'Aunties Tykes',
      author_id: ctx.caller.id,
    })
    if (created.error !== null) {
      return { ok: false, error: `Could not save that log: ${created.error.message}` }
    }
    return { ok: true, summary: `Saved ${label}'s log.`, targets: [id] }
  },
}

/** Adds or changes one calendar event, mirroring `addCalendarEvent` / `updateCalendarEvent`. */
const calendarExecutor: Executor = {
  tool: 'calendar.mutate',
  run: async (ctx, proposal) => {
    const eventId = readString(proposal.arguments, 'eventId')
    const kind = readString(proposal.arguments, 'kind')
    const title = readString(proposal.arguments, 'title')
    const note = readString(proposal.arguments, 'note')
    const startsOn = readString(proposal.arguments, 'startsOn')
    const endsOn = readString(proposal.arguments, 'endsOn')
    const closesAt = readString(proposal.arguments, 'closesAt')
    const rawVisible = proposal.arguments.visibleToParents
    const visible = typeof rawVisible === 'boolean' ? rawVisible : null

    if (eventId === null) {
      if (kind === null || title === null || startsOn === null) {
        return { ok: false, error: 'That event is missing its kind, title or date' }
      }
      const id = uid('cal')
      const created = await ctx.caller.db.from('calendar_events').insert({
        id,
        kind: kind as 'closure' | 'early_close' | 'activity' | 'reminder',
        title,
        note: note ?? '',
        starts_on: startsOn,
        ends_on: endsOn,
        closes_at: closesAt,
        visible_to_parents: visible ?? true,
        created_by: ctx.caller.id,
      })
      if (created.error !== null) {
        return { ok: false, error: `Could not add that to the calendar: ${created.error.message}` }
      }
      return { ok: true, summary: `"${title}" is on the calendar.`, targets: [id] }
    }

    // Only the fields she was shown are written; anything omitted keeps its value.
    const patch: {
      kind?: 'closure' | 'early_close' | 'activity' | 'reminder'
      title?: string
      note?: string
      starts_on?: string
      ends_on?: string | null
      closes_at?: string | null
      visible_to_parents?: boolean
    } = {}
    if (kind !== null) patch.kind = kind as 'closure' | 'early_close' | 'activity' | 'reminder'
    if (title !== null) patch.title = title
    if (note !== null) patch.note = note
    if (startsOn !== null) patch.starts_on = startsOn
    if (endsOn !== null) patch.ends_on = endsOn
    if (closesAt !== null) patch.closes_at = closesAt
    if (visible !== null) patch.visible_to_parents = visible
    if (Object.keys(patch).length === 0) return { ok: false, error: 'There was nothing to change' }

    const done = await ctx.caller.db.from('calendar_events').update(patch).eq('id', eventId).select('id')
    if (done.error !== null) return { ok: false, error: `Could not change that event: ${done.error.message}` }
    if (done.data.length === 0) return { ok: false, error: 'That event no longer exists' }
    return { ok: true, summary: 'Calendar updated.', targets: [eventId] }
  },
}

/** Records or updates one enquiry, mirroring `addLead` / `updateLead`. */
const leadExecutor: Executor = {
  tool: 'lead.mutate',
  run: async (ctx, proposal) => {
    const leadId = readString(proposal.arguments, 'leadId')
    const parentName = readString(proposal.arguments, 'parentName')
    const email = readString(proposal.arguments, 'email')
    const phone = readString(proposal.arguments, 'phone')
    const childAges = readString(proposal.arguments, 'childAges')
    const message = readString(proposal.arguments, 'message')
    const tourDate = readString(proposal.arguments, 'tourDate')
    const status = readString(proposal.arguments, 'status')

    if (leadId === null) {
      if (parentName === null) return { ok: false, error: 'That enquiry has no parent name' }
      const id = uid('ld')
      const created = await ctx.caller.db.from('leads').insert({
        id,
        parent_name: parentName,
        email: email ?? '',
        phone: phone ?? '',
        child_ages: childAges ?? '',
        message: message ?? '',
        tour_date: tourDate,
        // The console's own default for a new lead.
        status: status ?? 'New inquiry',
      })
      if (created.error !== null) {
        return { ok: false, error: `Could not save that enquiry: ${created.error.message}` }
      }
      return { ok: true, summary: `Saved the enquiry from ${parentName}.`, targets: [id] }
    }

    const patch: {
      parent_name?: string
      email?: string
      phone?: string
      child_ages?: string
      message?: string
      tour_date?: string | null
      status?: string
    } = {}
    if (parentName !== null) patch.parent_name = parentName
    if (email !== null) patch.email = email
    if (phone !== null) patch.phone = phone
    if (childAges !== null) patch.child_ages = childAges
    if (message !== null) patch.message = message
    if (tourDate !== null) patch.tour_date = tourDate
    if (status !== null) patch.status = status
    if (Object.keys(patch).length === 0) return { ok: false, error: 'There was nothing to change' }

    const done = await ctx.caller.db.from('leads').update(patch).eq('id', leadId).select('id')
    if (done.error !== null) return { ok: false, error: `Could not update that enquiry: ${done.error.message}` }
    if (done.data.length === 0) return { ok: false, error: 'That enquiry no longer exists' }
    return { ok: true, summary: 'Enquiry updated.', targets: [leadId] }
  },
}

/** Shows or hides one document, mirroring `toggleDocVisibility`. */
const documentExecutor: Executor = {
  tool: 'document.manage',
  run: async (ctx, proposal) => {
    const documentId = readString(proposal.arguments, 'documentId')
    const rawVisible = proposal.arguments.visibleToParents
    if (documentId === null || typeof rawVisible !== 'boolean') {
      return { ok: false, error: 'That change is missing the document or what to do with it' }
    }
    const done = await ctx.caller.db
      .from('documents')
      .update({ visible_to_parents: rawVisible })
      .eq('id', documentId)
      .select('id, title')
    if (done.error !== null) return { ok: false, error: `Could not change that: ${done.error.message}` }
    const row = done.data[0]
    if (row === undefined) return { ok: false, error: 'That document no longer exists' }
    return {
      ok: true,
      summary: rawVisible ? `"${row.title}" is visible to parents now.` : `"${row.title}" is hidden from parents.`,
      targets: [documentId],
    }
  },
}

/**
 * Records one payment, mirroring `recordPayment` in useStore.ts.
 *
 * The balance is read again here rather than trusted from the proposal: a payment
 * may have been recorded from the invoice page between her reading this card and
 * tapping it. If what is owed has dropped below the amount she approved, nothing
 * is written — recording a smaller figure than the one on the card would be
 * running something she did not approve, and recording the full one would
 * overpay the invoice. She is told the new balance and can ask again.
 *
 * No undo, deliberately, matching the console: §8's undo window is about sends,
 * and the invoice page has no way to remove a recorded payment either.
 */
const recordPaymentExecutor: Executor = {
  tool: 'payment.record',
  run: async (ctx, proposal) => {
    const invoiceId = readString(proposal.arguments, 'invoiceId')
    const amount = readAmount(proposal.arguments, 'amount')
    const method = readMethod(proposal.arguments, 'method')
    const reference = readString(proposal.arguments, 'reference') ?? ''
    if (invoiceId === null || amount === null || method === null) {
      return { ok: false, error: 'That payment is missing its invoice, amount or method' }
    }

    const invoice = await readInvoiceBalance(ctx, invoiceId)
    if (!invoice.ok) return { ok: false, error: invoice.error }
    if (!invoice.found) return { ok: false, error: 'That invoice no longer exists' }
    if (invoice.balance < amount) {
      return {
        ok: false,
        error:
          invoice.balance <= 0
            ? 'That invoice was paid in full in the meantime. Nothing was recorded.'
            : `Only ${money(invoice.balance)} is owed on it now, so I did not record ` +
              `${money(amount)}. Nothing was recorded — ask me again with the right amount.`,
      }
    }

    const id = uid('pay')
    const written = await ctx.caller.db.from('payments').insert({
      id,
      invoice_id: invoiceId,
      date: ctx.today,
      amount,
      method,
      ref: reference,
    })
    if (written.error !== null) {
      return { ok: false, error: `Could not record that payment: ${written.error.message}` }
    }

    const remaining = toCents(invoice.balance - amount)
    return {
      ok: true,
      summary:
        `Recorded ${money(amount)} by ${method} on ${invoiceId}. ` +
        (remaining <= 0.001 ? 'Paid in full.' : `${money(remaining)} still owed.`),
      targets: [invoiceId, id],
    }
  },
}

/**
 * Adds one family and its children, mirroring `addFamily` + `addChild` in
 * useStore.ts as the Families page's "Add family" dialog calls them.
 *
 * The email is checked again here, not trusted from the proposal: the same family
 * may have been added from the console, or by an approved enrollment, while the
 * card sat waiting.
 *
 * Family first, then the children, because each child row references it. If the
 * children fail, the family row is removed again — the same roll-back
 * `create-parent-login.ts` does — so a failure never leaves a family on file
 * without the children she was shown. The delete cascades to any child rows that
 * did land.
 *
 * No undo: §8's undo window covers sends, and deleting a family is a deletion,
 * which nothing in Ro does (§3).
 */
const addFamilyExecutor: Executor = {
  tool: 'family.add',
  run: async (ctx, proposal) => {
    const pending = readPendingFamily(proposal.arguments, ctx.today)
    if (typeof pending === 'string') return { ok: false, error: `That family could not be read back: ${pending}` }

    const clash = await ctx.caller.db
      .from('families')
      .select('name')
      .ilike('email', exactPattern(pending.email))
      .limit(1)
    if (clash.error !== null) return { ok: false, error: `Could not check for that family: ${clash.error.message}` }
    const existing = clash.data[0]
    if (existing !== undefined) {
      return { ok: false, error: `${existing.name} already uses ${pending.email}, so nothing was added.` }
    }

    const familyId = uid('fam')
    const created = await ctx.caller.db.from('families').insert({
      id: familyId,
      name: pending.name,
      primary_contact: pending.primaryContact,
      relation: pending.relation,
      email: pending.email,
      phone: pending.phone,
      address: pending.address,
      secondary: { name: '', relation: '', phone: '' },
      emergency: [],
      joined_at: ctx.today,
      notes: pending.notes,
      custom_weekly_rate: null,
    })
    if (created.error !== null) {
      return { ok: false, error: `Could not add that family: ${created.error.message}` }
    }

    const childIds: string[] = []
    if (pending.children.length > 0) {
      // The hue cycles on how many children exist, as the store's pickHue does.
      const counted = await ctx.caller.db.from('children').select('id', { count: 'exact', head: true })
      const offset = counted.error === null ? (counted.count ?? 0) : 0

      const rows = pending.children.map((child, index) => {
        const id = uid('chd')
        childIds.push(id)
        return {
          id,
          family_id: familyId,
          name: child.name,
          dob: child.dob,
          age_group: child.ageGroup,
          status: child.status,
          plan: child.plan,
          start_date: child.startDate,
          teacher: DEFAULT_TEACHER,
          allergies: child.allergies,
          medications: child.medications,
          notes: child.notes,
          hue: pickHue(offset + index),
        }
      })
      const added = await ctx.caller.db.from('children').insert(rows)
      if (added.error !== null) {
        const rolledBack = await ctx.caller.db.from('families').delete().eq('id', familyId)
        return {
          ok: false,
          error:
            `Could not add the children: ${added.error.message}. ` +
            (rolledBack.error === null
              ? 'The family was taken back off too, so nothing is half-added.'
              : `The family itself did save and could not be removed (${rolledBack.error.message}) — ` +
                'check Families and delete it there.'),
        }
      }
    }

    const names = pending.children.map((child) => child.name)
    return {
      ok: true,
      summary:
        names.length === 0
          ? `${pending.name} added to Families.`
          : `${pending.name} added to Families, with ${names.join(' and ')}.`,
      targets: [familyId, ...childIds],
    }
  },
}

/**
 * Creates one parent login, through the same `createParentAccount` the console's
 * endpoint uses — so the auth user, the profile and the roll-back between them
 * are one implementation, not two.
 *
 * `secret` is the password she typed on the card. approval.ts has already checked
 * its length before claiming; it is handed to createParentAccount and to nothing
 * else, and no outcome below contains it.
 *
 * The family and the email are re-checked first: the family could have been
 * removed, or the email given to someone else from the console, while the card
 * waited. No undo — removing a login is a deletion, which nothing in Ro does.
 */
const createParentLoginExecutor: Executor = {
  tool: 'account.create',
  secret: LOGIN_SECRET,
  run: async (ctx, proposal, secret) => {
    if (secret === null) return { ok: false, error: 'No password was given, so no login was made.' }
    const pending = readPendingLogin(proposal.arguments)
    if (typeof pending === 'string') return { ok: false, error: pending }

    const family = await ctx.caller.db.from('families').select('id').eq('id', pending.familyId).maybeSingle()
    if (family.error !== null) return { ok: false, error: `Could not read that family: ${family.error.message}` }
    if (family.data === null) return { ok: false, error: 'That family is no longer on file, so no login was made.' }

    const taken = await emailInUse(ctx, pending.email)
    if (!taken.ok) return { ok: false, error: taken.error }
    if (taken.value) return { ok: false, error: `A login already uses ${pending.email}, so no new one was made.` }

    const created = await createParentAccount({
      familyId: pending.familyId,
      name: pending.name,
      email: pending.email,
      password: secret,
      preferredLanguage: pending.preferredLanguage,
    })
    if (!created.ok) return { ok: false, error: created.error }

    return {
      ok: true,
      summary:
        `${pending.name} can sign in to the ${pending.familyName} portal with ${pending.email}. ` +
        'No email went out — give them the login yourself.',
      targets: [created.id],
    }
  },
}

/**
 * Approves or declines one enrollment form, mirroring `approveEnrollment` /
 * `declineEnrollment` in useStore.ts.
 *
 * The order is the safety property, and it differs from the console's on purpose:
 *
 *  1. For an approval, the email is checked against existing families first —
 *     before anything is changed, so a clash costs nothing to back out of.
 *  2. The form is claimed: `pending` -> the decision, in one conditional update.
 *     Nothing matched means someone already decided it — in the console, or by a
 *     second tap — and nothing further runs. This is what stops one form
 *     becoming two families.
 *  3. Only then are the family and children written. If either fails, the
 *     family is removed (which cascades to any child rows that landed) and the
 *     form is put back to pending, so a failure never leaves a family on file
 *     for a form that still says it is waiting, or the reverse.
 *  4. The form is linked to the family it created.
 *
 * No undo: taking back an approval means deleting a family, and nothing in Ro
 * deletes (§3). A declined form stays declined, as it does in the console.
 */
const decideEnrollmentExecutor: Executor = {
  tool: 'enrollment.decide',
  run: async (ctx, proposal) => {
    const enrollmentId = readString(proposal.arguments, 'enrollmentId')
    const decision = readString(proposal.arguments, 'decision')
    if (enrollmentId === null || (decision !== 'approve' && decision !== 'decline')) {
      return { ok: false, error: 'That action is missing the form or the decision' }
    }
    const label = proposal.familyLabel.length > 0 ? proposal.familyLabel : 'That family'
    const stamp = new Date().toISOString()

    /** pending -> decided, or false when it was no longer pending. */
    const claim = async (status: 'approved' | 'declined'): Promise<boolean | string> => {
      const claimed = await ctx.caller.db
        .from('enrollments')
        .update({ status, reviewed_at: stamp })
        .eq('id', enrollmentId)
        .eq('status', 'pending')
        .select('id')
      if (claimed.error !== null) return `Could not update that form: ${claimed.error.message}`
      return claimed.data.length > 0
    }
    const alreadyDecided = async (): Promise<string> => {
      const current = await ctx.caller.db.from('enrollments').select('status').eq('id', enrollmentId).maybeSingle()
      if (current.error !== null || current.data === null) return 'That form no longer exists. Nothing was changed.'
      return `That form was already ${current.data.status}. Nothing was changed.`
    }

    if (decision === 'decline') {
      const claimed = await claim('declined')
      if (typeof claimed === 'string') return { ok: false, error: claimed }
      if (!claimed) return { ok: false, error: await alreadyDecided() }
      return {
        ok: true,
        summary: `Declined the form from ${label}. They have not been told — let them know yourself.`,
        targets: [enrollmentId],
      }
    }

    const snapshot = readEnrollmentSnapshot(proposal.arguments)
    if (typeof snapshot === 'string') {
      return { ok: false, error: `That form could not be read back: ${snapshot}. Nothing was changed.` }
    }

    const clash = await familyWithEmail(ctx, snapshot.email)
    if (!clash.ok) return { ok: false, error: clash.error }
    if (clash.value !== null) {
      return {
        ok: false,
        error: `${clash.value.name} already uses ${snapshot.email}, so the form was not approved.`,
      }
    }

    const claimed = await claim('approved')
    if (typeof claimed === 'string') return { ok: false, error: claimed }
    if (!claimed) return { ok: false, error: await alreadyDecided() }

    /** Step 3's back-out: the form returns to pending, as if never tapped. */
    const release = async (): Promise<string> => {
      const released = await ctx.caller.db
        .from('enrollments')
        .update({ status: 'pending', reviewed_at: null, created_family_id: null })
        .eq('id', enrollmentId)
      return released.error === null
        ? 'The form is back to waiting on you.'
        : `The form could not be put back to pending (${released.error.message}) — check Future Arrivals.`
    }

    const familyId = uid('fam')
    const created = await ctx.caller.db.from('families').insert({
      id: familyId,
      name: snapshot.familyName,
      primary_contact: snapshot.primaryContact,
      relation: snapshot.relation,
      email: snapshot.email,
      phone: snapshot.phone,
      address: snapshot.address,
      secondary: snapshot.secondary,
      emergency: snapshot.emergency,
      joined_at: ctx.today,
      notes: snapshot.notes,
      custom_weekly_rate: null,
    })
    if (created.error !== null) {
      return { ok: false, error: `Could not add the family: ${created.error.message}. ${await release()}` }
    }

    const childIds: string[] = []
    if (snapshot.children.length > 0) {
      const counted = await ctx.caller.db.from('children').select('id', { count: 'exact', head: true })
      const offset = counted.error === null ? (counted.count ?? 0) : 0
      const rows = snapshot.children.map((child, index) => {
        const id = uid('chd')
        childIds.push(id)
        return {
          id,
          family_id: familyId,
          name: child.name,
          dob: child.dob,
          age_group: child.ageGroup,
          status: 'active' as const,
          plan: child.plan,
          schedule: child.schedule,
          start_date: child.startDate.length > 0 ? child.startDate : null,
          teacher: DEFAULT_TEACHER,
          allergies: child.allergies,
          medications: child.medications,
          notes: child.notes,
          hue: pickHue(offset + index),
        }
      })
      const added = await ctx.caller.db.from('children').insert(rows)
      if (added.error !== null) {
        const removed = await ctx.caller.db.from('families').delete().eq('id', familyId)
        const familyNote =
          removed.error === null
            ? 'The family was taken back off the roster.'
            : `The family itself did save and could not be removed (${removed.error.message}) — check Families.`
        return {
          ok: false,
          error: `Could not add the children: ${added.error.message}. ${familyNote} ${await release()}`,
        }
      }
    }

    // The family exists and the form says approved; only the link between them is
    // left. A failure here is reported but not rolled back — undoing a complete,
    // correct enrollment over a missing cross-reference would be the worse outcome.
    const linked = await ctx.caller.db
      .from('enrollments')
      .update({ created_family_id: familyId })
      .eq('id', enrollmentId)
    const names = snapshot.children.map((child) => child.name)
    return {
      ok: true,
      summary:
        `Approved. ${snapshot.familyName} is on the roster` +
        (names.length > 0 ? ` with ${names.join(' and ')}` : '') +
        '. They have not been told and have no login yet — ask me to set one up.' +
        (linked.error === null ? '' : ' (The form could not be linked to the new family; everything else saved.)'),
      targets: [enrollmentId, familyId, ...childIds],
    }
  },
}

const executors: Executor[] = [
  saveRuleExecutor,
  retireRuleExecutor,
  sendMessageExecutor,
  sendAnnouncementExecutor,
  attendanceExecutor,
  dailyLogExecutor,
  calendarExecutor,
  leadExecutor,
  documentExecutor,
  recordPaymentExecutor,
  addFamilyExecutor,
  createParentLoginExecutor,
  decideEnrollmentExecutor,
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

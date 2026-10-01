/**
 * What Ro notices without being asked — plan §5.
 *
 * Seven watchers, each a plain read evaluated by ordinary code. No model call
 * happens anywhere in this file, and that is the point: whether an invoice is
 * actually overdue is a fact to look up, not a judgment to risk a model on.
 * §8's "no invented facts" guardrail depends on this boundary holding, so every
 * `summary` string below is built here, from real columns, before any model sees
 * it. The Tier-1 pass in §5 may reorder these and choose the wording it leads
 * with; it may not add a trigger, drop one, or change a number.
 *
 * Cooldowns and quiet hours, and why they are not enforced here yet: §5 wants
 * both so Melissa is not pinged five times about one thing or at 9pm on a
 * Sunday. Suppression needs somewhere to record "already mentioned this", and
 * that store arrives with Phase 2, when the notices actually get delivered
 * unattended (§13.3). In Phase 1 nothing is pushed at her — she asks "what's
 * going on today?" and this sweep answers, so suppressing a result she
 * explicitly asked for would be the wrong behavior. `quietHours` is therefore
 * computed and reported, not applied, and every trigger carries a stable `key`
 * so Phase 2 has something to dedupe and cool down against.
 */

import { daysSince, timeInZone } from './clock.js'
import { invoiceState, money } from './projection.js'
import type { ToolContext } from './tools/kit.js'

export type TriggerKind =
  | 'daily_log_missing'
  | 'payment_overdue'
  | 'enrollment_new'
  | 'enrollment_stale'
  | 'ack_pending'
  | 'unanswered_message'
  | 'cold_lead'

export type TriggerPriority = 'low' | 'medium' | 'high'

export interface Trigger {
  kind: TriggerKind
  priority: TriggerPriority
  /**
   * Stable across sweeps for the same underlying thing, so Phase 2 can tell
   * "still true" from "new since last time" without re-deriving it.
   */
  key: string
  /** A factual sentence, assembled from columns. Never model-written. */
  summary: string
  /** The same facts, structured, for anything that wants to render them. */
  facts: Record<string, string | number | boolean | null>
  /** How long the condition has been true, where age is meaningful. */
  ageDays: number | null
}

export interface TriggerSweep {
  date: string
  time: string
  /**
   * True outside 7am–8pm at the daycare. Reported for Phase 2's delivery
   * decision; this sweep does not withhold anything because of it.
   */
  quietHours: boolean
  counts: Record<TriggerPriority, number>
  triggers: Trigger[]
}

/* -------------------------------- thresholds ------------------------------- */

/** An invoice this far past due stops being routine. */
const OVERDUE_HIGH_DAYS = 7
/** A pending enrollment older than this is sitting too long for a small daycare. */
const ENROLLMENT_STALE_DAYS = 3
/** A parent waiting longer than this has been waiting a working day. */
const UNANSWERED_HIGH_DAYS = 1
/**
 * A parent message younger than this is not "unanswered", it is recent. Keeps
 * the sweep from flagging something she read four minutes ago.
 */
const UNANSWERED_FLOOR_HOURS = 3
/** A lead with no movement for this long has gone cold. */
const COLD_LEAD_DAYS = 7
/** Quiet hours boundaries, local to the daycare. */
const QUIET_BEFORE = '07:00'
const QUIET_AFTER = '20:00'

/**
 * Lead statuses that mean the lead is finished either way, so it can never be
 * cold. Everything else — including the Postgres column default 'new' and the
 * 'New inquiry' the app actually writes, which are two spellings of the same
 * state — stays in play. The open set is not hardcoded on purpose: the status
 * column is free text and the admin UI's list may grow.
 */
const CLOSED_LEAD_STATUSES = new Set(['enrolled', 'not a fit'])

/* --------------------------------- helpers -------------------------------- */

/**
 * Outside 7am-8pm at the daycare. Exported because Phase 2's delivery step is
 * the real consumer — this sweep only reports it.
 */
export function isQuietHours(time: string): boolean {
  return time < QUIET_BEFORE || time >= QUIET_AFTER
}

/** Hours between an ISO timestamp and now. Negative for the future. */
function hoursSince(iso: string, now: Date): number | null {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  return (now.getTime() - then) / 3_600_000
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

function rank(trigger: Trigger): number {
  const byPriority = trigger.priority === 'high' ? 0 : trigger.priority === 'medium' ? 1 : 2
  return byPriority
}

/** high first, then medium, then low; within a priority, the longest-standing. */
export function sortTriggers(triggers: Trigger[]): Trigger[] {
  return [...triggers].sort((a, b) => {
    const priority = rank(a) - rank(b)
    if (priority !== 0) return priority
    return (b.ageDays ?? 0) - (a.ageDays ?? 0)
  })
}

/* -------------------------------- detectors ------------------------------- */
// Each returns its own triggers, or a string describing why it could not read.
// Column lists are written out here rather than shared with tools/reads.ts: the
// sweep needs less than the tools do, and a watcher quietly inheriting a wider
// select would be a change nobody asked for.

async function dailyLogMissing(ctx: ToolContext): Promise<Trigger[] | string> {
  const attendance = await ctx.caller.db
    .from('attendance')
    .select('child_id, status, check_out')
    .eq('date', ctx.today)
    .eq('status', 'checked-out')
  if (attendance.error !== null) return attendance.error.message
  if (attendance.data.length === 0) return []

  const childIds = attendance.data.map((row) => row.child_id)

  const logs = await ctx.caller.db
    .from('daily_logs')
    .select('child_id')
    .eq('date', ctx.today)
    .in('child_id', childIds)
  if (logs.error !== null) return logs.error.message
  const logged = new Set(logs.data.map((row) => row.child_id))

  const missing = childIds.filter((id) => !logged.has(id))
  if (missing.length === 0) return []

  const children = await ctx.caller.db.from('children').select('id, name').in('id', missing)
  if (children.error !== null) return children.error.message
  const names = new Map(children.data.map((row) => [row.id, row.name]))

  return missing.map((childId) => {
    const name = names.get(childId) ?? 'A child'
    return {
      kind: 'daily_log_missing' as const,
      priority: 'medium' as const,
      key: `daily_log_missing:${childId}:${ctx.today}`,
      summary: `${name} was checked out today with no daily log written.`,
      facts: { childId, childName: name, date: ctx.today },
      ageDays: 0,
    }
  })
}

async function paymentOverdue(ctx: ToolContext): Promise<Trigger[] | string> {
  const invoices = await ctx.caller.db
    .from('invoices')
    .select('id, family_id, period, due_date, amount')
    .lt('due_date', ctx.today)
  if (invoices.error !== null) return invoices.error.message
  if (invoices.data.length === 0) return []

  const payments = await ctx.caller.db
    .from('payments')
    .select('invoice_id, amount')
    .in(
      'invoice_id',
      invoices.data.map((row) => row.id),
    )
  if (payments.error !== null) return payments.error.message

  const paidByInvoice = new Map<string, number>()
  for (const row of payments.data) {
    paidByInvoice.set(row.invoice_id, (paidByInvoice.get(row.invoice_id) ?? 0) + row.amount)
  }

  const families = await ctx.caller.db.from('families').select('id, name')
  if (families.error !== null) return families.error.message
  const familyNames = new Map(families.data.map((row) => [row.id, row.name]))

  const triggers: Trigger[] = []
  for (const invoice of invoices.data) {
    const paid = paidByInvoice.get(invoice.id) ?? 0
    // Status comes from the same rule the UI and the tools use, so a trigger can
    // never disagree with what the invoice page shows.
    if (invoiceState(invoice.amount, [{ amount: paid }], invoice.due_date, ctx.today) !== 'overdue') {
      continue
    }
    const balance = Math.max(0, invoice.amount - paid)
    const age = daysSince(invoice.due_date)
    const familyName = familyNames.get(invoice.family_id) ?? 'A family'
    triggers.push({
      kind: 'payment_overdue',
      priority: age !== null && age >= OVERDUE_HIGH_DAYS ? 'high' : 'medium',
      key: `payment_overdue:${invoice.id}`,
      summary:
        `${familyName} owes ${money(balance)} on the ${invoice.period} invoice, ` +
        `due ${invoice.due_date}` +
        (age !== null ? ` — ${age} ${plural(age, 'day', 'days')} past due.` : '.'),
      facts: {
        invoiceId: invoice.id,
        familyId: invoice.family_id,
        familyName,
        period: invoice.period,
        dueDate: invoice.due_date,
        amount: invoice.amount,
        paid,
        balance,
      },
      ageDays: age,
    })
  }
  return triggers
}

/**
 * A submission that has just come in — the counterpart to `enrollmentStale`,
 * covering the days before a submission counts as sitting too long.
 *
 * Without it Ro said nothing about a new family for its first three days, which
 * is backwards: the first reply is the one a family waiting to hear back
 * notices. High priority so it sorts to the top of what she is told.
 *
 * The age is read off the first ten characters of `submitted_at`, the same way
 * `enrollmentStale` does it, and that is deliberate rather than a timezone
 * shortcut: the public form stamps `submittedAt` with `todayISO()` — the
 * family's own date, no time — so the stored value is that date at midnight UTC.
 * Converting it to the daycare's timezone would move every submission back to
 * 8pm the evening before and call a form sent this morning "yesterday".
 */
async function enrollmentNew(ctx: ToolContext): Promise<Trigger[] | string> {
  const rows = await ctx.caller.db
    .from('enrollments')
    .select('id, family_name, submitted_at, children')
    .eq('status', 'pending')
  if (rows.error !== null) return rows.error.message

  const triggers: Trigger[] = []
  for (const row of rows.data) {
    const age = daysSince(row.submitted_at.slice(0, 10))
    if (age === null || age >= ENROLLMENT_STALE_DAYS) continue
    const when = age <= 0 ? 'today' : age === 1 ? 'yesterday' : `${age} days ago`
    triggers.push({
      kind: 'enrollment_new',
      priority: 'high',
      key: `enrollment_new:${row.id}`,
      summary:
        `New enrollment form from ${row.family_name}, sent ${when} ` +
        `(${row.children.length} ${plural(row.children.length, 'child', 'children')}). ` +
        'It is waiting on her in Future Arrivals.',
      facts: {
        enrollmentId: row.id,
        familyName: row.family_name,
        submittedAt: row.submitted_at,
        childCount: row.children.length,
      },
      ageDays: Math.max(0, age),
    })
  }
  return triggers
}

async function enrollmentStale(ctx: ToolContext): Promise<Trigger[] | string> {
  const rows = await ctx.caller.db
    .from('enrollments')
    .select('id, family_name, submitted_at, children')
    .eq('status', 'pending')
  if (rows.error !== null) return rows.error.message

  const triggers: Trigger[] = []
  for (const row of rows.data) {
    const age = daysSince(row.submitted_at.slice(0, 10))
    if (age === null || age < ENROLLMENT_STALE_DAYS) continue
    triggers.push({
      kind: 'enrollment_stale',
      priority: 'medium',
      key: `enrollment_stale:${row.id}`,
      summary:
        `The ${row.family_name} enrollment has been pending for ${age} ` +
        `${plural(age, 'day', 'days')} (${row.children.length} ` +
        `${plural(row.children.length, 'child', 'children')}).`,
      facts: {
        enrollmentId: row.id,
        familyName: row.family_name,
        submittedAt: row.submitted_at,
        childCount: row.children.length,
      },
      ageDays: age,
    })
  }
  return triggers
}

async function ackPending(ctx: ToolContext): Promise<Trigger[] | string> {
  const documents = await ctx.caller.db
    .from('documents')
    .select('id, title, uploaded_at')
    .eq('requires_ack', true)
    .eq('visible_to_parents', true)
  if (documents.error !== null) return documents.error.message
  if (documents.data.length === 0) return []

  // Acknowledgements are per profile; "a family hasn't acknowledged" means no
  // parent account on that family has.
  const parents = await ctx.caller.db
    .from('profiles')
    .select('id, family_id')
    .eq('role', 'parent')
  if (parents.error !== null) return parents.error.message
  const parentFamilies = new Map<string, string>()
  for (const row of parents.data) {
    if (row.family_id !== null) parentFamilies.set(row.id, row.family_id)
  }
  const familiesWithAccounts = new Set(parentFamilies.values())
  if (familiesWithAccounts.size === 0) return []

  const acks = await ctx.caller.db
    .from('document_acknowledgements')
    .select('document_id, profile_id')
    .in(
      'document_id',
      documents.data.map((row) => row.id),
    )
  if (acks.error !== null) return acks.error.message

  const ackedFamilies = new Map<string, Set<string>>()
  for (const row of acks.data) {
    const familyId = parentFamilies.get(row.profile_id)
    if (familyId === undefined) continue
    const set = ackedFamilies.get(row.document_id) ?? new Set<string>()
    set.add(familyId)
    ackedFamilies.set(row.document_id, set)
  }

  const triggers: Trigger[] = []
  for (const document of documents.data) {
    const acked = ackedFamilies.get(document.id) ?? new Set<string>()
    const outstanding = [...familiesWithAccounts].filter((familyId) => !acked.has(familyId))
    if (outstanding.length === 0) continue
    const age = daysSince(document.uploaded_at.slice(0, 10))
    triggers.push({
      kind: 'ack_pending',
      priority: 'low',
      key: `ack_pending:${document.id}`,
      summary:
        `${outstanding.length} of ${familiesWithAccounts.size} ` +
        `${plural(familiesWithAccounts.size, 'family', 'families')} ` +
        `${plural(outstanding.length, 'has', 'have')} not acknowledged "${document.title}".`,
      facts: {
        documentId: document.id,
        title: document.title,
        outstanding: outstanding.length,
        totalFamilies: familiesWithAccounts.size,
        uploadedAt: document.uploaded_at,
      },
      ageDays: age,
    })
  }
  return triggers
}

async function unansweredMessage(ctx: ToolContext, now: Date): Promise<Trigger[] | string> {
  const threads = await ctx.caller.db.from('threads').select('id, family_id, subject')
  if (threads.error !== null) return threads.error.message
  if (threads.data.length === 0) return []

  const messages = await ctx.caller.db
    .from('thread_messages')
    .select('thread_id, from_role, at, author_name')
    .in(
      'thread_id',
      threads.data.map((row) => row.id),
    )
    .order('at', { ascending: false })
  if (messages.error !== null) return messages.error.message

  // Newest first, so the first sighting of a thread is its most recent message.
  const latest = new Map<string, { role: 'admin' | 'parent'; at: string; author: string }>()
  for (const row of messages.data) {
    if (!latest.has(row.thread_id)) {
      latest.set(row.thread_id, { role: row.from_role, at: row.at, author: row.author_name })
    }
  }

  const families = await ctx.caller.db.from('families').select('id, name')
  if (families.error !== null) return families.error.message
  const familyNames = new Map(families.data.map((row) => [row.id, row.name]))

  const triggers: Trigger[] = []
  for (const thread of threads.data) {
    const last = latest.get(thread.id)
    if (last === undefined || last.role !== 'parent') continue
    const hours = hoursSince(last.at, now)
    if (hours === null || hours < UNANSWERED_FLOOR_HOURS) continue
    const age = daysSince(last.at.slice(0, 10), now)
    const familyName = familyNames.get(thread.family_id) ?? 'A family'
    const waited =
      hours < 24
        ? `${Math.floor(hours)} ${plural(Math.floor(hours), 'hour', 'hours')}`
        : `${age ?? 1} ${plural(age ?? 1, 'day', 'days')}`
    triggers.push({
      kind: 'unanswered_message',
      priority: age !== null && age >= UNANSWERED_HIGH_DAYS ? 'high' : 'medium',
      key: `unanswered_message:${thread.id}:${last.at}`,
      summary:
        `${last.author} (${familyName}) wrote in "${thread.subject}" ${waited} ago ` +
        'and has had no reply.',
      facts: {
        threadId: thread.id,
        familyId: thread.family_id,
        familyName,
        subject: thread.subject,
        lastFrom: 'parent',
        lastAt: last.at,
        hoursWaiting: Math.floor(hours),
      },
      ageDays: age,
    })
  }
  return triggers
}

/**
 * Leads with no movement.
 *
 * A real limitation, stated rather than papered over: `leads` has no
 * `updated_at`, so "no status change in N days" cannot be measured directly.
 * What is measurable is age since creation plus a status that is still open,
 * which catches the case that matters — an inquiry nobody got back to. A lead
 * moved to "Tour scheduled" last week still looks old by this measure, so a
 * tour date in the future excludes it. Adding `leads.updated_at` would make
 * this exact; until then this is deliberately approximate, and says so.
 *
 * `waitlist_prospects` is not assessed at all: it has no status and no activity
 * column, so there is nothing to compare. §5 lists "leads/waitlist" together,
 * but the waitlist half needs a schema change before it can mean anything.
 */
async function coldLead(ctx: ToolContext): Promise<Trigger[] | string> {
  const leads = await ctx.caller.db
    .from('leads')
    .select('id, parent_name, child_ages, status, tour_date, created_at')
  if (leads.error !== null) return leads.error.message

  const triggers: Trigger[] = []
  for (const lead of leads.data) {
    if (CLOSED_LEAD_STATUSES.has(lead.status.trim().toLowerCase())) continue
    // A scheduled tour that has not happened yet is movement, not silence.
    if (lead.tour_date !== null && lead.tour_date >= ctx.today) continue
    const age = daysSince(lead.created_at.slice(0, 10))
    if (age === null || age < COLD_LEAD_DAYS) continue
    triggers.push({
      kind: 'cold_lead',
      priority: 'low',
      key: `cold_lead:${lead.id}`,
      summary:
        `${lead.parent_name} enquired ${age} ${plural(age, 'day', 'days')} ago ` +
        `(${lead.child_ages || 'no ages given'}) and is still "${lead.status}".`,
      facts: {
        leadId: lead.id,
        parentName: lead.parent_name,
        childAges: lead.child_ages,
        status: lead.status,
        tourDate: lead.tour_date,
        createdAt: lead.created_at,
      },
      ageDays: age,
    })
  }
  return triggers
}

/* ---------------------------------- sweep --------------------------------- */

/**
 * Runs all seven watchers.
 *
 * A watcher that cannot read does not fail the sweep — the other five still
 * have something worth saying, and Ro reporting five real things beats
 * reporting nothing because the leads table hiccuped. Failures come back in
 * `error` on the result only when every watcher failed; otherwise they are
 * returned for the handler to log.
 */
export async function runTriggers(
  ctx: ToolContext,
  now: Date = new Date(),
): Promise<{ sweep: TriggerSweep; failures: { kind: string; detail: string }[] }> {
  const results = await Promise.all([
    dailyLogMissing(ctx),
    paymentOverdue(ctx),
    enrollmentNew(ctx),
    enrollmentStale(ctx),
    ackPending(ctx),
    unansweredMessage(ctx, now),
    coldLead(ctx),
  ])
  const kinds = [
    'daily_log_missing',
    'payment_overdue',
    'enrollment_new',
    'enrollment_stale',
    'ack_pending',
    'unanswered_message',
    'cold_lead',
  ]

  const triggers: Trigger[] = []
  const failures: { kind: string; detail: string }[] = []
  results.forEach((result, index) => {
    if (typeof result === 'string') failures.push({ kind: kinds[index] ?? 'unknown', detail: result })
    else triggers.push(...result)
  })

  const sorted = sortTriggers(triggers)
  const time = timeInZone(now)
  return {
    sweep: {
      date: ctx.today,
      time,
      quietHours: isQuietHours(time),
      counts: {
        high: sorted.filter((trigger) => trigger.priority === 'high').length,
        medium: sorted.filter((trigger) => trigger.priority === 'medium').length,
        low: sorted.filter((trigger) => trigger.priority === 'low').length,
      },
      triggers: sorted,
    },
    failures,
  }
}

/**
 * Assembles the Family Calendar.
 *
 * Five streams are merged into one ordered list:
 *   1. events the owner authored (`calendar_events`)
 *   2. one-off schedule changes (`child_schedule_changes`), when passed in
 *   3. new weekly schedules starting on a date (`child_schedule_plans`), when passed in
 *   4. birthdays, derived from `Child.dob`
 *   5. payment due dates, derived from unpaid `Invoice.dueDate`
 *
 * Only the first three are stored. Deriving the other two means birthdays never need
 * re-entering each year and never drift when a date of birth is corrected,
 * and a due date cannot disagree with the invoice it came from.
 */
import type {
  CalendarEvent,
  CalendarEventKind,
  Child,
  Invoice,
  ScheduleBlock,
  ScheduleChange,
  SchedulePlan,
  WeeklySchedule,
} from '../types'
import { invoiceBalance } from './helpers'

export type CalendarEntryKind = CalendarEventKind | 'schedule_change' | 'schedule_plan' | 'birthday' | 'payment_due'

export interface CalendarEntry {
  id: string
  kind: CalendarEntryKind
  title: string
  note: string
  /** ISO date this occurrence falls on, yyyy-MM-dd. */
  date: string
  /** Last day of a multi-day event; undefined for a single day. */
  endsOn?: string
  /** 24h HH:mm, only on `early_close`. */
  closesAt?: string
  /** Set on schedule exceptions, schedule changes and birthdays. */
  childId?: string
  /** Only on `schedule_change`: that day's times. Empty = not coming. */
  blocks?: ScheduleBlock[]
  /** Only on `schedule_plan`: the new weekly pattern starting that day. */
  weekly?: WeeklySchedule
  /** On `schedule_change` and `schedule_plan`: when it was last set, for the "New" marker. */
  changedAt?: string
  /** Derived entries are read-only — there is no row behind them to edit. */
  derived: boolean
  visibleToParents: boolean
}

/** yyyy-MM-dd comparisons are safe as plain string compares. */
function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to
}

/**
 * The birthday occurrences that land inside the window. A range spanning a
 * year boundary has to check each year it touches, or a January birthday
 * disappears from a December-to-January view.
 */
function birthdaysInRange(child: Child, from: string, to: string): string[] {
  const monthDay = child.dob.slice(5)
  if (!monthDay) return []
  const firstYear = Number(from.slice(0, 4))
  const lastYear = Number(to.slice(0, 4))
  if (!Number.isFinite(firstYear) || !Number.isFinite(lastYear)) return []

  const dates: string[] = []
  for (let year = firstYear; year <= lastYear; year++) {
    // Feb 29 only exists in a leap year; skip rather than silently shifting it.
    const candidate = `${String(year)}-${monthDay}`
    if (monthDay === '02-29' && new Date(`${candidate}T00:00:00`).getUTCDate() !== 29) continue
    if (inRange(candidate, from, to)) dates.push(candidate)
  }
  return dates
}

export interface BuildCalendarOptions {
  events: CalendarEvent[]
  children: Child[]
  invoices: Invoice[]
  /** Inclusive window, yyyy-MM-dd. */
  from: string
  to: string
  /** Drop anything not shared with families. Used by the parent portal. */
  parentView?: boolean
  /** Narrow to one family's children. Used by the parent portal. */
  familyChildIds?: string[]
  /** One-off schedule changes to include. Omit to leave them off. */
  scheduleChanges?: ScheduleChange[]
  /** New weekly schedules to include, on the day each starts. Omit to leave them off. */
  schedulePlans?: SchedulePlan[]
}

export function buildCalendar(options: BuildCalendarOptions): CalendarEntry[] {
  const { events, children, invoices, from, to, parentView = false, familyChildIds, scheduleChanges = [], schedulePlans = [] } = options
  const entries: CalendarEntry[] = []

  for (const event of events) {
    if (parentView && !event.visibleToParents) continue
    // A multi-day event belongs in the window if any part of it overlaps.
    const last = event.endsOn ?? event.startsOn
    if (last < from || event.startsOn > to) continue
    if (event.childId && familyChildIds && !familyChildIds.includes(event.childId)) continue
    entries.push({
      id: event.id,
      kind: event.kind,
      title: event.title,
      note: event.note,
      date: event.startsOn,
      endsOn: event.endsOn,
      closesAt: event.closesAt,
      childId: event.childId,
      derived: false,
      visibleToParents: event.visibleToParents,
    })
  }

  // Edited on the child's page, not here, so they arrive marked derived. Titled
  // with the child's name; the screen words the times in its own language.
  for (const change of scheduleChanges) {
    if (!inRange(change.date, from, to)) continue
    if (familyChildIds && !familyChildIds.includes(change.childId)) continue
    const child = children.find((c) => c.id === change.childId)
    if (!child) continue
    entries.push({
      id: `change:${change.id}`,
      kind: 'schedule_change',
      title: child.name,
      note: change.note,
      date: change.date,
      childId: change.childId,
      blocks: change.blocks,
      changedAt: change.updatedAt,
      derived: true,
      visibleToParents: true,
    })
  }

  for (const plan of schedulePlans) {
    if (!inRange(plan.startsOn, from, to)) continue
    if (familyChildIds && !familyChildIds.includes(plan.childId)) continue
    const child = children.find((c) => c.id === plan.childId)
    if (!child) continue
    entries.push({
      id: `plan:${plan.id}`,
      kind: 'schedule_plan',
      title: child.name,
      note: plan.note,
      date: plan.startsOn,
      childId: plan.childId,
      weekly: plan.schedule,
      changedAt: plan.updatedAt,
      derived: true,
      visibleToParents: true,
    })
  }

  for (const child of children) {
    if (child.status !== 'active') continue
    if (familyChildIds && !familyChildIds.includes(child.id)) continue
    for (const date of birthdaysInRange(child, from, to)) {
      entries.push({
        id: `birthday:${child.id}:${date}`,
        kind: 'birthday',
        title: `${child.name}'s birthday`,
        note: '',
        date,
        childId: child.id,
        derived: true,
        visibleToParents: true,
      })
    }
  }

  // Payment dates are the owner's business, not something to show families
  // alongside pajama day — they already have them on the billing page.
  if (!parentView) {
    for (const invoice of invoices) {
      if (invoiceBalance(invoice) <= 0) continue
      if (!inRange(invoice.dueDate, from, to)) continue
      entries.push({
        id: `due:${invoice.id}`,
        kind: 'payment_due',
        title: `${invoice.id} due`,
        note: invoice.period,
        date: invoice.dueDate,
        derived: true,
        visibleToParents: false,
      })
    }
  }

  return entries.sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : a.date < b.date ? -1 : 1))
}

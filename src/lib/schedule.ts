/**
 * Who is expected, and when: the single source of truth for one child's day.
 *
 * Every screen that answers "who should be here" (admin attendance, both
 * dashboards) and Ro's attendance tools run THIS function, so they cannot
 * disagree. Ro runs it inside a Vercel serverless function (api/), which is
 * why this file must stay dependency-free: no React, zustand or date-fns, no
 * runtime imports at all (type imports are erased), and no Date behaviour that
 * depends on the host's time zone. A function runs in UTC, the owner's phone in
 * Eastern; dates here are plain `yyyy-MM-dd` strings, and the weekday is read
 * from the string itself.
 *
 * Precedence, first match wins:
 *   1. Child not active                         → not expected
 *   2. Date before the child's start date       → not expected
 *   3. A `closure` covers the date              → closed, nobody expected
 *   4. A `schedule_exception` for this child    → not expected
 *   5. A one-off schedule change for that date  → its blocks (empty = off)
 *   6. No weekly schedule ever set (NULL)       → UNSCHEDULED (unknown)
 *   7. The weekly pattern for that weekday      → its blocks (empty = off)
 * Steps 5 and 7 then apply any `early_close` that day: block ends are capped
 * at its time, and blocks starting at or after it are dropped.
 *
 * 'unscheduled' is deliberately not 'not_expected': a child whose schedule was
 * never entered is UNKNOWN. Screens show them in their own group and Ro says
 * "schedule unknown"; they are never counted as expected or as absent.
 */
import type { CalendarEventKind, ChildStatus, ScheduleBlock, WeeklySchedule, Weekday } from '../types'

/** `Date#getUTCDay()` order: Sunday is 0. */
const WEEKDAY_BY_UTC_DAY: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** The child fields the resolver reads. A domain `Child` satisfies this. */
export interface ResolverChild {
  id: string
  status: ChildStatus
  /** yyyy-MM-dd, or '' when unknown (treated as already started). */
  startDate: string
  /** Undefined or null = never set. */
  schedule?: WeeklySchedule | null
}

/** A one-off change. A domain `ScheduleChange` satisfies this. */
export interface ResolverChange {
  childId: string
  date: string
  blocks: ScheduleBlock[]
  note: string
}

/**
 * The calendar fields the resolver reads. A domain `CalendarEvent` satisfies
 * this, and so does a row mapped on the server (NULLs allowed).
 */
export interface ResolverEvent {
  kind: CalendarEventKind
  title: string
  startsOn: string
  endsOn?: string | null
  /** HH:mm or HH:mm:ss; only meaningful on `early_close`. */
  closesAt?: string | null
  childId?: string | null
}

export type DayState = 'expected' | 'not_expected' | 'closed' | 'unscheduled'

/** Which precedence rule decided the day. */
export type DaySource =
  | 'inactive'
  | 'not_started'
  | 'closure'
  | 'exception'
  | 'change'
  | 'unscheduled'
  | 'pattern'

export interface ChildDay {
  state: DayState
  /** Sorted HH:mm blocks, after any early close. Empty unless 'expected'. */
  blocks: ScheduleBlock[]
  source: DaySource
  /**
   * The owner's own words behind the decision when there are any: the
   * closure's or exception's title, or the one-off change's note. Else ''.
   */
  reason: string
  /** HH:mm when an early close shortened or removed this day's care. */
  closesAt?: string
}

/** The weekday of a `yyyy-MM-dd`, or null if it is not a real date. */
export function weekdayOf(date: string): Weekday | null {
  const match = ISO_DATE.exec(date)
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const at = new Date(Date.UTC(year, month - 1, day))
  // Rejects dates that roll over, like 2026-02-30.
  if (at.getUTCFullYear() !== year || at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day) return null
  return WEEKDAY_BY_UTC_DAY[at.getUTCDay()] ?? null
}

/** Postgres `time` reads back as HH:mm:ss; the app works in HH:mm. */
export function toHHmm(value: string): string {
  return value.slice(0, 5)
}

function covers(event: ResolverEvent, date: string): boolean {
  const last = event.endsOn ?? event.startsOn
  return event.startsOn <= date && date <= last
}

function day(state: DayState, source: DaySource, reason = ''): ChildDay {
  return { state, blocks: [], source, reason }
}

/** Applies an early close and decides expected / not expected from what is left. */
function fromBlocks(
  blocks: ScheduleBlock[],
  source: 'change' | 'pattern',
  reason: string,
  closesAt: string | undefined,
): ChildDay {
  const normalized = blocks
    .map((block) => ({ start: toHHmm(block.start), end: toHHmm(block.end) }))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))

  const kept =
    closesAt === undefined
      ? normalized
      : normalized
          .filter((block) => block.start < closesAt)
          .map((block) => (block.end > closesAt ? { start: block.start, end: closesAt } : block))

  const shortened = closesAt !== undefined && normalized.some((block) => block.end > closesAt)
  const result: ChildDay =
    kept.length > 0
      ? { state: 'expected', blocks: kept, source, reason }
      : { state: 'not_expected', blocks: [], source, reason }
  if (shortened) result.closesAt = closesAt
  return result
}

/**
 * Resolves one child's schedule on one date. `changes` and `events` may hold
 * rows for other children and dates; only the relevant ones are used.
 *
 * Throws RangeError for a date that is not a real `yyyy-MM-dd`: every caller
 * passes today or an already-validated date, so a bad one is a bug to surface,
 * not a day to quietly report as empty.
 */
export function resolveChildDay(
  child: ResolverChild,
  date: string,
  changes: readonly ResolverChange[],
  events: readonly ResolverEvent[],
): ChildDay {
  const weekday = weekdayOf(date)
  if (weekday === null) throw new RangeError(`Not a yyyy-MM-dd date: ${date}`)

  if (child.status !== 'active') return day('not_expected', 'inactive')
  if (child.startDate !== '' && date < child.startDate) return day('not_expected', 'not_started')

  const todays = events.filter((event) => covers(event, date))

  const closure = todays.find((event) => event.kind === 'closure')
  if (closure !== undefined) return day('closed', 'closure', closure.title)

  const exception = todays.find((event) => event.kind === 'schedule_exception' && event.childId === child.id)
  if (exception !== undefined) return day('not_expected', 'exception', exception.title)

  // Two early closes on one day: the earlier one is the one that holds.
  const closesAt = todays
    .filter((event) => event.kind === 'early_close' && typeof event.closesAt === 'string' && event.closesAt !== '')
    .map((event) => toHHmm(event.closesAt ?? ''))
    .sort()[0]

  const change = changes.find((entry) => entry.childId === child.id && entry.date === date)
  if (change !== undefined) return fromBlocks(change.blocks, 'change', change.note, closesAt)

  if (child.schedule === undefined || child.schedule === null) return day('unscheduled', 'unscheduled')

  return fromBlocks(child.schedule[weekday] ?? [], 'pattern', '', closesAt)
}

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

/** Display order, Monday first. Weekend days are ordinary days. */
export const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/** `Date#getUTCDay()` order: Sunday is 0. */
const WEEKDAY_BY_UTC_DAY: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** 24h HH:mm, 00:00–23:59. Same pattern as the database check in 0020. */
const HH_MM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

/** Same limit as `valid_schedule_blocks` in migration 0020. */
export const MAX_BLOCKS_PER_DAY = 3

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

/* ------------------------------ validation -------------------------------- */
// Mirrors `valid_schedule_blocks` / `valid_weekly_schedule` in migration 0020,
// so a schedule that passes here is never refused by the database.

/** Why a day's times cannot be saved. The UI turns these into sentences. */
export type DayProblem = 'missing_time' | 'end_before_start' | 'overlap' | 'too_many'

function byStart(a: ScheduleBlock, b: ScheduleBlock): number {
  return a.start < b.start ? -1 : a.start > b.start ? 1 : 0
}

/**
 * The first thing wrong with one day's blocks, or null when they can be saved.
 * Blocks may be in any order here (an editor shows them as typed); they are
 * sorted before saving. Touching blocks (09:00–12:00, 12:00–15:00) are fine.
 */
export function dayProblem(blocks: readonly ScheduleBlock[]): DayProblem | null {
  if (blocks.length > MAX_BLOCKS_PER_DAY) return 'too_many'
  if (blocks.some((block) => !HH_MM.test(block.start) || !HH_MM.test(block.end))) return 'missing_time'
  if (blocks.some((block) => block.end <= block.start)) return 'end_before_start'
  const sorted = [...blocks].sort(byStart)
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const current = sorted[index]
    if (previous !== undefined && current !== undefined && current.start < previous.end) return 'overlap'
  }
  return null
}

/** A copy of one day's blocks in time order, carrying only start and end. */
export function sortedBlocks(blocks: readonly ScheduleBlock[]): ScheduleBlock[] {
  return [...blocks].sort(byStart).map((block) => ({ start: block.start, end: block.end }))
}

/** Every day with a problem, keyed by day. Empty when the whole week can be saved. */
export function scheduleProblems(schedule: WeeklySchedule): Partial<Record<Weekday, DayProblem>> {
  const problems: Partial<Record<Weekday, DayProblem>> = {}
  for (const weekday of WEEKDAYS) {
    const problem = dayProblem(schedule[weekday] ?? [])
    if (problem !== null) problems[weekday] = problem
  }
  return problems
}

/**
 * The shape to store, from a week that passed `scheduleProblems`: blocks sorted,
 * empty days dropped. A week with no times at all returns undefined, which is
 * stored as NULL ("schedule not set"), never as `{}`: an editor left blank means
 * nobody has said when the child comes, not that the child never comes.
 */
export function scheduleForSaving(schedule: WeeklySchedule): WeeklySchedule | undefined {
  const saved: WeeklySchedule = {}
  for (const weekday of WEEKDAYS) {
    const blocks = schedule[weekday] ?? []
    if (blocks.length > 0) {
      saved[weekday] = [...blocks].sort(byStart).map((block) => ({ start: block.start, end: block.end }))
    }
  }
  return Object.keys(saved).length > 0 ? saved : undefined
}

function asBlock(value: unknown): ScheduleBlock | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const { start, end } = record
  return typeof start === 'string' && typeof end === 'string' ? { start, end } : null
}

/**
 * Reads a schedule from untrusted JSON: the public enrollment form's jsonb, or
 * a stored proposal. Anything malformed (an unknown day, a non-array, a block
 * that is not two HH:mm strings, a day that fails `dayProblem`) rejects the
 * WHOLE schedule and returns undefined, so the child arrives as "schedule not
 * set" for the owner to fill in, rather than with a half-kept guess.
 */
export function sanitizeWeeklySchedule(value: unknown): WeeklySchedule | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const known = new Set<string>(WEEKDAYS)
  const week: WeeklySchedule = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!known.has(key) || !Array.isArray(raw)) return undefined
    const blocks: ScheduleBlock[] = []
    for (const entry of raw as unknown[]) {
      const block = asBlock(entry)
      if (block === null) return undefined
      blocks.push(block)
    }
    week[key as Weekday] = blocks
  }
  if (Object.keys(scheduleProblems(week)).length > 0) return undefined
  return scheduleForSaving(week)
}

/* ------------------------------- formatting ------------------------------- */
// Shared by every screen that shows a schedule and by Ro, so a schedule reads
// the same wherever it appears. Day names and the 12h/24h clock come from Intl
// for the locale given; English gets a compact hand-built form ("7–9 am").

/** Days in the first week of January 2000, which began on a Monday. */
const SAMPLE_DAY: Record<Weekday, number> = { mon: 3, tue: 4, wed: 5, thu: 6, fri: 7, sat: 8, sun: 9 }

function sampleDate(weekday: Weekday, hhmm = '00:00'): Date {
  const [hours = 0, minutes = 0] = hhmm.split(':').map((piece) => Number(piece))
  return new Date(Date.UTC(2000, 0, SAMPLE_DAY[weekday], hours, minutes))
}

function isEnglish(locale: string): boolean {
  return locale === 'en' || locale.startsWith('en-')
}

/** The locale's short day name: "Mon", "lun", "Thứ 2". */
export function dayLabel(weekday: Weekday, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(sampleDate(weekday))
}

/** "7 am", "7:30" style English clock face, without the am/pm. */
function englishClock(hhmm: string): { face: string; period: 'am' | 'pm' } {
  const [hours = 0, minutes = 0] = hhmm.split(':').map((piece) => Number(piece))
  const twelve = hours % 12 === 0 ? 12 : hours % 12
  return {
    face: minutes === 0 ? String(twelve) : `${twelve}:${String(minutes).padStart(2, '0')}`,
    period: hours < 12 ? 'am' : 'pm',
  }
}

/**
 * One block: "7–9 am", "9 am–3 pm", "7:30–9 am" in English (am/pm written once
 * when both ends share it); the locale's own clock elsewhere ("7:00–15:30").
 */
export function formatBlock(block: ScheduleBlock, locale: string): string {
  const start = toHHmm(block.start)
  const end = toHHmm(block.end)
  if (isEnglish(locale)) {
    const from = englishClock(start)
    const until = englishClock(end)
    return from.period === until.period
      ? `${from.face}–${until.face} ${until.period}`
      : `${from.face} ${from.period}–${until.face} ${until.period}`
  }
  const clock = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
  return `${clock.format(sampleDate('mon', start))}–${clock.format(sampleDate('mon', end))}`
}

/** One time of day: "3 pm", "7:30 am" in English; the locale's clock elsewhere ("15:00"). */
export function formatClock(hhmm: string, locale: string): string {
  const time = toHHmm(hhmm)
  if (isEnglish(locale)) {
    const clock = englishClock(time)
    return `${clock.face} ${clock.period}`
  }
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(sampleDate('mon', time))
}

/** A day's blocks in time order: "7–9 am, 3–6 pm". Empty string for a day off. */
export function formatDayBlocks(blocks: readonly ScheduleBlock[], locale: string): string {
  return [...blocks]
    .map((block) => ({ start: toHHmm(block.start), end: toHHmm(block.end) }))
    .sort(byStart)
    .map((block) => formatBlock(block, locale))
    .join(', ')
}

/**
 * The week on one line, Monday first: "Mon 7–9 am, 3–6 pm · Wed 9 am–3 pm".
 * Three or more days in a row with exactly the same times are grouped
 * ("Mon–Fri 8 am–5 pm"). Only identical days are ever grouped, so grouping
 * never hides a difference, and a run of two stays listed day by day, which
 * reads more clearly than "Sat–Sun". Empty string when no day has a time.
 */
export function formatWeeklySchedule(schedule: WeeklySchedule, locale: string): string {
  const texts = WEEKDAYS.map((weekday) => formatDayBlocks(schedule[weekday] ?? [], locale))
  const entries: string[] = []
  let index = 0
  while (index < WEEKDAYS.length) {
    const text = texts[index] ?? ''
    if (text === '') {
      index += 1
      continue
    }
    let last = index
    while (last + 1 < WEEKDAYS.length && texts[last + 1] === text) last += 1
    const first = WEEKDAYS[index]
    const final = WEEKDAYS[last]
    if (first !== undefined && final !== undefined && last - index >= 2) {
      entries.push(`${dayLabel(first, locale)}–${dayLabel(final, locale)} ${text}`)
    } else {
      for (let day = index; day <= last; day += 1) {
        const weekday = WEEKDAYS[day]
        if (weekday !== undefined) entries.push(`${dayLabel(weekday, locale)} ${text}`)
      }
    }
    index = last + 1
  }
  return entries.join(' · ')
}

/**
 * What to show for a child's schedule, before any wording is chosen (the
 * console words it in English, the parent portal through i18n, Ro in her own
 * sentences):
 *   'set'     — the formatted week
 *   'no_days' — a schedule was saved with no days in it
 *   'not_set' — never entered; `legacyPlan` is the old dropdown text, if any
 */
export type ScheduleSummary =
  | { kind: 'set'; text: string }
  | { kind: 'no_days' }
  | { kind: 'not_set'; legacyPlan: string }

export function summarizeSchedule(
  child: { schedule?: WeeklySchedule | null; plan: string },
  locale: string,
): ScheduleSummary {
  if (child.schedule === undefined || child.schedule === null) {
    return { kind: 'not_set', legacyPlan: child.plan.trim() }
  }
  const text = formatWeeklySchedule(child.schedule, locale)
  return text === '' ? { kind: 'no_days' } : { kind: 'set', text }
}

/* ------------------------------- day roster ------------------------------- */
// "Who should be here on this date", grouped the same way everywhere: the
// attendance page, both dashboards and Ro all build their lists from this.

/** The child fields the roster reads. A domain `Child` satisfies this. */
export interface RosterChild extends ResolverChild {
  name: string
}

/** The attendance fields the roster reads. A domain `AttendanceRecord` satisfies this. */
export interface RosterRecord {
  childId: string
  date: string
  status: 'present' | 'absent' | 'expected' | 'checked-out'
  checkIn: string | null
  checkOut: string | null
}

/**
 * Where a child in the main list stands right now:
 *   due       — expected, not arrived yet
 *   here      — checked in
 *   returning — checked out between two blocks of a split day; back at `returnsAt`
 *   gone      — checked out for the day
 *   absent    — marked absent
 */
export type RosterPhase = 'due' | 'here' | 'returning' | 'gone' | 'absent'

export interface RosterRow<C extends RosterChild, R extends RosterRecord> {
  child: C
  record: R | null
  day: ChildDay
  phase: RosterPhase
  /** HH:mm the next block starts, for a child who is `returning`. */
  returnsAt?: string
}

export interface DayRoster<C extends RosterChild, R extends RosterRecord> {
  /** The closure covering the date, if the daycare is closed. */
  closure: { title: string } | null
  /** The earliest early close that day, if any. */
  earlyClose: { title: string; closesAt: string } | null
  /**
   * Scheduled that day, plus anyone with an attendance record that day (a
   * drop-in, a swap), sorted by first start time, then name.
   */
  main: RosterRow<C, R>[]
  /** No weekly schedule ever entered, and no record: schedule UNKNOWN. Never counted. */
  unscheduled: RosterRow<C, R>[]
  /** Not scheduled that day (day off, one-off change, exception, closed), and no record. */
  notToday: RosterRow<C, R>[]
  counts: {
    here: number
    /** Checked out and not coming back today. */
    gone: number
    absent: number
    /** Still to arrive, including `returning`. */
    due: number
    returning: number
  }
}

function phaseOf(day: ChildDay, record: RosterRecord | null): { phase: RosterPhase; returnsAt?: string } {
  if (record === null || record.status === 'expected') return { phase: 'due' }
  if (record.status === 'present') return { phase: 'here' }
  if (record.status === 'absent') return { phase: 'absent' }
  // Checked out: coming back if a later block of today's schedule has not started.
  const leftAt = record.checkOut === null ? null : toHHmm(record.checkOut)
  const next = leftAt === null ? undefined : day.blocks.find((block) => block.start > leftAt)
  return next ? { phase: 'returning', returnsAt: next.start } : { phase: 'gone' }
}

/**
 * Groups the ACTIVE children for one date. `records`, `changes` and `events`
 * may hold rows for other dates and children; only the relevant ones are used.
 * A child with an attendance record that day is always in `main`, whatever
 * their schedule says, so a drop-in is never hidden.
 */
export function buildDayRoster<C extends RosterChild, R extends RosterRecord>(
  children: readonly C[],
  records: readonly R[],
  changes: readonly ResolverChange[],
  events: readonly ResolverEvent[],
  date: string,
): DayRoster<C, R> {
  const todays = events.filter((event) => covers(event, date))
  const closure = todays.find((event) => event.kind === 'closure')
  const earlyCloses = todays
    .filter((event) => event.kind === 'early_close' && typeof event.closesAt === 'string' && event.closesAt !== '')
    .map((event) => ({ title: event.title, closesAt: toHHmm(event.closesAt ?? '') }))
    .sort((a, b) => (a.closesAt < b.closesAt ? -1 : 1))

  const roster: DayRoster<C, R> = {
    closure: closure ? { title: closure.title } : null,
    earlyClose: earlyCloses[0] ?? null,
    main: [],
    unscheduled: [],
    notToday: [],
    counts: { here: 0, gone: 0, absent: 0, due: 0, returning: 0 },
  }

  for (const child of children) {
    if (child.status !== 'active') continue
    const day = resolveChildDay(child, date, changes, events)
    const record = records.find((entry) => entry.childId === child.id && entry.date === date) ?? null
    const { phase, returnsAt } = phaseOf(day, record)
    const row: RosterRow<C, R> = returnsAt === undefined ? { child, record, day, phase } : { child, record, day, phase, returnsAt }

    if (record !== null || day.state === 'expected') {
      roster.main.push(row)
      if (phase === 'returning') roster.counts.returning += 1
      if (phase === 'due' || phase === 'returning') roster.counts.due += 1
      else roster.counts[phase] += 1
    } else if (day.state === 'unscheduled') {
      roster.unscheduled.push(row)
    } else {
      roster.notToday.push(row)
    }
  }

  const firstStart = (row: RosterRow<C, R>): string => row.day.blocks[0]?.start ?? '99:99'
  const byStartThenName = (a: RosterRow<C, R>, b: RosterRow<C, R>): number =>
    firstStart(a) === firstStart(b) ? a.child.name.localeCompare(b.child.name) : firstStart(a) < firstStart(b) ? -1 : 1
  const byName = (a: RosterRow<C, R>, b: RosterRow<C, R>): number => a.child.name.localeCompare(b.child.name)
  roster.main.sort(byStartThenName)
  roster.unscheduled.sort(byName)
  roster.notToday.sort(byName)
  return roster
}

/**
 * Weekly views for the admin console, and for the family portal's Daily
 * reports page (which shows the whole current week, not just today).
 *
 * The owner wants Announcements, Documents and Daily reports to start fresh
 * every Monday. Nothing is moved or deleted for that: every row stays in
 * Supabase and in the family portal exactly as it was. The admin pages simply
 * open on the current week and let her step back through earlier ones, so no
 * scheduled job exists or is needed — "this week" is worked out from the date.
 *
 * A week runs Monday to Sunday in the daycare's own zone (DAYCARE_TIME_ZONE in
 * helpers.ts, passed in by the caller), so Monday 12:00 AM Eastern is the
 * moment the console turns over.
 *
 * Dependency-free on purpose, like schedule.ts: no React, zustand or date-fns
 * and no runtime imports, so `npm test` runs it directly. Day arithmetic is
 * done on plain `yyyy-MM-dd` strings in UTC, so DST changes cannot shift a
 * week boundary.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

/** UTC midnight of a real calendar date, or null for anything else. */
function parseDay(day: string): number | null {
  const match = ISO_DATE.exec(day)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const date = Number(match[3])
  const ms = Date.UTC(year, month, date)
  const check = new Date(ms)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month || check.getUTCDate() !== date) return null
  return ms
}

function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat>()

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = zoneFormatters.get(timeZone)
  if (cached) return cached
  const made = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  zoneFormatters.set(timeZone, made)
  return made
}

/**
 * The calendar day a stored value falls on at the daycare.
 *
 * A `date` column (daily_logs.date) is already a daycare day and passes
 * through. A `timestamptz` (announcements.date, documents.uploaded_at) is an
 * instant, so it is read on the daycare's clock: a post at 9 PM Sunday Eastern
 * is 1 AM Monday in UTC, and still belongs to the week that is ending.
 */
export function dayInZone(value: string, timeZone: string): string | null {
  if (ISO_DATE.test(value)) return parseDay(value) === null ? null : value
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) return null
  const parts = zoneFormatter(timeZone).formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** The Monday that starts the week containing `day` (`yyyy-MM-dd`). */
export function weekStartOf(day: string): string | null {
  const ms = parseDay(day)
  if (ms === null) return null
  // getUTCDay: Sunday is 0. Steps back to Monday: Mon 0, Tue 1 … Sun 6.
  const back = (new Date(ms).getUTCDay() + 6) % 7
  return formatDay(ms - back * DAY_MS)
}

/** The Monday that starts the week a stored value belongs to, at the daycare. */
export function weekOf(value: string, timeZone: string): string | null {
  const day = dayInZone(value, timeZone)
  return day === null ? null : weekStartOf(day)
}

/** `weekStart` moved by whole weeks (negative = earlier). Invalid input comes back unchanged. */
export function shiftWeek(weekStart: string, weeks: number): string {
  const ms = parseDay(weekStart)
  return ms === null ? weekStart : formatDay(ms + weeks * 7 * DAY_MS)
}

/** The Sunday that ends the week starting `weekStart`. */
export function weekEndOf(weekStart: string): string {
  const ms = parseDay(weekStart)
  return ms === null ? weekStart : formatDay(ms + 6 * DAY_MS)
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>()

/** A cached formatter for `locale`; an unknown language tag falls back to English. */
function dayFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  const cached = dayFormatters.get(key)
  if (cached) return cached
  let made: Intl.DateTimeFormat
  try {
    made = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' })
  } catch {
    made = new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' })
  }
  dayFormatters.set(key, made)
  return made
}

/**
 * A calendar day (`yyyy-MM-dd`) as a short date in the portal's language:
 * "Nov 2", "2 nov", "2 thg 11" — with the year when asked. The day is read in
 * UTC so the date never shifts. Invalid input comes back unchanged.
 */
export function formatDayShort(day: string, locale: string, withYear = false): string {
  const ms = parseDay(day)
  if (ms === null) return day
  const options: Intl.DateTimeFormatOptions = withYear
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { month: 'short', day: 'numeric' }
  return dayFormatter(locale, options).format(ms)
}

/** A calendar day in full in the portal's language: "Tuesday, November 3, 2026". */
export function formatDayLong(day: string, locale: string): string {
  const ms = parseDay(day)
  if (ms === null) return day
  return dayFormatter(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(ms)
}

/** The Monday-to-Sunday span of a week in the portal's language: "Oct 26 – Nov 1". */
export function formatWeekRange(weekStart: string, locale: string): string {
  if (parseDay(weekStart) === null) return weekStart
  return `${formatDayShort(weekStart, locale)} – ${formatDayShort(weekEndOf(weekStart), locale)}`
}

export interface WeekCount {
  /** Monday that starts the week. */
  start: string
  /** How many items fall in it. */
  count: number
}

/**
 * The weeks that have something in them, newest first, each with its count.
 * `current` is always listed (with 0 if empty) so a fresh Monday still shows
 * "This week". Weeks after `current` are left out; nothing is posted ahead.
 */
export function weeksWithItems(itemWeeks: readonly (string | null)[], current: string): WeekCount[] {
  const counts = new Map<string, number>([[current, 0]])
  for (const week of itemWeeks) {
    if (week === null || week > current) continue
    counts.set(week, (counts.get(week) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([start, count]) => ({ start, count }))
    .sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0))
}

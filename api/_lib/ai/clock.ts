/**
 * Dates, as the daycare experiences them.
 *
 * `src/lib/helpers.ts`'s `todayISO()` formats `new Date()` in the machine's own
 * timezone. In the browser that machine is the owner's, in Eastern time, so it
 * is right. On a Vercel function the machine is in UTC, so the same call
 * returns tomorrow's date from 8pm Eastern onward — which would make Ro report
 * an empty attendance sheet every evening and make §5's `daily_log_missing`
 * watcher fire against a day that has not started yet.
 *
 * ARCHITECTURE.md's rule is "use todayISO(), never toISOString()". This is the
 * server-side half of that same rule: a fixed daycare timezone rather than
 * whatever the host happens to run in. Aunties Tykes operates in Camp Hill, PA.
 */

export const DAYCARE_TIME_ZONE = 'America/New_York'

const DATE_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: DAYCARE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const TIME_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: DAYCARE_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((entry) => entry.type === type)?.value ?? ''
}

/** Today at the daycare, as `yyyy-MM-dd` — the format every date column uses. */
export function todayInZone(now: Date = new Date()): string {
  const parts = DATE_PARTS.formatToParts(now)
  return `${part(parts, 'year')}-${part(parts, 'month')}-${part(parts, 'day')}`
}

/** The current wall-clock time at the daycare, as 24h `HH:mm`. */
export function timeInZone(now: Date = new Date()): string {
  const parts = TIME_PARTS.formatToParts(now)
  return `${part(parts, 'hour')}:${part(parts, 'minute')}`
}

/**
 * Shifts a `yyyy-MM-dd` date by whole days.
 *
 * Deliberately arithmetic on a UTC midnight rather than a local Date: adding 24
 * hours to a local timestamp lands on the same calendar day twice a year, on the
 * two DST changeovers. Calendar days do not have that problem.
 */
export function shiftDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map((piece) => Number(piece))
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return iso
  const base = Date.UTC(year, month - 1, day)
  const moved = new Date(base + days * 86_400_000)
  const shiftedYear = moved.getUTCFullYear().toString().padStart(4, '0')
  const shiftedMonth = (moved.getUTCMonth() + 1).toString().padStart(2, '0')
  const shiftedDay = moved.getUTCDate().toString().padStart(2, '0')
  return `${shiftedYear}-${shiftedMonth}-${shiftedDay}`
}

/** Whole days from `iso` until today; negative when `iso` is in the future. */
export function daysSince(iso: string, now: Date = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [year, month, day] = iso.split('-').map((piece) => Number(piece))
  const then = Date.UTC(year, month - 1, day)
  const [ty, tm, td] = todayInZone(now).split('-').map((piece) => Number(piece))
  const today = Date.UTC(ty, tm - 1, td)
  return Math.round((today - then) / 86_400_000)
}

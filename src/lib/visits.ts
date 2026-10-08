/**
 * Attendance visits (migration 0020): one row per arrival and departure, so a
 * split day (in 7–9 am, back 3–6 pm) keeps both. The day's AttendanceRecord
 * stays the summary — first arrival, latest departure, status — and nothing
 * ever overwrites an earlier visit.
 *
 * Pure and import-free (type imports are erased), like src/lib/schedule.ts, so
 * Node's test runner can load it directly.
 */
import type { AttendanceVisit } from '../types'

/** Postgres `time` reads back as HH:mm:ss; compare and show as HH:mm. */
function hhmm(value: string): string {
  return value.slice(0, 5)
}

function toMinutes(value: string): number {
  const [hours = 0, minutes = 0] = hhmm(value).split(':').map((piece) => Number(piece))
  return hours * 60 + minutes
}

/** One child's visits on one date, earliest first. */
export function visitsOn(visits: readonly AttendanceVisit[], childId: string, date: string): AttendanceVisit[] {
  return visits
    .filter((visit) => visit.childId === childId && visit.date === date)
    .sort((a, b) => (hhmm(a.checkIn) < hhmm(b.checkIn) ? -1 : hhmm(a.checkIn) > hhmm(b.checkIn) ? 1 : 0))
}

/** The visit still in progress (checked in, not out), if any. The database allows at most one. */
export function openVisit(
  visits: readonly AttendanceVisit[],
  childId: string,
  date: string,
): AttendanceVisit | undefined {
  return visits.find((visit) => visit.childId === childId && visit.date === date && visit.checkOut === null)
}

/**
 * Minutes actually spent at the daycare: the sum of completed visits. The gap
 * between visits of a split day is not counted, and a visit still in progress
 * is left out until it ends.
 */
export function visitMinutes(visits: readonly AttendanceVisit[]): number {
  return visits.reduce((total, visit) => {
    if (visit.checkOut === null) return total
    const span = toMinutes(visit.checkOut) - toMinutes(visit.checkIn)
    return span > 0 ? total + span : total
  }, 0)
}

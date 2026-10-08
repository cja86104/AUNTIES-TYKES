/**
 * Schedules, as Ro reads them — the server half of src/lib/schedule.ts.
 *
 * Every question Ro answers about who is expected (her opening numbers,
 * attendance_today, schedule_for_date, the daily_log_missing watcher) goes
 * through `loadDays` and the SAME `buildDayRoster` the console runs, so Ro and
 * the attendance page can never disagree about a headcount.
 *
 * Reads run on the caller's own JWT; RLS decides what comes back.
 */

import {
  buildDayRoster,
  formatDayBlocks,
  summarizeSchedule,
  type ChildDay,
  type DayRoster,
  type ResolverChange,
  type ResolverEvent,
  type ResolverPlan,
  type RosterChild,
  type RosterRecord,
} from '../../../src/lib/schedule.js'
import type { WeeklySchedule } from '../../../src/types.js'
import type { ToolContext } from './tools/kit.js'

/** Never more than this many days at once: a fortnight answers "next week". */
export const MAX_DAYS = 14

const MAX_ROWS = 500

/** A child as the roster needs it, plus what Ro reports alongside. */
export interface ServerChild extends RosterChild {
  familyId: string
  plan: string
}

export interface ServerRecord extends RosterRecord {
  note: string
}

export interface ServerVisit {
  childId: string
  date: string
  checkIn: string
  checkOut: string | null
}

export interface LoadedDays {
  children: ServerChild[]
  records: ServerRecord[]
  visits: ServerVisit[]
  changes: (ResolverChange & { date: string })[]
  events: ResolverEvent[]
  plans: (ResolverPlan & { note: string })[]
  familyNames: Map<string, string>
  /** The roster for each date asked for, in order. */
  days: { date: string; roster: DayRoster<ServerChild, ServerRecord> }[]
}

/**
 * Reads everything needed to say who is expected on each of `dates` (in
 * order, at most MAX_DAYS of them), and builds each day's roster. A string is
 * the reason it could not.
 */
export async function loadDays(ctx: ToolContext, dates: string[]): Promise<LoadedDays | string> {
  if (dates.length === 0) return 'no dates'
  const from = dates[0] ?? ''
  const to = dates[dates.length - 1] ?? from

  const children = await ctx.caller.db
    .from('children')
    .select('id, family_id, name, status, start_date, schedule, plan')
    .limit(MAX_ROWS)
  if (children.error !== null) return `the roster: ${children.error.message}`

  const records = await ctx.caller.db
    .from('attendance')
    .select('child_id, date, status, check_in, check_out, note')
    .gte('date', from)
    .lte('date', to)
    .limit(MAX_ROWS)
  if (records.error !== null) return `attendance: ${records.error.message}`

  const visits = await ctx.caller.db
    .from('attendance_visits')
    .select('child_id, date, check_in, check_out')
    .gte('date', from)
    .lte('date', to)
    .order('check_in', { ascending: true })
    .limit(MAX_ROWS)
  if (visits.error !== null) return `visits: ${visits.error.message}`

  const changes = await ctx.caller.db
    .from('child_schedule_changes')
    .select('child_id, date, blocks, note')
    .gte('date', from)
    .lte('date', to)
    .limit(MAX_ROWS)
  if (changes.error !== null) return `schedule changes: ${changes.error.message}`

  // Anything that starts by the last day; covers() in the resolver checks the end.
  const events = await ctx.caller.db
    .from('calendar_events')
    .select('kind, title, starts_on, ends_on, closes_at, child_id')
    .lte('starts_on', to)
    .limit(MAX_ROWS)
  if (events.error !== null) return `the calendar: ${events.error.message}`

  // Every plan that has started by the last day; the resolver picks per date.
  const plans = await ctx.caller.db
    .from('child_schedule_plans')
    .select('child_id, starts_on, schedule, note')
    .lte('starts_on', to)
    .limit(MAX_ROWS)
  if (plans.error !== null) return `planned schedules: ${plans.error.message}`

  const families = await ctx.caller.db.from('families').select('id, name').limit(MAX_ROWS)
  if (families.error !== null) return `families: ${families.error.message}`

  const loaded: LoadedDays = {
    children: children.data.map((row) => ({
      id: row.id,
      familyId: row.family_id,
      name: row.name,
      status: row.status,
      startDate: row.start_date ?? '',
      schedule: row.schedule,
      plan: row.plan,
    })),
    records: records.data.map((row) => ({
      childId: row.child_id,
      date: row.date,
      status: row.status,
      checkIn: row.check_in,
      checkOut: row.check_out,
      note: row.note,
    })),
    visits: visits.data.map((row) => ({ childId: row.child_id, date: row.date, checkIn: row.check_in, checkOut: row.check_out })),
    changes: changes.data.map((row) => ({ childId: row.child_id, date: row.date, blocks: row.blocks, note: row.note })),
    events: events.data.map((row) => ({
      kind: row.kind,
      title: row.title,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      closesAt: row.closes_at,
      childId: row.child_id,
    })),
    plans: plans.data.map((row) => ({ childId: row.child_id, startsOn: row.starts_on, schedule: row.schedule, note: row.note })),
    familyNames: new Map(families.data.map((row) => [row.id, row.name])),
    days: [],
  }
  loaded.days = dates.map((date) => ({
    date,
    roster: buildDayRoster(loaded.children, loaded.records, loaded.changes, loaded.events, date, loaded.plans),
  }))
  return loaded
}

/**
 * A child's weekly schedule in Ro's words. "schedule unknown" is deliberate:
 * a child whose schedule was never entered is NOT "not coming" — Ro must say
 * she does not know rather than report them absent or off.
 */
export function scheduleWords(child: { schedule?: WeeklySchedule | null; plan: string }): string {
  const summary = summarizeSchedule(child, 'en-US')
  if (summary.kind === 'set') return summary.text
  if (summary.kind === 'no_days') return 'no days scheduled'
  return summary.legacyPlan !== ''
    ? `schedule unknown — never entered (old enrollment plan said "${summary.legacyPlan}")`
    : 'schedule unknown — never entered'
}

/** Why a child is not expected that day, in words Ro can repeat. */
export function notExpectedWords(day: ChildDay): string {
  if (day.state === 'closed') return day.reason !== '' ? `daycare closed (${day.reason})` : 'daycare closed'
  if (day.source === 'exception') return day.reason !== '' ? `not coming — ${day.reason}` : 'not coming (on the calendar)'
  if (day.source === 'change') return day.reason !== '' ? `off that day by a one-off change — ${day.reason}` : 'off that day by a one-off change'
  if (day.source === 'not_started') return 'has not started at the daycare yet'
  if (day.source === 'inactive') return 'not active (waitlist)'
  if (day.closesAt !== undefined) return `the early close (${day.closesAt}) comes before their time`
  return 'not a day they come'
}

/** "7–9 am, 3–6 pm", plus why when a one-off change set it. */
export function expectedWords(day: ChildDay): string {
  const times = formatDayBlocks(day.blocks, 'en-US')
  const capped = day.closesAt !== undefined ? ` (cut short by the early close at ${day.closesAt})` : ''
  if (day.source === 'change') return `${times} — one-off change${day.reason !== '' ? `: ${day.reason}` : ''}${capped}`
  return `${times}${capped}`
}

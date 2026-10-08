import { useTranslation } from 'react-i18next'
import { Badge, statusTone } from './ui'
import { fmtTime } from '../lib/helpers'
import { formatDayBlocks, summarizeSchedule } from '../lib/schedule'
import type { RosterRow } from '../lib/schedule'
import type { AttendanceRecord, Child, WeeklySchedule } from '../types'

/** A roster row as the console holds it. */
export type ConsoleRosterRow = RosterRow<Child, AttendanceRecord>

/** The fields a schedule summary reads. A `Child` satisfies this. */
interface HasSchedule {
  schedule?: WeeklySchedule | null
  plan: string
}

/** The console is English-only (see CLAUDE.md). */
const CONSOLE_LOCALE = 'en-US'

/**
 * For display only: a line may break between days (after " · ") or between a
 * day's times (after ", "), never inside one ("Tue–Fri 8 / am–5 pm"):
 *  - every other space becomes a no-break space;
 *  - a word joiner after each en dash stops a break at "Tue– / Fri";
 *  - the space before "·" is no-break, so a line ends with the dot rather
 *    than starting with it.
 * Split-and-join rather than a lookbehind regex, which older iPhone Safari
 * cannot parse at all. Plain text (search, Ro) keeps ordinary characters.
 */
function keepTimesTogether(text: string): string {
  return text
    .split(' · ')
    .map((entry) =>
      entry
        .split(', ')
        .map((part) => part.replace(/ /g, '\u00A0').replace(/–/g, '–\u2060'))
        .join(', '),
    )
    .join('\u00A0· ')
}

/** True when nobody has entered this child's weekly schedule yet. */
export function scheduleNotSet(child: HasSchedule): boolean {
  return child.schedule === undefined || child.schedule === null
}

/**
 * The schedule as one line of plain English, for the console's one-line
 * metas, page headers and search. A child without a schedule keeps their old
 * plan text, flagged so it is never mistaken for a real schedule.
 */
export function consoleScheduleText(child: HasSchedule): string {
  const summary = summarizeSchedule(child, CONSOLE_LOCALE)
  if (summary.kind === 'set') return summary.text
  if (summary.kind === 'no_days') return 'No days scheduled'
  return summary.legacyPlan !== '' ? `${summary.legacyPlan} (schedule not set)` : 'Schedule not set'
}

/** Console display: the schedule, or the old plan text with a "Schedule not set" marker. */
export function ConsoleSchedule({ child }: { child: HasSchedule }) {
  const summary = summarizeSchedule(child, CONSOLE_LOCALE)
  if (summary.kind === 'set') return <span>{keepTimesTogether(summary.text)}</span>
  if (summary.kind === 'no_days') return <span>No days scheduled</span>
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      {summary.legacyPlan !== '' && <span>{summary.legacyPlan}</span>}
      <Badge tone="amber">Schedule not set</Badge>
    </span>
  )
}

/** Parent-portal display, in the parent's language: day names and clock from their locale. */
export function PortalSchedule({ child }: { child: HasSchedule }) {
  const { t, i18n } = useTranslation()
  const summary = summarizeSchedule(child, i18n.language)
  if (summary.kind === 'set') return <span>{keepTimesTogether(summary.text)}</span>
  if (summary.kind === 'no_days') return <span>{t('schedule.noDays')}</span>
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {summary.legacyPlan !== '' && <span>{summary.legacyPlan}</span>}
      <Badge tone="amber">{t('schedule.notSet')}</Badge>
    </span>
  )
}

/**
 * What a child's day looks like on the roster, in one short line: today's
 * times, or why they are not expected. "7–9 am, 3–6 pm" / "Off today: trip".
 */
export function consoleDayText(row: ConsoleRosterRow): string {
  const { day } = row
  if (day.state === 'expected') return formatDayBlocks(day.blocks, CONSOLE_LOCALE)
  if (day.state === 'unscheduled') return consoleScheduleText(row.child)
  if (day.state === 'closed') return day.reason !== '' ? `Closed: ${day.reason}` : 'Closed'
  if (day.source === 'exception') return day.reason !== '' ? `Not coming: ${day.reason}` : 'Not coming'
  if (day.source === 'change') return day.reason !== '' ? `Off today: ${day.reason}` : 'Off today'
  if (day.source === 'not_started') return 'Has not started yet'
  return 'Not scheduled today'
}

/**
 * The status pill for a roster row. Children in the side groups (no schedule,
 * not today) who have no record get a pill saying so rather than "expected",
 * which they are not.
 */
export function ConsoleRosterBadge({ row, group }: { row: ConsoleRosterRow; group: 'main' | 'unscheduled' | 'notToday' }) {
  if (group === 'unscheduled') return <Badge tone="amber" className="shrink-0">no schedule</Badge>
  if (group === 'notToday') return <Badge tone="neutral" className="shrink-0">not today</Badge>
  if (row.phase === 'returning' && row.returnsAt) {
    return <Badge tone="amber" className="shrink-0">back at {fmtTime(row.returnsAt)}</Badge>
  }
  const status = row.record?.status ?? 'expected'
  return (
    <Badge tone={statusTone(status)} className="shrink-0">
      {status}
    </Badge>
  )
}

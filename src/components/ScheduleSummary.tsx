import { useTranslation } from 'react-i18next'
import { Badge } from './ui'
import { summarizeSchedule } from '../lib/schedule'
import type { WeeklySchedule } from '../types'

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

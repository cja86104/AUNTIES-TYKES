/**
 * Schedule changes Melissa tells Ro about ahead of time — the "Schedule
 * changes" panel on a child's page, as two tools:
 *
 *  - schedule_change_set: one date differs from the usual week (different
 *    times, not coming, or back to the usual).
 *  - schedule_plan_set: a new usual week from a date on ("from the 20th Ellie
 *    comes Mon, Wed and Fri"). It takes over by itself on that date — the
 *    roster reads it by date, and `promote_due_schedule_plans` folds it into the
 *    child's profile the next time she opens the console or Ro.
 *
 * Both wait for her tap like every Low-tier action; the writes are
 * `scheduleChangeExecutor` / `schedulePlanExecutor` in `../execute.ts`. The
 * family sees either in their portal exactly as when it is saved from the
 * console, and nothing is sent to them.
 *
 * Taking a one-off change back or cancelling a planned week deletes that row —
 * the one exception to office.ts's "nothing here deletes". The row is only her
 * own note about the future; removing it puts the child back on the weekly
 * schedule already on file, and the card says exactly that before she taps.
 *
 * The same rules as the console and migration 0020 apply, through the same
 * functions in src/lib/schedule.ts, so nothing Ro proposes is refused later.
 */

import type { ScheduleBlock, WeeklySchedule } from '../../../../src/types.js'
import {
  dayProblem,
  formatDayBlocks,
  formatWeeklySchedule,
  MAX_BLOCKS_PER_DAY,
  patternOn,
  sanitizeWeeklySchedule,
  sortedBlocks,
  weekdayOf,
  WEEKDAYS,
  type DayProblem,
  type ResolverPlan,
} from '../../../../src/lib/schedule.js'
import { prettyDate, shiftDays } from '../clock.js'
import { loadDays, scheduleWords } from '../schedules.js'
import { offer } from './office.js'
import {
  dbFailure,
  readBoolean,
  readDate,
  readEnum,
  readString,
  schema,
  type ToolOutcome,
  type ToolSpec,
} from './kit.js'

/** The console's MAX_NOTE in ScheduleChangesPanel.tsx. */
export const MAX_SCHEDULE_NOTE = 200

export const CHANGE_ACTIONS = ['times', 'off', 'remove'] as const

const FAMILY_SEES =
  'Yes — it shows in their parent portal, the same as when you change it on the child’s page. Nothing is sent to them.'

const PROBLEM_WORDS: Record<DayProblem, string> = {
  missing_time: 'every time must be 24-hour HH:mm, like 08:30 or 15:00',
  end_before_start: 'each pickup must be after its drop-off',
  overlap: 'two of the times overlap',
  too_many: `at most ${String(MAX_BLOCKS_PER_DAY)} drop-off and pickup pairs in one day`,
}

const WEEK_RULES =
  'give each day as a list of {start, end} in 24-hour HH:mm, pickup after drop-off, no ' +
  `overlaps, at most ${String(MAX_BLOCKS_PER_DAY)} a day, and at least one day with times`

const BLOCK_SCHEMA = schema(
  {
    start: { type: 'string', description: 'Drop-off, 24-hour HH:mm, e.g. 07:30' },
    end: { type: 'string', description: 'Pickup, 24-hour HH:mm, e.g. 15:00' },
  },
  ['start', 'end'],
)

const DAY_SCHEMA = { type: 'array', items: BLOCK_SCHEMA, maxItems: MAX_BLOCKS_PER_DAY }

/** A whole week; a day left out is a day they do not come. */
export const WEEK_SCHEMA = schema(Object.fromEntries(WEEKDAYS.map((weekday) => [weekday, DAY_SCHEMA])))

/** A `yyyy-MM-dd` that is a real day — readDate checks only the shape, so Feb 30 passes it. */
export function readRealDate(args: Record<string, unknown>, key: string): string | null {
  const date = readDate(args, key)
  return date !== null && weekdayOf(date) !== null ? date : null
}

/** "9:00" → "09:00"; anything else unchanged, for dayProblem to judge. */
function padHour(value: string): string {
  const trimmed = value.trim()
  return /^\d:\d{2}$/.test(trimmed) ? `0${trimmed}` : trimmed
}

/**
 * One day's times from untrusted JSON — the model's arguments, or a stored
 * proposal. Sorted when good; a string says what is wrong.
 */
export function readBlocks(value: unknown): ScheduleBlock[] | string {
  if (!Array.isArray(value) || value.length === 0) return 'Give at least one drop-off and pickup time'
  const blocks: ScheduleBlock[] = []
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return 'Each time must be a drop-off and pickup: {start, end}'
    }
    const { start, end } = entry as Record<string, unknown>
    if (typeof start !== 'string' || typeof end !== 'string') {
      return 'Each time must be a drop-off and pickup: {start, end}'
    }
    blocks.push({ start: padHour(start), end: padHour(end) })
  }
  const problem = dayProblem(blocks)
  return problem === null ? sortedBlocks(blocks) : `Those times will not work: ${PROBLEM_WORDS[problem]}`
}

/** A whole week from untrusted JSON, never empty. A string says what is wrong. */
export function readWeek(value: unknown): WeeklySchedule | string {
  const week = sanitizeWeeklySchedule(value)
  return week === undefined ? `That weekly schedule will not work: ${WEEK_RULES}` : week
}

/** The weekly pattern in Ro's words; null/undefined is "never entered", never "off". */
function weekWords(pattern: WeeklySchedule | null | undefined, legacyPlan: string): string {
  return pattern === undefined || pattern === null
    ? scheduleWords({ schedule: null, plan: legacyPlan })
    : scheduleWords({ schedule: pattern, plan: '' })
}

/** What the weekly pattern says for one date. */
function usualOn(pattern: WeeklySchedule | null | undefined, date: string, legacyPlan: string): string {
  if (pattern === undefined || pattern === null) return weekWords(pattern, legacyPlan)
  const weekday = weekdayOf(date)
  const blocks = weekday === null ? [] : (pattern[weekday] ?? [])
  return blocks.length > 0 ? formatDayBlocks(blocks, 'en-US') : 'not a day they come'
}

function blocksWords(blocks: readonly ScheduleBlock[]): string {
  return blocks.length > 0 ? formatDayBlocks(blocks, 'en-US') : 'not coming'
}

/* --------------------------- schedule.change ------------------------------ */

const scheduleChangeSet: ToolSpec = {
  name: 'schedule_change_set',
  tier: 'low',
  description:
    'Record that ONE date is different from a child\'s usual week — today or any later ' +
    'date: different drop-off/pickup times (action "times" with blocks), not coming that ' +
    'day (action "off"), or taking back a change already saved so the usual schedule ' +
    'applies again (action "remove"). Use it when she says things like "Ellie is coming ' +
    'at 10 next Friday" or "Sam is off on the 23rd". For a lasting new pattern ("from ' +
    'the 20th she comes Mondays and Wednesdays") use schedule_plan_set instead. Get the ' +
    'childId from roster_list. Use only times she gave — ask if she did not say them. ' +
    'Nothing happens until she taps; the family sees the change in their portal.',
  parameters: schema(
    {
      childId: { type: 'string', description: 'From roster_list' },
      date: { type: 'string', description: 'yyyy-MM-dd, today or later' },
      action: { type: 'string', enum: CHANGE_ACTIONS },
      blocks: {
        ...DAY_SCHEMA,
        description: 'Only for action "times": that day\'s drop-off and pickup times, in order',
      },
      note: { type: 'string', description: 'Her reason, in her words, if she gave one. Families see it' },
    },
    ['childId', 'date', 'action'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const childId = readString(args, 'childId')
    if (childId === null) return { ok: false, error: 'Which child? Give the childId from roster_list' }
    const date = readRealDate(args, 'date')
    if (date === null) return { ok: false, error: 'The date must be a real day, as yyyy-MM-dd' }
    if (date < ctx.today) {
      return { ok: false, error: 'That date has passed. A past day is corrected on the Attendance page.' }
    }
    const action = readEnum(args, 'action', CHANGE_ACTIONS, 'times')
    const note = action === 'remove' ? '' : (readString(args, 'note')?.slice(0, MAX_SCHEDULE_NOTE) ?? '')

    let blocks: ScheduleBlock[] | null = null
    if (action === 'times') {
      const read = readBlocks(args.blocks)
      if (typeof read === 'string') return { ok: false, error: read }
      blocks = read
    } else if (action === 'off') {
      blocks = []
    }

    const loaded = await loadDays(ctx, [date])
    if (typeof loaded === 'string') return { ok: false, error: `Could not read ${loaded}` }
    const child = loaded.children.find((entry) => entry.id === childId)
    if (child === undefined) {
      return { ok: true, data: { changed: false, reason: 'no child has that id — look them up with roster_list', childId } }
    }
    const existing = loaded.changes.find((entry) => entry.childId === childId && entry.date === date)
    if (action === 'remove' && existing === undefined) {
      return {
        ok: true,
        data: { changed: false, reason: `${child.name} has no one-off change on ${prettyDate(date)} to take back` },
      }
    }

    const usual = usualOn(patternOn(child, date, loaded.plans), date, child.plan)
    const roster = loaded.days[0]?.roster
    const row = roster === undefined
      ? undefined
      : [...roster.main, ...roster.unscheduled, ...roster.notToday].find((entry) => entry.child.id === childId)

    const detail: { label: string; value: string }[] = [
      { label: 'Child', value: child.name },
      { label: 'Date', value: prettyDate(date) },
      { label: 'Usually', value: usual },
    ]
    if (blocks === null) {
      detail.push({ label: 'Taking back', value: existing === undefined ? '' : blocksWords(existing.blocks) })
      detail.push({ label: 'Becomes', value: `the usual schedule (${usual})` })
    } else {
      detail.push({ label: 'Becomes', value: blocksWords(blocks) })
      if (existing !== undefined) detail.push({ label: 'Replaces', value: `the change already saved (${blocksWords(existing.blocks)})` })
      if (note !== '') detail.push({ label: 'Note', value: note })
    }
    if (child.status !== 'active') {
      detail.push({ label: 'Careful', value: `${child.name} is on the waitlist, so is not expected on any day.` })
    } else if (child.startDate !== '' && date < child.startDate) {
      detail.push({ label: 'Careful', value: `${child.name} does not start until ${prettyDate(child.startDate)}.` })
    }
    if (roster?.closure) {
      detail.push({ label: 'Careful', value: `The daycare is closed that day (${roster.closure.title}), so nobody is expected.` })
    } else if (row?.day.source === 'exception') {
      detail.push({
        label: 'Careful',
        value: `The calendar already says ${child.name} is not coming that day ("${row.day.reason}"), and that note wins over this.`,
      })
    } else if (roster?.earlyClose && blocks !== null && blocks.length > 0) {
      detail.push({ label: 'Careful', value: `The daycare closes early that day, at ${roster.earlyClose.closesAt}.` })
    }
    detail.push({ label: 'Family sees it', value: FAMILY_SEES })

    const payload = { childId, childName: child.name, date, action, blocks, note }
    const familyLabel = loaded.familyNames.get(child.familyId)
    return offer(
      ctx,
      'schedule.change',
      payload,
      {
        kind: 'schedule.change',
        title:
          action === 'remove'
            ? 'Back to the usual schedule for one day'
            : action === 'off'
              ? 'Not coming one day'
              : 'Different times one day',
        summary: `${child.name} · ${prettyDate(date)}`,
        detail,
        confirmLabel: action === 'remove' ? 'Take it back' : 'Save the change',
      },
      {
        familyId: child.familyId,
        ...(familyLabel === undefined ? {} : { familyLabel }),
        childId,
        childLabel: child.name,
        targets: [childId],
      },
    )
  },
}

/* ---------------------------- schedule.plan ------------------------------- */

const schedulePlanSet: ToolSpec = {
  name: 'schedule_plan_set',
  tier: 'low',
  description:
    'Record a NEW usual weekly schedule for a child that starts on a later date — "from ' +
    'the 20th Ellie comes Mon, Wed and Fri 8 to 3". Until that date the current week ' +
    'stays; from it, the new one takes over by itself. Give the WHOLE new week (a day ' +
    'left out means they do not come that day). To cancel a planned new week before it ' +
    'starts, give its startsOn with cancel: true. For a single different day use ' +
    'schedule_change_set instead; a change starting today is made on the child\'s page. ' +
    'Check schedule_for_date with childId first to see the current week and anything ' +
    'already planned. Use only times she gave — ask if she did not say them. Nothing ' +
    'happens until she taps; the family sees it in their portal.',
  parameters: schema(
    {
      childId: { type: 'string', description: 'From roster_list' },
      startsOn: { type: 'string', description: 'yyyy-MM-dd, after today' },
      schedule: { ...WEEK_SCHEMA, description: 'The whole new week, keyed mon…sun. Not needed with cancel' },
      note: { type: 'string', description: 'Her reason, in her words, if she gave one. Families see it' },
      cancel: { type: 'boolean', description: 'true to cancel the new week already planned from startsOn' },
    },
    ['childId', 'startsOn'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const childId = readString(args, 'childId')
    if (childId === null) return { ok: false, error: 'Which child? Give the childId from roster_list' }
    const startsOn = readRealDate(args, 'startsOn')
    if (startsOn === null) return { ok: false, error: 'startsOn must be a real day, as yyyy-MM-dd' }
    if (startsOn <= ctx.today) {
      return {
        ok: false,
        error:
          'A new weekly schedule has to start after today. To change the schedule from today ' +
          'on, she edits it on the child’s page; for today only, use schedule_change_set.',
      }
    }
    const cancel = readBoolean(args, 'cancel', false)
    const note = cancel ? '' : (readString(args, 'note')?.slice(0, MAX_SCHEDULE_NOTE) ?? '')

    let week: WeeklySchedule | null = null
    if (!cancel) {
      const read = readWeek(args.schedule)
      if (typeof read === 'string') return { ok: false, error: read }
      week = read
    }

    const child = await ctx.caller.db
      .from('children')
      .select('id, family_id, name, status, schedule, plan')
      .eq('id', childId)
      .maybeSingle()
    if (child.error !== null) return dbFailure('that child', child.error)
    if (child.data === null) {
      return { ok: true, data: { changed: false, reason: 'no child has that id — look them up with roster_list', childId } }
    }
    const found = child.data

    const planned = await ctx.caller.db
      .from('child_schedule_plans')
      .select('starts_on, schedule')
      .eq('child_id', childId)
      .order('starts_on', { ascending: true })
    if (planned.error !== null) return dbFailure('planned schedules', planned.error)

    const family = await ctx.caller.db.from('families').select('name').eq('id', found.family_id).maybeSingle()
    if (family.error !== null) return dbFailure('that family', family.error)

    const plans: ResolverPlan[] = planned.data.map((row) => ({ childId, startsOn: row.starts_on, schedule: row.schedule }))
    const existing = plans.find((plan) => plan.startsOn === startsOn)
    if (cancel && existing === undefined) {
      return {
        ok: true,
        data: { changed: false, reason: `${found.name} has no new weekly schedule planned from ${prettyDate(startsOn)}` },
      }
    }

    const others = plans.filter((plan) => plan.startsOn !== startsOn)
    const untilThen = weekWords(patternOn(found, shiftDays(startsOn, -1), others), found.plan)
    const detail: { label: string; value: string }[] = [
      { label: 'Child', value: found.name },
      { label: 'Starts', value: prettyDate(startsOn) },
      { label: 'Until then', value: untilThen },
    ]
    if (week === null) {
      detail.push({ label: 'Cancelling', value: existing === undefined ? '' : weekWords(existing.schedule, '') })
      detail.push({ label: 'From then on', value: `stays ${weekWords(patternOn(found, startsOn, others), found.plan)}` })
    } else {
      detail.push({ label: 'From then on', value: formatWeeklySchedule(week, 'en-US') })
      if (existing !== undefined) {
        detail.push({ label: 'Replaces', value: `the new week already planned (${weekWords(existing.schedule, '')})` })
      }
      if (note !== '') detail.push({ label: 'Note', value: note })
      detail.push({ label: 'When it starts', value: 'It takes over by itself that day — nothing to remember.' })
    }
    const later = others.find((plan) => plan.startsOn > startsOn)
    if (later !== undefined) {
      detail.push({
        label: 'Careful',
        value: `Another new week is already planned from ${prettyDate(later.startsOn)}, and takes over on that date.`,
      })
    }
    if (found.status !== 'active') {
      detail.push({ label: 'Careful', value: `${found.name} is on the waitlist, so is not expected on any day.` })
    }
    detail.push({ label: 'Family sees it', value: FAMILY_SEES })

    const payload = { childId, childName: found.name, startsOn, schedule: week, note, cancel }
    return offer(
      ctx,
      'schedule.plan',
      payload,
      {
        kind: 'schedule.plan',
        title: cancel ? 'Cancel a planned new weekly schedule' : 'New weekly schedule from a date',
        summary: `${found.name} · from ${prettyDate(startsOn)}`,
        detail,
        confirmLabel: cancel ? 'Cancel it' : 'Save the new schedule',
      },
      {
        familyId: found.family_id,
        ...(family.data === null ? {} : { familyLabel: family.data.name }),
        childId,
        childLabel: found.name,
        targets: [childId],
      },
    )
  },
}

export const scheduleTools: ToolSpec[] = [scheduleChangeSet, schedulePlanSet]

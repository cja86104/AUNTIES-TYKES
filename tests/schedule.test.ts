/**
 * Resolver tests. Run with `npm test` — Node's built-in test runner, no extra
 * dependencies. Node strips the TypeScript types itself, which is why imports
 * here name the `.ts` file and every type-only import says `import type`.
 *
 * `describe()` and `it()` return promises the runner itself awaits and
 * reports on; `void` marks each one as deliberately not awaited here.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
  ChildDay,
  ResolverChange,
  ResolverChild,
  ResolverEvent,
  ResolverPlan,
  RosterChild,
  RosterRecord,
} from '../src/lib/schedule.ts'
import {
  buildDayRoster,
  dayProblem,
  formatBlock,
  formatWeeklySchedule,
  patternOn,
  resolveChildDay,
  sanitizeWeeklySchedule,
  scheduleForSaving,
  scheduleProblems,
  summarizeSchedule,
  toHHmm,
  WEEKDAYS,
  weekdayOf,
} from '../src/lib/schedule.ts'

// October 2026: Mon 5, Tue 6, Wed 7, Thu 8, Fri 9, Sat 10, Sun 11.
const MON = '2026-10-05'
const TUE = '2026-10-06'
const WED = '2026-10-07'
const FRI = '2026-10-09'
const SAT = '2026-10-10'
const SUN = '2026-10-11'

function child(overrides: Partial<ResolverChild> = {}): ResolverChild {
  return {
    id: 'chd_ellie',
    status: 'active',
    startDate: '2026-01-05',
    schedule: {
      mon: [{ start: '07:00', end: '09:00' }, { start: '15:00', end: '18:00' }],
      tue: [{ start: '09:00', end: '15:00' }],
      wed: [],
      sat: [{ start: '09:00', end: '13:00' }],
      sun: [{ start: '10:00', end: '12:00' }],
    },
    ...overrides,
  }
}

function event(overrides: Partial<ResolverEvent> & Pick<ResolverEvent, 'kind'>): ResolverEvent {
  return { title: 'Event', startsOn: TUE, ...overrides }
}

/** Asserts only the listed fields, leaving the rest of the result unchecked. */
function hasFields(actual: ChildDay, expected: Partial<ChildDay>): void {
  for (const key of Object.keys(expected) as (keyof ChildDay)[]) {
    assert.deepStrictEqual(actual[key], expected[key], `field "${key}"`)
  }
}

const none: ResolverChange[] = []
const noEvents: ResolverEvent[] = []

void describe('weekdayOf', () => {
  void it('reads every weekday from the string, Monday through Sunday', () => {
    assert.deepStrictEqual(
      ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'].map(weekdayOf),
      ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    )
  })

  void it('is unaffected by DST changeovers and leap days', () => {
    assert.equal(weekdayOf('2026-11-01'), 'sun') // US DST ends
    assert.equal(weekdayOf('2026-03-08'), 'sun') // US DST starts
    assert.equal(weekdayOf('2028-02-29'), 'tue')
  })

  void it('rejects malformed and impossible dates', () => {
    assert.equal(weekdayOf('2026-02-30'), null)
    assert.equal(weekdayOf('2026-10-5'), null)
    assert.equal(weekdayOf(''), null)
  })
})

void describe('toHHmm', () => {
  void it('drops the seconds Postgres adds to a time column', () => {
    assert.equal(toHHmm('15:30:00'), '15:30')
    assert.equal(toHHmm('07:05'), '07:05')
  })
})

void describe('resolveChildDay: weekly pattern', () => {
  void it('uses the weekday blocks', () => {
    assert.deepStrictEqual(resolveChildDay(child(), TUE, none, noEvents), {
      state: 'expected',
      blocks: [{ start: '09:00', end: '15:00' }],
      source: 'pattern',
      reason: '',
    })
  })

  void it('keeps both blocks of a split day, in order', () => {
    hasFields(resolveChildDay(child(), MON, none, noEvents), {
      state: 'expected',
      blocks: [{ start: '07:00', end: '09:00' }, { start: '15:00', end: '18:00' }],
    })
  })

  void it('sorts blocks even if they arrive out of order', () => {
    const day = resolveChildDay(
      child({ schedule: { mon: [{ start: '15:00', end: '18:00' }, { start: '07:00', end: '09:00' }] } }),
      MON,
      none,
      noEvents,
    )
    assert.deepStrictEqual(day.blocks.map((block) => block.start), ['07:00', '15:00'])
  })

  void it('treats an explicitly empty day as not expected', () => {
    hasFields(resolveChildDay(child(), WED, none, noEvents), { state: 'not_expected', source: 'pattern' })
  })

  void it('treats a day missing from the pattern as not expected', () => {
    hasFields(resolveChildDay(child(), FRI, none, noEvents), { state: 'not_expected', source: 'pattern' })
  })

  void it('treats Saturday and Sunday exactly like any other day', () => {
    hasFields(resolveChildDay(child(), SAT, none, noEvents), {
      state: 'expected',
      blocks: [{ start: '09:00', end: '13:00' }],
    })
    hasFields(resolveChildDay(child(), SUN, none, noEvents), {
      state: 'expected',
      blocks: [{ start: '10:00', end: '12:00' }],
    })
    hasFields(
      resolveChildDay(child({ schedule: { mon: [{ start: '08:00', end: '16:00' }] } }), SAT, none, noEvents),
      { state: 'not_expected' },
    )
  })

  void it('normalizes HH:mm:ss times', () => {
    const day = resolveChildDay(
      child({ schedule: { tue: [{ start: '09:00:00', end: '15:00:00' }] } }),
      TUE,
      none,
      noEvents,
    )
    assert.deepStrictEqual(day.blocks, [{ start: '09:00', end: '15:00' }])
  })
})

void describe('resolveChildDay: NULL versus empty schedule', () => {
  void it('reports a never-set schedule (undefined) as unscheduled, not as off', () => {
    assert.deepStrictEqual(resolveChildDay(child({ schedule: undefined }), TUE, none, noEvents), {
      state: 'unscheduled',
      blocks: [],
      source: 'unscheduled',
      reason: '',
    })
  })

  void it('reports a never-set schedule (null, as read on the server) as unscheduled', () => {
    assert.equal(resolveChildDay(child({ schedule: null }), TUE, none, noEvents).state, 'unscheduled')
  })

  void it('reports a set-but-empty schedule {} as not expected', () => {
    hasFields(resolveChildDay(child({ schedule: {} }), TUE, none, noEvents), {
      state: 'not_expected',
      source: 'pattern',
    })
  })

  void it('lets a one-off change apply to a child with no schedule yet', () => {
    const changes: ResolverChange[] = [
      { childId: 'chd_ellie', date: TUE, blocks: [{ start: '08:00', end: '12:00' }], note: 'drop-in' },
    ]
    hasFields(resolveChildDay(child({ schedule: undefined }), TUE, changes, noEvents), {
      state: 'expected',
      source: 'change',
      reason: 'drop-in',
    })
  })
})

void describe('resolveChildDay: one-off changes', () => {
  void it('replaces the pattern for that date', () => {
    const changes: ResolverChange[] = [
      { childId: 'chd_ellie', date: TUE, blocks: [{ start: '12:00', end: '17:00' }], note: 'late start' },
    ]
    assert.deepStrictEqual(resolveChildDay(child(), TUE, changes, noEvents), {
      state: 'expected',
      blocks: [{ start: '12:00', end: '17:00' }],
      source: 'change',
      reason: 'late start',
    })
  })

  void it('takes a child off for the day when the change has no blocks', () => {
    const changes: ResolverChange[] = [{ childId: 'chd_ellie', date: TUE, blocks: [], note: 'with grandma' }]
    assert.deepStrictEqual(resolveChildDay(child(), TUE, changes, noEvents), {
      state: 'not_expected',
      blocks: [],
      source: 'change',
      reason: 'with grandma',
    })
  })

  void it('adds a day the child normally does not come', () => {
    const changes: ResolverChange[] = [
      { childId: 'chd_ellie', date: WED, blocks: [{ start: '07:00', end: '09:00' }], note: '' },
    ]
    hasFields(resolveChildDay(child(), WED, changes, noEvents), { state: 'expected', source: 'change' })
  })

  void it('ignores changes for another child or another date', () => {
    const changes: ResolverChange[] = [
      { childId: 'chd_other', date: TUE, blocks: [], note: '' },
      { childId: 'chd_ellie', date: WED, blocks: [], note: '' },
    ]
    hasFields(resolveChildDay(child(), TUE, changes, noEvents), { state: 'expected', source: 'pattern' })
  })
})

void describe('resolveChildDay: calendar closures and exceptions', () => {
  void it('closes the day for everyone on a closure', () => {
    const events = [event({ kind: 'closure', title: 'Columbus Day', startsOn: TUE })]
    assert.deepStrictEqual(resolveChildDay(child(), TUE, none, events), {
      state: 'closed',
      blocks: [],
      source: 'closure',
      reason: 'Columbus Day',
    })
  })

  void it('covers every day of a multi-day closure, inclusive', () => {
    const events = [event({ kind: 'closure', title: 'Vacation', startsOn: MON, endsOn: WED })]
    assert.equal(resolveChildDay(child(), MON, none, events).state, 'closed')
    assert.equal(resolveChildDay(child(), TUE, none, events).state, 'closed')
    hasFields(resolveChildDay(child(), '2026-10-08', none, events), { state: 'not_expected', source: 'pattern' })
  })

  void it('closes a weekend day the child is normally scheduled', () => {
    const events = [event({ kind: 'closure', title: 'Camp closed', startsOn: SAT, endsOn: SUN })]
    hasFields(resolveChildDay(child(), SAT, none, events), { state: 'closed', reason: 'Camp closed' })
    hasFields(resolveChildDay(child(), SUN, none, events), { state: 'closed' })
  })

  void it('beats a one-off change on the same date', () => {
    const changes: ResolverChange[] = [
      { childId: 'chd_ellie', date: TUE, blocks: [{ start: '08:00', end: '10:00' }], note: '' },
    ]
    const events = [event({ kind: 'closure', startsOn: TUE })]
    assert.equal(resolveChildDay(child(), TUE, changes, events).state, 'closed')
  })

  void it('closes the day even for an unscheduled child', () => {
    const events = [event({ kind: 'closure', startsOn: TUE })]
    assert.equal(resolveChildDay(child({ schedule: undefined }), TUE, none, events).state, 'closed')
  })

  void it('takes the child off on their own schedule exception', () => {
    const events = [event({ kind: 'schedule_exception', title: 'Ellie is not coming', childId: 'chd_ellie' })]
    assert.deepStrictEqual(resolveChildDay(child(), TUE, none, events), {
      state: 'not_expected',
      blocks: [],
      source: 'exception',
      reason: 'Ellie is not coming',
    })
  })

  void it('lets a schedule exception beat a one-off change', () => {
    const changes: ResolverChange[] = [
      { childId: 'chd_ellie', date: TUE, blocks: [{ start: '08:00', end: '10:00' }], note: '' },
    ]
    const events = [event({ kind: 'schedule_exception', childId: 'chd_ellie' })]
    assert.equal(resolveChildDay(child(), TUE, changes, events).source, 'exception')
  })

  void it("ignores another child's exception", () => {
    const events = [event({ kind: 'schedule_exception', childId: 'chd_other' })]
    hasFields(resolveChildDay(child(), TUE, none, events), { state: 'expected', source: 'pattern' })
  })

  void it('is not affected by activities and reminders', () => {
    const events = [event({ kind: 'activity', title: 'Pajama day' }), event({ kind: 'reminder', title: 'Bring boots' })]
    hasFields(resolveChildDay(child(), TUE, none, events), { state: 'expected', source: 'pattern' })
  })
})

void describe('resolveChildDay: early close', () => {
  void it('caps a block that runs past closing', () => {
    const events = [event({ kind: 'early_close', startsOn: TUE, closesAt: '12:00' })]
    assert.deepStrictEqual(resolveChildDay(child(), TUE, none, events), {
      state: 'expected',
      blocks: [{ start: '09:00', end: '12:00' }],
      source: 'pattern',
      reason: '',
      closesAt: '12:00',
    })
  })

  void it('drops the second block of a split day that starts after closing', () => {
    const events = [event({ kind: 'early_close', startsOn: MON, closesAt: '13:00:00' })]
    hasFields(resolveChildDay(child(), MON, none, events), {
      blocks: [{ start: '07:00', end: '09:00' }],
      closesAt: '13:00',
    })
  })

  void it('makes the child not expected when every block starts at or after closing', () => {
    const events = [event({ kind: 'early_close', startsOn: TUE, closesAt: '09:00' })]
    hasFields(resolveChildDay(child(), TUE, none, events), {
      state: 'not_expected',
      blocks: [],
      closesAt: '09:00',
    })
  })

  void it('leaves the day alone when care already ends before closing', () => {
    const events = [event({ kind: 'early_close', startsOn: TUE, closesAt: '16:00' })]
    const day = resolveChildDay(child(), TUE, none, events)
    assert.deepStrictEqual(day.blocks, [{ start: '09:00', end: '15:00' }])
    assert.equal(day.closesAt, undefined)
  })

  void it('also caps a one-off change', () => {
    const changes: ResolverChange[] = [
      { childId: 'chd_ellie', date: TUE, blocks: [{ start: '10:00', end: '17:00' }], note: '' },
    ]
    const events = [event({ kind: 'early_close', startsOn: TUE, closesAt: '14:00' })]
    hasFields(resolveChildDay(child(), TUE, changes, events), {
      source: 'change',
      blocks: [{ start: '10:00', end: '14:00' }],
    })
  })

  void it('uses the earlier time when two early closes fall on the same day', () => {
    const events = [
      event({ kind: 'early_close', startsOn: TUE, closesAt: '14:00' }),
      event({ kind: 'early_close', startsOn: TUE, closesAt: '11:30' }),
    ]
    assert.deepStrictEqual(resolveChildDay(child(), TUE, none, events).blocks, [{ start: '09:00', end: '11:30' }])
  })

  void it('does not apply an early close from another date', () => {
    const events = [event({ kind: 'early_close', startsOn: MON, closesAt: '10:00' })]
    assert.deepStrictEqual(resolveChildDay(child(), TUE, none, events).blocks, [{ start: '09:00', end: '15:00' }])
  })
})

void describe('resolveChildDay: who is enrolled', () => {
  void it('never expects an inactive (waitlisted) child, whatever the schedule says', () => {
    const changes: ResolverChange[] = [
      { childId: 'chd_ellie', date: TUE, blocks: [{ start: '08:00', end: '10:00' }], note: '' },
    ]
    assert.deepStrictEqual(resolveChildDay(child({ status: 'waitlist' }), TUE, changes, noEvents), {
      state: 'not_expected',
      blocks: [],
      source: 'inactive',
      reason: '',
    })
  })

  void it('does not expect a child before their start date', () => {
    hasFields(resolveChildDay(child({ startDate: '2026-10-07' }), TUE, none, noEvents), {
      state: 'not_expected',
      source: 'not_started',
    })
  })

  void it('expects a child on their start date', () => {
    assert.equal(resolveChildDay(child({ startDate: TUE }), TUE, none, noEvents).state, 'expected')
  })

  void it('treats an unknown start date as already started', () => {
    assert.equal(resolveChildDay(child({ startDate: '' }), TUE, none, noEvents).state, 'expected')
  })
})

void describe('resolveChildDay: input guard', () => {
  void it('throws on a date that is not real, rather than reporting an empty day', () => {
    assert.throws(() => resolveChildDay(child(), '2026-02-30', none, noEvents), RangeError)
  })
})

// The same accept/reject cases migration 0020's check constraints were run
// against, so the app and the database agree on what a valid day is.
void describe('dayProblem', () => {
  void it('accepts an empty day, a split day and touching blocks', () => {
    assert.equal(dayProblem([]), null)
    assert.equal(dayProblem([{ start: '07:00', end: '09:00' }, { start: '15:00', end: '18:00' }]), null)
    assert.equal(dayProblem([{ start: '09:00', end: '12:00' }, { start: '12:00', end: '15:00' }]), null)
  })

  void it('accepts blocks typed out of order (they are sorted on save)', () => {
    assert.equal(dayProblem([{ start: '15:00', end: '18:00' }, { start: '07:00', end: '09:00' }]), null)
  })

  void it('flags a missing, unpadded or impossible time', () => {
    assert.equal(dayProblem([{ start: '', end: '09:00' }]), 'missing_time')
    assert.equal(dayProblem([{ start: '9:00', end: '12:00' }]), 'missing_time')
    assert.equal(dayProblem([{ start: '24:00', end: '24:30' }]), 'missing_time')
  })

  void it('flags an end at or before the start, so nothing crosses midnight', () => {
    assert.equal(dayProblem([{ start: '09:00', end: '09:00' }]), 'end_before_start')
    assert.equal(dayProblem([{ start: '22:00', end: '02:00' }]), 'end_before_start')
  })

  void it('flags overlapping blocks', () => {
    assert.equal(dayProblem([{ start: '08:00', end: '12:00' }, { start: '11:00', end: '15:00' }]), 'overlap')
  })

  void it('flags a fourth block', () => {
    const four = ['06', '08', '10', '12'].map((hour) => ({ start: `${hour}:00`, end: `${hour}:30` }))
    assert.equal(dayProblem(four), 'too_many')
  })
})

void describe('scheduleProblems', () => {
  void it('reports each bad day by name and nothing for good days', () => {
    assert.deepStrictEqual(
      scheduleProblems({
        mon: [{ start: '07:00', end: '09:00' }],
        sat: [{ start: '13:00', end: '12:00' }],
        sun: [{ start: '', end: '' }],
      }),
      { sat: 'end_before_start', sun: 'missing_time' },
    )
  })
})

void describe('scheduleForSaving', () => {
  void it('sorts blocks and drops empty days', () => {
    assert.deepStrictEqual(
      scheduleForSaving({
        mon: [{ start: '15:00', end: '18:00' }, { start: '07:00', end: '09:00' }],
        tue: [],
        sun: [{ start: '10:00', end: '12:00' }],
      }),
      {
        mon: [{ start: '07:00', end: '09:00' }, { start: '15:00', end: '18:00' }],
        sun: [{ start: '10:00', end: '12:00' }],
      },
    )
  })

  void it('turns a week with no times into "not set", never {}', () => {
    assert.equal(scheduleForSaving({}), undefined)
    assert.equal(scheduleForSaving({ mon: [], sat: [] }), undefined)
  })

  void it('lists days Monday first, weekend last', () => {
    assert.deepStrictEqual([...WEEKDAYS], ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
  })
})

void describe('sanitizeWeeklySchedule (untrusted JSON)', () => {
  void it('keeps a valid schedule, sorted, with extra block fields stripped', () => {
    assert.deepStrictEqual(
      sanitizeWeeklySchedule({
        sat: [{ start: '09:00', end: '13:00', note: 'camp' }],
        mon: [{ start: '15:00', end: '18:00' }, { start: '07:00', end: '09:00' }],
      }),
      {
        mon: [{ start: '07:00', end: '09:00' }, { start: '15:00', end: '18:00' }],
        sat: [{ start: '09:00', end: '13:00' }],
      },
    )
  })

  void it('rejects the whole schedule on anything malformed', () => {
    assert.equal(sanitizeWeeklySchedule({ funday: [] }), undefined)
    assert.equal(sanitizeWeeklySchedule({ mon: 'all day' }), undefined)
    assert.equal(sanitizeWeeklySchedule({ mon: [{ start: 9, end: 12 }] }), undefined)
    assert.equal(sanitizeWeeklySchedule({ mon: [null] }), undefined)
    assert.equal(sanitizeWeeklySchedule({ mon: [{ start: '07:00', end: '09:00' }], tue: [{ start: '12:00', end: '08:00' }] }), undefined)
    assert.equal(sanitizeWeeklySchedule({ mon: [{ start: '08:00', end: '12:00' }, { start: '11:00', end: '15:00' }] }), undefined)
  })

  void it('treats a missing, empty or non-object value as "not set"', () => {
    assert.equal(sanitizeWeeklySchedule(undefined), undefined)
    assert.equal(sanitizeWeeklySchedule(null), undefined)
    assert.equal(sanitizeWeeklySchedule([]), undefined)
    assert.equal(sanitizeWeeklySchedule('Full-time'), undefined)
    assert.equal(sanitizeWeeklySchedule({}), undefined)
    assert.equal(sanitizeWeeklySchedule({ mon: [] }), undefined)
  })
})

const WEEK = {
  mon: [{ start: '07:00', end: '09:00' }, { start: '15:00', end: '18:00' }],
  tue: [{ start: '08:00', end: '17:00' }],
  wed: [{ start: '08:00', end: '17:00' }],
  thu: [{ start: '08:00', end: '17:00' }],
  fri: [{ start: '08:00', end: '17:00' }],
  sat: [{ start: '09:30', end: '12:00' }],
  sun: [{ start: '11:00', end: '13:00' }],
}

void describe('formatBlock', () => {
  void it('writes am/pm once when both ends share it, in English', () => {
    assert.equal(formatBlock({ start: '07:00', end: '09:00' }, 'en-US'), '7–9 am')
    assert.equal(formatBlock({ start: '15:00', end: '18:00' }, 'en-US'), '3–6 pm')
  })

  void it('writes both when the block crosses noon, and shows minutes only when needed', () => {
    assert.equal(formatBlock({ start: '09:00', end: '15:00' }, 'en-US'), '9 am–3 pm')
    assert.equal(formatBlock({ start: '07:30', end: '09:00' }, 'en-US'), '7:30–9 am')
    assert.equal(formatBlock({ start: '11:00', end: '12:00' }, 'en-US'), '11 am–12 pm')
    assert.equal(formatBlock({ start: '00:00', end: '00:30' }, 'en-US'), '12–12:30 am')
  })

  void it("uses the locale's own 24-hour clock in Spanish and Vietnamese", () => {
    assert.equal(formatBlock({ start: '07:00', end: '15:30' }, 'es'), '7:00–15:30')
    assert.equal(formatBlock({ start: '07:00', end: '15:30' }, 'vi'), '7:00–15:30')
  })

  void it('accepts HH:mm:ss from the database', () => {
    assert.equal(formatBlock({ start: '07:00:00', end: '09:00:00' }, 'en-US'), '7–9 am')
  })
})

void describe('formatWeeklySchedule', () => {
  void it('lists the week Monday first, splits days, and groups 3+ identical days', () => {
    assert.equal(formatWeeklySchedule(WEEK, 'en-US'), 'Mon 7–9 am, 3–6 pm · Tue–Fri 8 am–5 pm · Sat 9:30 am–12 pm · Sun 11 am–1 pm')
  })

  void it('reads naturally in Spanish and Vietnamese', () => {
    assert.equal(
      formatWeeklySchedule(WEEK, 'es'),
      'lun 7:00–9:00, 15:00–18:00 · mar–vie 8:00–17:00 · sáb 9:30–12:00 · dom 11:00–13:00',
    )
    assert.equal(
      formatWeeklySchedule(WEEK, 'vi'),
      'Thứ 2 7:00–9:00, 15:00–18:00 · Thứ 3–Thứ 6 8:00–17:00 · Thứ 7 9:30–12:00 · CN 11:00–13:00',
    )
  })

  void it('never groups days that differ, and keeps a run of two day by day', () => {
    const almost = { mon: [{ start: '08:00', end: '17:00' }], tue: [{ start: '08:00', end: '17:00' }], wed: [{ start: '08:00', end: '16:00' }] }
    assert.equal(formatWeeklySchedule(almost, 'en-US'), 'Mon 8 am–5 pm · Tue 8 am–5 pm · Wed 8 am–4 pm')
  })

  void it('does not group across a day off', () => {
    const gap = { mon: [{ start: '08:00', end: '12:00' }], tue: [{ start: '08:00', end: '12:00' }], thu: [{ start: '08:00', end: '12:00' }], fri: [{ start: '08:00', end: '12:00' }] }
    assert.equal(formatWeeklySchedule(gap, 'en-US'), 'Mon 8 am–12 pm · Tue 8 am–12 pm · Thu 8 am–12 pm · Fri 8 am–12 pm')
  })

  void it('groups a full weekend camp run', () => {
    const camp = { fri: [{ start: '09:00', end: '15:00' }], sat: [{ start: '09:00', end: '15:00' }], sun: [{ start: '09:00', end: '15:00' }] }
    assert.equal(formatWeeklySchedule(camp, 'en-US'), 'Fri–Sun 9 am–3 pm')
  })

  void it('sorts a day even if its blocks were stored out of order', () => {
    const unsorted = { mon: [{ start: '15:00', end: '18:00' }, { start: '07:00', end: '09:00' }] }
    assert.equal(formatWeeklySchedule(unsorted, 'en-US'), 'Mon 7–9 am, 3–6 pm')
  })

  void it('is empty for a week with no times', () => {
    assert.equal(formatWeeklySchedule({}, 'en-US'), '')
    assert.equal(formatWeeklySchedule({ mon: [] }, 'en-US'), '')
  })
})

void describe('summarizeSchedule', () => {
  void it('formats a set schedule', () => {
    assert.deepStrictEqual(summarizeSchedule({ schedule: { tue: [{ start: '09:00', end: '15:00' }] }, plan: 'Full-time' }, 'en-US'), {
      kind: 'set',
      text: 'Tue 9 am–3 pm',
    })
  })

  void it('tells a saved-but-empty schedule apart from one never set', () => {
    assert.deepStrictEqual(summarizeSchedule({ schedule: {}, plan: '' }, 'en-US'), { kind: 'no_days' })
    assert.deepStrictEqual(summarizeSchedule({ schedule: undefined, plan: ' Part-time (M/W/F) ' }, 'en-US'), {
      kind: 'not_set',
      legacyPlan: 'Part-time (M/W/F)',
    })
    assert.deepStrictEqual(summarizeSchedule({ schedule: null, plan: '' }, 'en-US'), { kind: 'not_set', legacyPlan: '' })
  })
})

void describe('buildDayRoster', () => {
  // TUE: Ava 7–9 am + 3–6 pm (split), Ben 9 am–3 pm, Cal off Tuesdays,
  // Dee no schedule, Eve waitlisted, Fay off Tuesdays but dropped in.
  const kid = (id: string, name: string, extra: Partial<RosterChild> = {}): RosterChild => ({
    id,
    name,
    status: 'active',
    startDate: '',
    schedule: { tue: [] },
    ...extra,
  })
  const kids: RosterChild[] = [
    kid('ben', 'Ben', { schedule: { tue: [{ start: '09:00', end: '15:00' }] } }),
    kid('ava', 'Ava', { schedule: { tue: [{ start: '07:00', end: '09:00' }, { start: '15:00', end: '18:00' }] } }),
    kid('cal', 'Cal'),
    kid('dee', 'Dee', { schedule: undefined }),
    kid('eve', 'Eve', { status: 'waitlist', schedule: { tue: [{ start: '09:00', end: '12:00' }] } }),
    kid('fay', 'Fay'),
  ]
  const rec = (childId: string, status: RosterRecord['status'], checkIn: string | null, checkOut: string | null): RosterRecord => ({
    childId,
    date: TUE,
    status,
    checkIn,
    checkOut,
  })

  void it('puts scheduled children in time order, the unknown and the off-today in their own groups', () => {
    const roster = buildDayRoster(kids, [], [], [], TUE)
    assert.deepStrictEqual(roster.main.map((r) => r.child.id), ['ava', 'ben'])
    assert.deepStrictEqual(roster.unscheduled.map((r) => r.child.id), ['dee'])
    assert.deepStrictEqual(roster.notToday.map((r) => r.child.id), ['cal', 'fay'])
    assert.deepStrictEqual(roster.counts, { here: 0, gone: 0, absent: 0, due: 2, returning: 0 })
  })

  void it('leaves waitlisted children out entirely', () => {
    const roster = buildDayRoster(kids, [], [], [], TUE)
    const all = [...roster.main, ...roster.unscheduled, ...roster.notToday].map((r) => r.child.id)
    assert.equal(all.includes('eve'), false)
  })

  void it('always lists a child with a record that day, even when not scheduled (drop-in)', () => {
    const roster = buildDayRoster(kids, [rec('fay', 'present', '10:00:00', null), rec('dee', 'present', '08:00', null)], [], [], TUE)
    assert.deepStrictEqual(roster.main.map((r) => r.child.id), ['ava', 'ben', 'dee', 'fay'])
    assert.deepStrictEqual(roster.unscheduled, [])
    assert.deepStrictEqual(roster.notToday.map((r) => r.child.id), ['cal'])
    assert.equal(roster.counts.here, 2)
  })

  void it('knows a split-day child checked out at 9 is coming back at 3', () => {
    const roster = buildDayRoster(kids, [rec('ava', 'checked-out', '07:02:00', '09:01:00')], [], [], TUE)
    const ava = roster.main.find((r) => r.child.id === 'ava')
    assert.equal(ava?.phase, 'returning')
    assert.equal(ava?.returnsAt, '15:00')
    assert.deepStrictEqual(roster.counts, { here: 0, gone: 0, absent: 0, due: 2, returning: 1 })
  })

  void it('counts a child checked out after their last block as gone', () => {
    const roster = buildDayRoster(
      kids,
      [rec('ava', 'checked-out', '15:00', '18:05'), rec('ben', 'absent', null, null)],
      [],
      [],
      TUE,
    )
    assert.equal(roster.main.find((r) => r.child.id === 'ava')?.phase, 'gone')
    assert.deepStrictEqual(roster.counts, { here: 0, gone: 1, absent: 1, due: 0, returning: 0 })
  })

  void it('closes the day: nobody expected, closure reported, records still listed', () => {
    const events = [event({ kind: 'closure', title: 'Columbus Day', startsOn: TUE })]
    const closed = buildDayRoster(kids, [], [], events, TUE)
    assert.deepStrictEqual(closed.closure, { title: 'Columbus Day' })
    assert.deepStrictEqual(closed.main, [])
    assert.equal(closed.counts.due, 0)
    const withRecord = buildDayRoster(kids, [rec('ben', 'present', '09:00', null)], [], events, TUE)
    assert.deepStrictEqual(withRecord.main.map((r) => r.child.id), ['ben'])
  })

  void it('reports the earliest early close and applies it to the blocks', () => {
    const events = [
      event({ kind: 'early_close', title: 'Staff training', startsOn: TUE, closesAt: '13:00:00' }),
      event({ kind: 'early_close', title: 'Later', startsOn: TUE, closesAt: '14:00' }),
    ]
    const roster = buildDayRoster(kids, [], [], events, TUE)
    assert.deepStrictEqual(roster.earlyClose, { title: 'Staff training', closesAt: '13:00' })
    assert.deepStrictEqual(roster.main.find((r) => r.child.id === 'ava')?.day.blocks, [{ start: '07:00', end: '09:00' }])
  })

  void it('follows one-off changes: off for the day, or in on a day off', () => {
    const changes: ResolverChange[] = [
      { childId: 'ben', date: TUE, blocks: [], note: 'trip' },
      { childId: 'cal', date: TUE, blocks: [{ start: '08:00', end: '12:00' }], note: '' },
    ]
    const roster = buildDayRoster(kids, [], changes, [], TUE)
    assert.deepStrictEqual(roster.main.map((r) => r.child.id), ['ava', 'cal'])
    assert.deepStrictEqual(roster.notToday.map((r) => r.child.id), ['ben', 'fay'])
  })
})

void describe('schedule plans (a weekly pattern starting on a date)', () => {
  // Ellie's own pattern has her Tuesdays 9–3. From Wed Oct 7 a new pattern
  // has her in Mon/Wed/Fri 8–12 only; from Oct 19 another one adds Saturdays.
  const plans: ResolverPlan[] = [
    { childId: 'chd_ellie', startsOn: WED, schedule: { mon: [{ start: '08:00', end: '12:00' }], wed: [{ start: '08:00', end: '12:00' }], fri: [{ start: '08:00', end: '12:00' }] } },
    { childId: 'chd_ellie', startsOn: '2026-10-19', schedule: { sat: [{ start: '09:00', end: '13:00' }] } },
    { childId: 'chd_other', startsOn: '2026-10-01', schedule: {} },
  ]

  void it('uses the child\'s own pattern before any plan starts', () => {
    assert.deepStrictEqual(resolveChildDay(child(), TUE, none, noEvents, plans).blocks, [{ start: '09:00', end: '15:00' }])
  })

  void it('switches to the plan on its first day', () => {
    hasFields(resolveChildDay(child(), WED, none, noEvents, plans), { state: 'expected', blocks: [{ start: '08:00', end: '12:00' }], source: 'pattern' })
  })

  void it('drops days the new pattern does not include', () => {
    // Tuesday the 13th: the plan from the 7th has no Tuesday.
    hasFields(resolveChildDay(child(), '2026-10-13', none, noEvents, plans), { state: 'not_expected', source: 'pattern' })
  })

  void it('takes the newest plan that has started', () => {
    hasFields(resolveChildDay(child(), '2026-10-24', none, noEvents, plans), { state: 'expected', blocks: [{ start: '09:00', end: '13:00' }] })
    // Friday the 16th is before the second plan (Oct 19), so the first still applies…
    hasFields(resolveChildDay(child(), '2026-10-16', none, noEvents, plans), { state: 'expected', blocks: [{ start: '08:00', end: '12:00' }] })
    // …and Friday the 23rd is after it, when only Saturdays remain.
    hasFields(resolveChildDay(child(), '2026-10-23', none, noEvents, plans), { state: 'not_expected' })
  })

  void it('gives a never-scheduled child a schedule once their plan starts', () => {
    assert.equal(resolveChildDay(child({ schedule: undefined }), TUE, none, noEvents, plans).state, 'unscheduled')
    assert.equal(resolveChildDay(child({ schedule: undefined }), WED, none, noEvents, plans).state, 'expected')
  })

  void it('still lets one-off changes, exceptions and closures win', () => {
    const changes: ResolverChange[] = [{ childId: 'chd_ellie', date: WED, blocks: [], note: 'trip' }]
    assert.equal(resolveChildDay(child(), WED, changes, noEvents, plans).source, 'change')
    assert.equal(resolveChildDay(child(), WED, none, [event({ kind: 'closure', startsOn: WED })], plans).state, 'closed')
  })

  void it("ignores another child's plan", () => {
    assert.deepStrictEqual(patternOn({ id: 'chd_ellie', schedule: { tue: [] } }, '2026-12-01', plans.slice(2)), { tue: [] })
  })

  void it('feeds the roster too', () => {
    const kids: RosterChild[] = [{ ...child(), name: 'Ellie' }]
    assert.equal(buildDayRoster(kids, [], [], [], WED).notToday.length, 1)
    assert.equal(buildDayRoster(kids, [], [], [], WED, plans).main.length, 1)
  })
})

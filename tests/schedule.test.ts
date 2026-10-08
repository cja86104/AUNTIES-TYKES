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
import type { ChildDay, ResolverChange, ResolverChild, ResolverEvent } from '../src/lib/schedule.ts'
import { resolveChildDay, toHHmm, weekdayOf } from '../src/lib/schedule.ts'

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

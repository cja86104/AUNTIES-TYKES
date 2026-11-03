/**
 * Weekly-view helper tests. Run with `npm test`. `describe()` and `it()`
 * return promises the runner awaits itself; `void` marks each as deliberately
 * not awaited here.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  dayInZone,
  formatDayLong,
  formatDayShort,
  formatWeekRange,
  shiftWeek,
  weekEndOf,
  weekOf,
  weekStartOf,
  weeksWithItems,
} from '../src/lib/weeks.ts'

const ZONE = 'America/New_York'

void describe('weekStartOf', () => {
  void it('returns the Monday for every day Monday through Sunday', () => {
    for (const day of ['2026-10-26', '2026-10-27', '2026-10-29', '2026-10-31', '2026-11-01']) {
      assert.equal(weekStartOf(day), '2026-10-26', day)
    }
  })
  void it('starts a new week on Monday', () => {
    assert.equal(weekStartOf('2026-11-02'), '2026-11-02')
    assert.equal(weekStartOf('2026-10-25'), '2026-10-19')
  })
  void it('crosses month and year ends', () => {
    assert.equal(weekStartOf('2027-01-03'), '2026-12-28')
    assert.equal(weekStartOf('2026-03-01'), '2026-02-23')
  })
  void it('rejects anything that is not a real date', () => {
    assert.equal(weekStartOf('2026-02-30'), null)
    assert.equal(weekStartOf('Oct 26'), null)
  })
})

void describe('dayInZone / weekOf', () => {
  void it('passes a date column through unchanged', () => {
    assert.equal(dayInZone('2026-11-01', ZONE), '2026-11-01')
  })
  void it('reads a timestamp on the daycare clock, not UTC', () => {
    // 9:30 PM Sunday Nov 1 Eastern (EST, UTC-5) is already Monday in UTC.
    assert.equal(dayInZone('2026-11-02T02:30:00+00:00', ZONE), '2026-11-01')
    assert.equal(weekOf('2026-11-02T02:30:00+00:00', ZONE), '2026-10-26')
    // 12:05 AM Monday Eastern starts the new week.
    assert.equal(weekOf('2026-11-02T05:05:00.000Z', ZONE), '2026-11-02')
  })
  void it('handles a Sunday night inside daylight saving time', () => {
    // 11 PM Sunday Oct 25 Eastern (EDT, UTC-4).
    assert.equal(weekOf('2026-10-26T03:00:00Z', ZONE), '2026-10-19')
  })
  void it('returns null for an unreadable value', () => {
    assert.equal(weekOf('not a date', ZONE), null)
  })
})

void describe('shiftWeek / weekEndOf', () => {
  void it('steps whole weeks across a DST change', () => {
    assert.equal(shiftWeek('2026-10-26', 1), '2026-11-02')
    assert.equal(shiftWeek('2026-11-02', -1), '2026-10-26')
    assert.equal(shiftWeek('2026-03-02', 1), '2026-03-09')
  })
  void it('ends a week on its Sunday', () => {
    assert.equal(weekEndOf('2026-10-26'), '2026-11-01')
    assert.equal(weekEndOf('2026-12-28'), '2027-01-03')
  })
})

void describe('weeksWithItems', () => {
  void it('counts items per week, newest first, always listing the current week', () => {
    const result = weeksWithItems(['2026-10-12', '2026-10-19', '2026-10-12', null], '2026-10-26')
    assert.deepStrictEqual(result, [
      { start: '2026-10-26', count: 0 },
      { start: '2026-10-19', count: 1 },
      { start: '2026-10-12', count: 2 },
    ])
  })
  void it('leaves out weeks after the current one', () => {
    assert.deepStrictEqual(weeksWithItems(['2026-11-02'], '2026-10-26'), [{ start: '2026-10-26', count: 0 }])
  })
})

void describe('family-portal week wording', () => {
  void it('formats a day short, with the year when asked', () => {
    assert.equal(formatDayShort('2026-11-02', 'en'), 'Nov 2')
    assert.equal(formatDayShort('2026-11-02', 'en', true), 'Nov 2, 2026')
  })
  void it('formats a day in full', () => {
    assert.equal(formatDayLong('2026-11-03', 'en'), 'Tuesday, November 3, 2026')
  })
  void it('spans Monday to Sunday, across a month end', () => {
    assert.equal(formatWeekRange('2026-10-26', 'en'), 'Oct 26 – Nov 1')
  })
  void it('reads the day in UTC so the date never shifts', () => {
    assert.equal(formatDayShort('2026-03-08', 'en'), 'Mar 8')
    assert.equal(formatDayShort('2027-01-01', 'en'), 'Jan 1')
  })
  void it('speaks the portal language', () => {
    assert.notEqual(formatDayShort('2026-11-02', 'es'), 'Nov 2')
    assert.notEqual(formatDayShort('2026-11-02', 'vi'), 'Nov 2')
    assert.match(formatDayLong('2026-11-03', 'es'), /martes/)
  })
  void it('falls back to English for an unknown language tag', () => {
    assert.equal(formatDayShort('2026-11-02', 'not a tag!'), 'Nov 2')
  })
  void it('hands back anything that is not a real date', () => {
    assert.equal(formatDayShort('2026-02-30', 'en'), '2026-02-30')
    assert.equal(formatWeekRange('Oct 26', 'en'), 'Oct 26')
  })
})

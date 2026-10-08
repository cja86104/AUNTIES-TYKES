/**
 * Visit helper tests. Run with `npm test`. `describe()` and `it()` return
 * promises the runner awaits itself; `void` marks each as deliberately not
 * awaited here.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AttendanceVisit } from '../src/types.ts'
import { openVisit, visitMinutes, visitsOn } from '../src/lib/visits.ts'

const DAY = '2026-10-06'
const visit = (id: string, checkIn: string, checkOut: string | null, childId = 'ava', date = DAY): AttendanceVisit => ({
  id,
  childId,
  date,
  checkIn,
  checkOut,
})

void describe('visitsOn', () => {
  void it("returns one child's visits that day, earliest first, ignoring others", () => {
    const all = [
      visit('pm', '15:01:00', '18:00:00'),
      visit('am', '07:05:00', '09:02:00'),
      visit('other-kid', '08:00', '12:00', 'ben'),
      visit('other-day', '07:00', '09:00', 'ava', '2026-10-05'),
    ]
    assert.deepStrictEqual(visitsOn(all, 'ava', DAY).map((v) => v.id), ['am', 'pm'])
  })
})

void describe('openVisit', () => {
  void it('finds the visit still in progress', () => {
    const all = [visit('am', '07:05', '09:02'), visit('pm', '15:01', null)]
    assert.equal(openVisit(all, 'ava', DAY)?.id, 'pm')
  })

  void it('is undefined when every visit is closed', () => {
    assert.equal(openVisit([visit('am', '07:05', '09:02')], 'ava', DAY), undefined)
  })
})

void describe('visitMinutes', () => {
  void it('adds up a split day without counting the gap between visits', () => {
    // 7:05–9:02 = 117 min, 3:01–6:00 = 179 min; the 9–3 gap is not care.
    assert.equal(visitMinutes([visit('am', '07:05:00', '09:02:00'), visit('pm', '15:01:00', '18:00:00')]), 296)
  })

  void it('leaves out a visit still in progress', () => {
    assert.equal(visitMinutes([visit('am', '07:00', '09:00'), visit('pm', '15:00', null)]), 120)
  })

  void it('is 0 for no visits, and never negative for a bad pair', () => {
    assert.equal(visitMinutes([]), 0)
    assert.equal(visitMinutes([visit('x', '10:00', '09:00')]), 0)
  })
})

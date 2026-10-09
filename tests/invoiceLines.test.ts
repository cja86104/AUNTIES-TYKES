/**
 * Invoice wording and pricing tests — the functions the Invoices page's
 * "Prefill from enrollment" and Ro's `invoice_create` both call. Run with
 * `npm test`.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  invoicePeriod,
  invoiceTotal,
  lineAmount,
  tuitionLines,
  withAmounts,
} from '../src/lib/invoiceLines.ts'

void describe('tuitionLines', () => {
  void it('bills one child four weeks at the weekly rate, with no discount', () => {
    assert.deepEqual(tuitionLines(['Ava'], 250, 10), [
      { label: 'Ava — Tuition (4 weeks)', qty: 4, unit: 250 },
    ])
  })

  void it('adds one sibling discount line for two or more children', () => {
    const lines = tuitionLines(['Ava', 'Ben', 'Cal'], 250, 10)
    assert.equal(lines.length, 4)
    assert.deepEqual(lines[3], { label: 'Sibling discount (10% on second child)', qty: 1, unit: -100 })
  })

  void it('rounds the discount to whole dollars, as the page always has', () => {
    const lines = tuitionLines(['Ava', 'Ben'], 233, 7.5)
    // 233 × 4 × 7.5% = 69.9 → 70
    assert.equal(lines[2]?.unit, -70)
  })

  void it('adds no discount line when the rate card has none', () => {
    assert.equal(tuitionLines(['Ava', 'Ben'], 250, 0).length, 2)
  })

  void it('returns nothing for no children', () => {
    assert.deepEqual(tuitionLines([], 250, 10), [])
  })
})

void describe('amounts', () => {
  void it('works in whole cents', () => {
    assert.equal(lineAmount({ label: 'x', qty: 3, unit: 0.1 }), 0.3)
    const lines = withAmounts([
      { label: 'a', qty: 4, unit: 250 },
      { label: 'b', qty: 1, unit: -100 },
      { label: 'c', qty: 1, unit: 0.1 },
      { label: 'd', qty: 1, unit: 0.2 },
    ])
    assert.equal(invoiceTotal(lines), 900.3)
  })
})

void describe('invoicePeriod', () => {
  void it('names the month from the date string and drops "Family"', () => {
    assert.equal(invoicePeriod('2026-10-08', 'Brooks Family'), 'October 2026 · Brooks')
  })

  void it('uses the date it is given, never the host clock — the 1st stays in its month', () => {
    assert.equal(invoicePeriod('2026-11-01', 'Okafor'), 'November 2026 · Okafor')
    assert.equal(invoicePeriod('2027-01-01', 'Nguyen Family'), 'January 2027 · Nguyen')
  })
})

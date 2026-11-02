/**
 * Invoices-page view rules. Run with `npm test`. `describe()` and `it()`
 * return promises the runner awaits itself; `void` marks each as deliberately
 * not awaited here.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { invoiceInView, tabIsWeekly, type InvoiceViewQuery } from '../src/lib/invoiceView.ts'

const THIS_WEEK = '2026-11-02'
const LAST_WEEK = '2026-10-26'

const base: InvoiceViewQuery = {
  tab: 'all',
  status: 'unpaid',
  week: THIS_WEEK,
  viewWeek: THIS_WEEK,
  searching: false,
}

void describe('tabIsWeekly', () => {
  void it('browses All and Paid by week, and Open and Overdue across every week', () => {
    assert.equal(tabIsWeekly('all'), true)
    assert.equal(tabIsWeekly('paid'), true)
    assert.equal(tabIsWeekly('unpaid'), false)
    assert.equal(tabIsWeekly('overdue'), false)
  })
})

void describe('invoiceInView', () => {
  void it('on All, shows only invoices issued in the week on screen', () => {
    assert.equal(invoiceInView(base), true)
    assert.equal(invoiceInView({ ...base, week: LAST_WEEK }), false)
    assert.equal(invoiceInView({ ...base, week: LAST_WEEK, viewWeek: LAST_WEEK }), true)
  })

  void it('on Paid, shows only paid invoices from the week on screen', () => {
    assert.equal(invoiceInView({ ...base, tab: 'paid', status: 'paid' }), true)
    assert.equal(invoiceInView({ ...base, tab: 'paid', status: 'paid', week: LAST_WEEK }), false)
    assert.equal(invoiceInView({ ...base, tab: 'paid', status: 'unpaid' }), false)
  })

  void it('on Open, never hides an unpaid invoice because of its week', () => {
    assert.equal(invoiceInView({ ...base, tab: 'unpaid', status: 'unpaid', week: LAST_WEEK }), true)
    assert.equal(invoiceInView({ ...base, tab: 'unpaid', status: 'unpaid', week: '2025-01-06' }), true)
    assert.equal(invoiceInView({ ...base, tab: 'unpaid', status: 'overdue' }), false)
  })

  void it('on Overdue, never hides an overdue invoice because of its week', () => {
    assert.equal(invoiceInView({ ...base, tab: 'overdue', status: 'overdue', week: LAST_WEEK }), true)
    assert.equal(invoiceInView({ ...base, tab: 'overdue', status: 'paid' }), false)
  })

  void it('searching looks across every week but still respects the tab', () => {
    assert.equal(invoiceInView({ ...base, searching: true, week: LAST_WEEK }), true)
    assert.equal(invoiceInView({ ...base, tab: 'paid', status: 'unpaid', searching: true }), false)
  })

  void it('an invoice with an unreadable date stays reachable by search and the owed tabs', () => {
    assert.equal(invoiceInView({ ...base, week: null }), false)
    assert.equal(invoiceInView({ ...base, week: null, searching: true }), true)
    assert.equal(invoiceInView({ ...base, tab: 'overdue', status: 'overdue', week: null }), true)
  })
})

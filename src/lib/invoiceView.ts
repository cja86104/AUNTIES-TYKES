/**
 * Which invoices the admin Invoices page shows, given its tab, its week and
 * whether she is searching.
 *
 * The page is week by week, like the daily reports: it opens on the week the
 * invoices were ISSUED and she steps back through earlier ones. Nothing is moved
 * or deleted for that; families still see every invoice in their portal.
 *
 * The one rule that is not about weeks: Open and Overdue are money still owed, so
 * they ignore the week and always list every outstanding invoice. A statement
 * from three weeks ago that nobody has paid must not drop off the page just
 * because the week turned over. Search also looks across every week.
 *
 * Dependency-free on purpose, like weeks.ts, so `npm test` runs it directly.
 */

export type InvoiceTab = 'all' | 'overdue' | 'unpaid' | 'paid'
export type InvoiceStatusName = 'overdue' | 'unpaid' | 'paid'

/** True for the tabs that are browsed a week at a time. */
export function tabIsWeekly(tab: InvoiceTab): boolean {
  return tab === 'all' || tab === 'paid'
}

export interface InvoiceViewQuery {
  tab: InvoiceTab
  /** This invoice's own status. */
  status: InvoiceStatusName
  /** Monday of the week the invoice was issued, or null if its date is unreadable. */
  week: string | null
  /** Monday of the week on screen. */
  viewWeek: string
  /** True while the search box has text in it. */
  searching: boolean
}

export function invoiceInView({ tab, status, week, viewWeek, searching }: InvoiceViewQuery): boolean {
  if (tab !== 'all' && status !== tab) return false
  if (searching || !tabIsWeekly(tab)) return true
  return week === viewWeek
}

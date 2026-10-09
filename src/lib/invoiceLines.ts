/**
 * How a new invoice is worded and priced — shared by the Invoices page and Ro.
 *
 * The Invoices page's "Prefill from enrollment" and Ro's `invoice_create` both
 * bill a family's enrolled children, and both name the invoice's period. If each
 * worked that out on its own, the two would drift the first time either changed,
 * and an invoice Ro wrote would read differently from one the owner typed. So
 * both call these functions.
 *
 * Ro runs this inside a Vercel serverless function (api/), so the file stays
 * dependency-free like `schedule.ts`: no React, zustand or date-fns, and no Date
 * behaviour that depends on the host's time zone. Dates are `yyyy-MM-dd` strings.
 */
import type { LineItem } from '../types'

/** Prefill bills each enrolled child for this many weeks. */
export const TUITION_WEEKS = 4

/** A line before its amount is worked out. */
export interface DraftLineItem {
  label: string
  qty: number
  unit: number
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/**
 * Tuition lines for a family's enrolled children, at the family's own weekly
 * rate, plus the sibling discount from the Settings rate card when there is
 * more than one child.
 *
 * The discount is the rate card's percentage of the cheapest child's four weeks,
 * rounded to whole dollars, on one line — exactly as the Invoices page has
 * always done it. There is no fallback rate: a family with no rate on file is
 * the caller's problem to ask about, never a number to guess.
 */
export function tuitionLines(
  childNames: readonly string[],
  weeklyRate: number,
  siblingDiscountPct: number,
): DraftLineItem[] {
  const lines: DraftLineItem[] = childNames.map((name) => ({
    label: `${name} — Tuition (${TUITION_WEEKS} weeks)`,
    qty: TUITION_WEEKS,
    unit: weeklyRate,
  }))

  if (lines.length > 1 && siblingDiscountPct > 0) {
    const cheapest = Math.min(...lines.map((line) => line.unit))
    const discount = Math.round(cheapest * TUITION_WEEKS * (siblingDiscountPct / 100))
    if (discount > 0) {
      lines.push({
        label: `Sibling discount (${siblingDiscountPct}% on second child)`,
        qty: 1,
        unit: -discount,
      })
    }
  }
  return lines
}

/** A line's amount, in whole cents so float drift never reaches a stored total. */
export function lineAmount(line: DraftLineItem): number {
  return Math.round(line.qty * line.unit * 100) / 100
}

/** Lines with their amounts filled in. */
export function withAmounts(lines: readonly DraftLineItem[]): LineItem[] {
  return lines.map((line) => ({ ...line, amount: lineAmount(line) }))
}

/** The sum of the lines, in whole cents. */
export function invoiceTotal(lines: readonly LineItem[]): number {
  return Math.round(lines.reduce((total, line) => total + line.amount, 0) * 100) / 100
}

/**
 * The period an invoice is filed under: "October 2026 · Brooks" for the Brooks
 * Family, issued on any day in October 2026. `today` is `yyyy-MM-dd`.
 */
export function invoicePeriod(today: string, familyName: string): string {
  const year = today.slice(0, 4)
  const month = MONTHS[Number(today.slice(5, 7)) - 1] ?? ''
  const shortName = familyName.replace(/\s*Family$/, '')
  return `${month} ${year} · ${shortName}`
}

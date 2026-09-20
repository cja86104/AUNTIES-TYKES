import {
  format,
  parseISO,
  differenceInMonths,
  differenceInCalendarDays,
  isValid,
} from 'date-fns'
import type { Invoice, InvoiceStatus } from '../types'

export type ClassValue = string | false | null | undefined

export const cx = (...parts: ClassValue[]): string => parts.filter(Boolean).join(' ')

export const money = (n: number | string | null | undefined): string =>
  (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

export function safeDate(value: string | number | Date | null | undefined): Date | null {
  if (!value) return null
  const d = typeof value === 'string' ? parseISO(value) : new Date(value)
  return isValid(d) ? d : null
}

export function fmtDate(value: string | number | Date | null | undefined, pattern = 'MMM d, yyyy'): string {
  const d = safeDate(value)
  return d ? format(d, pattern) : '—'
}

export function fmtDay(value: string | number | Date | null | undefined): string {
  return fmtDate(value, 'EEEE, MMM d')
}

export function fmtTime(hhmm: string | null | undefined): string {
  if (!hhmm) return '—'
  const [h, m] = String(hhmm).split(':').map(Number)
  return format(new Date(2020, 0, 1, h || 0, m || 0), 'h:mm a')
}

export function nowTime(): string {
  return format(new Date(), 'HH:mm')
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/**
 * A full timestamp. Use this wherever two records made on the same day have to
 * stay in order — messages, thread activity. todayISO() is date-only, so
 * everything written on one day ties, and the order comes back scrambled.
 */
export function nowISO(): string {
  return new Date().toISOString()
}

export function ageLabel(dob: string | Date | null | undefined): string {
  const d = safeDate(dob)
  if (!d) return '—'
  const months = differenceInMonths(new Date(), d)
  if (months < 24) return `${months} mo`
  const years = Math.floor(months / 12)
  const rem = months % 12
  return rem ? `${years} yr ${rem} mo` : `${years} yr`
}

export function daysUntil(value: string | Date | null | undefined): number | null {
  const d = safeDate(value)
  if (!d) return null
  return differenceInCalendarDays(d, new Date())
}

export function initials(name = ''): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('')
}

export function invoiceBalance(inv: Invoice): number {
  const paid = (inv.payments || []).reduce((s, p) => s + p.amount, 0)
  return Math.max(0, Number(inv.amount || 0) - paid)
}

export function invoiceStatus(inv: Invoice): InvoiceStatus {
  const bal = invoiceBalance(inv)
  if (bal <= 0.001) return 'paid'
  const dd = daysUntil(inv.dueDate)
  if (dd !== null && dd < 0) return 'overdue'
  return 'unpaid'
}

export function sum<T>(list: T[], pick: (item: T) => number): number
export function sum(list: number[]): number
export function sum<T>(list: T[], pick?: (item: T) => number): number {
  return list.reduce<number>((s, x) => s + (pick ? pick(x) : (x as unknown as number)), 0)
}

/**
 * Ids are the database primary key (text, see supabase/migrations/0003), so a
 * collision would be a failed insert, not a cosmetic glitch. The readable
 * prefix is kept for debugging; uniqueness comes from randomUUID.
 *
 * The fallback covers Safari older than 15.4, where crypto.randomUUID is
 * missing — voice support means this app is expected to run on iOS Safari.
 */
export function uid(prefix = 'id'): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
          .toString(36)
          .slice(2, 10)}`
  return `${prefix}_${rand}`
}

export function bytes(n: number | null | undefined): string {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * True when a settings field still holds its seeded "not filled in yet" marker.
 *
 * `phone`, `email` and `hours` are seeded as the literal text
 * `TBD — add before launch` (supabase/migrations/0002) rather than as
 * plausible-looking values, so an unfilled field is impossible to miss. They
 * render publicly, and some of them build `tel:` and `mailto:` links — this
 * guard is what keeps a dead link from shipping while the real value is still
 * outstanding.
 */
export function isPlaceholder(value: string | null | undefined): boolean {
  if (!value) return true
  return /^TBD\b/i.test(value.trim())
}

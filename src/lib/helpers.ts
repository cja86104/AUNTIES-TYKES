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

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function bytes(n: number | null | undefined): string {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * What Ro is handed — the full record, by the owner's decision.
 *
 * ── DECISION, 2026-09-27 ───────────────────────────────────────────────────
 * Plan §8 says "PII minimization in prompts: Tier-0/1 model calls get first
 * names and internal IDs, not full addresses, DOB, or anything
 * payment-related." That is deliberately NOT what this file does any more. The
 * owner's instruction is that Ro sees everything — allergies, medications,
 * dates of birth, family and emergency contact details, how a payment was made
 * — on the grounds that this is a single-admin app and only Melissa uses it.
 *
 * What that trades away, recorded here so it is not rediscovered later: the
 * limit §8 was reaching for was never about who can see the screen. It was
 * about what leaves the building. Every field below is serialized into a prompt
 * and sent to third-party inference providers over OpenRouter — Tier 0 is an
 * Ant Group model, Tier 1 an Alibaba model, Tier 2 Anthropic. So a child's
 * medication list and a family's home address now travel to those endpoints on
 * any turn whose tool call returns them.
 *
 * If that ever needs narrowing — a client asks, an acquirer's diligence asks,
 * or a tier is repointed at a provider with different terms — this file is
 * still the one place to narrow it. The `Brief` shapes are the contract: a
 * field that is not in a Brief is not sent, and the tool executors in
 * `tools/reads.ts` select exactly the columns these shapes need.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The one guardrail this change does NOT touch, because it is a different
 * concern: §8's "no invented facts about a child" still holds. Ro rephrases
 * fields it is handed and never states something about a child that is not in a
 * record. Widening what it can read makes that more important, not less — there
 * is now more real detail available to get wrong.
 */

import type { Contact, EnrollmentChildDraft, LineItem } from '../../../src/types.js'

/* ------------------------------- brief shapes ------------------------------ */

export interface FamilyBrief {
  id: string
  /** The family label the owner uses — "Okafor". */
  name: string
  primaryContact: string
  relation: string
  email: string
  phone: string
  address: string
  secondary: Contact
  emergency: Contact[]
  joinedAt: string
  /** The owner's own operational note about this family. */
  notes: string
  /** The agreed weekly rate when it differs from the rate card; null if not. */
  customWeeklyRate: number | null
}

export interface ChildBrief {
  id: string
  familyId: string
  name: string
  /** ISO date, yyyy-MM-dd. Ro can work out an age or a birthday from this. */
  dob: string
  ageGroup: string
  status: string
  plan: string
  startDate: string | null
  teacher: string
  allergies: string[]
  medications: string[]
  notes: string
}

export type InvoiceState = 'paid' | 'unpaid' | 'overdue'

export interface InvoiceBrief {
  id: string
  familyId: string
  period: string
  dueDate: string
  issuedAt: string
  amount: number
  paid: number
  balance: number
  status: InvoiceState
  /** Negative until the due date, positive once it has passed. */
  daysPastDue: number | null
  memo: string
}

export interface PaymentBrief {
  date: string
  amount: number
  /** Cash, check, Zelle — recorded by hand. There is no payment processor. */
  method: string
  ref: string
}

export interface InvoiceDetailBrief {
  invoice: InvoiceBrief
  lineItems: LineItem[]
  payments: PaymentBrief[]
}

export interface AttendanceBrief {
  childId: string
  date: string
  status: string
  checkIn: string | null
  checkOut: string | null
  note: string
}

export interface DailyLogBrief {
  id: string
  childId: string
  date: string
  meals: string
  naps: string
  potty: string
  mood: string
  activities: string[]
  notes: string
  author: string
}

export interface ThreadBrief {
  id: string
  familyId: string
  subject: string
  updatedAt: string
  /** Who wrote the most recent message: 'admin', 'parent', or null if empty. */
  lastFrom: 'admin' | 'parent' | null
  lastAt: string | null
  /** True when the parent spoke last — §5's `unanswered_message` condition. */
  awaitingReply: boolean
}

export interface ThreadMessageBrief {
  from: 'admin' | 'parent'
  authorName: string
  at: string
  body: string
}

export interface DocumentBrief {
  id: string
  title: string
  category: string
  visibleToParents: boolean
  requiresAck: boolean
  uploadedAt: string
}

export interface EnrollmentBrief {
  id: string
  submittedAt: string
  status: string
  familyName: string
  primaryContact: string
  relation: string
  email: string
  phone: string
  address: string
  secondary: Contact
  emergency: Contact[]
  /** The children exactly as the parent typed them on the public form. */
  children: EnrollmentChildDraft[]
  notes: string
  acknowledgedHandbook: boolean
  daysWaiting: number | null
}

export interface CalendarEventBrief {
  id: string
  kind: string
  title: string
  note: string
  startsOn: string
  endsOn: string | null
  closesAt: string | null
  /** Set only on a single-child schedule exception. */
  childId: string | null
  visibleToParents: boolean
}

export interface SettingsBrief {
  businessName: string
  director: string
  address: string
  phone: string
  email: string
  hours: string
  capacity: number
  ratios: string
  rates: {
    fullTime: number
    partTime: number
    dropIn: number
    registrationFee: number
    lateFeePerMinute: number
    siblingDiscountPct: number
  }
  policies: { sick: string; latePickup: string; holidays: string; potty: string }
}

/* --------------------------------- money ---------------------------------- */

/**
 * The mirror of `money()` in `src/lib/helpers.ts`, for text a model may echo.
 *
 * Same locale and options, so a figure Ro quotes is character-for-character the
 * figure the invoice page shows. A prompt that said "$1487.50" next to a UI
 * showing "$1,487.50" reads as two different numbers to the person holding both.
 */
export function money(amount: number): string {
  return (Number(amount) || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

/* ------------------------------ invoice status ----------------------------- */

/**
 * The mirror of `invoiceStatus()` in `src/lib/helpers.ts`, with today passed in
 * rather than read from the clock.
 *
 * It is a separate implementation for one reason: the client version derives
 * "overdue" from `new Date()` in the machine's timezone, which is UTC on a
 * Vercel function, so it would call an invoice overdue several hours early every
 * evening. Taking `today` as a `yyyy-MM-dd` string in the daycare's timezone
 * removes the clock from the decision entirely.
 *
 * The rule itself is identical and must stay that way — balance settled means
 * paid, otherwise past the due date means overdue. If one changes, change both.
 * `yyyy-MM-dd` strings compare correctly with `<`, so no parsing is involved.
 */
export function invoiceState(
  amount: number,
  payments: { amount: number }[],
  dueDate: string,
  today: string,
): InvoiceState {
  const paid = payments.reduce((total, payment) => total + payment.amount, 0)
  const balance = Math.max(0, amount - paid)
  if (balance <= 0.001) return 'paid'
  return dueDate < today ? 'overdue' : 'unpaid'
}

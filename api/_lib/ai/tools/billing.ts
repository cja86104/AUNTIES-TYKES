/**
 * Recording a payment — the first of plan §3's Money tier.
 *
 * What this is, precisely, because the word "payment" invites a wrong idea: there
 * is no payment processor anywhere in this app (plan §2, build handoff). Money
 * changes hands outside it — a check, cash, a Zelle — and Melissa writes down that
 * it did. This tool is that writing-down, exactly as "Record a payment" on the
 * invoice page does it: one row in `payments` against one invoice. Nothing is
 * charged, and no card or bank detail is ever asked for or stored.
 *
 * It still waits for her tap, as everything in the Money tier does indefinitely
 * (§13, Phase 3). The tool has no write of its own; the write is
 * `recordPaymentExecutor` in `../execute.ts`, behind `api/ai/confirm.ts`.
 *
 * Mirrors `submitPayment` in src/components/InvoiceView.tsx, including the part
 * that looks surprising: an amount over the balance is clamped to the balance
 * rather than refused. The preview says so in its own line, so the clamp is
 * never silent the way it can look on the form.
 */

import { propose } from '../audit.js'
import { money } from '../projection.js'
import {
  alreadyProposed,
  dbFailure,
  proposed,
  readString,
  rememberProposal,
  schema,
  type ActionPreview,
  type ToolContext,
  type ToolOutcome,
  type ToolSpec,
} from './kit.js'

/**
 * The mirror of PAYMENT_METHODS in src/components/InvoiceView.tsx — the same
 * strings in the same order, because they persist to `payments.method` and the
 * invoice page shows them back verbatim. If one list changes, change both.
 */
export const PAYMENT_METHODS = ['Check', 'Cash', 'Bank transfer', 'Zelle', 'Card (in person)', 'Other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

const MAX_REFERENCE = 120
/** Same tolerance `invoiceState` uses for "settled". */
const SETTLED = 0.001

/** Rounds to whole cents, so float drift never reaches a stored amount. */
export function toCents(value: number): number {
  return Math.round(value * 100) / 100
}

/** A positive amount in dollars, from a number or a numeric string. Null otherwise. */
export function readAmount(args: Record<string, unknown>, key: string): number | null {
  const raw = args[key]
  const parsed =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(/[$,\s]/g, '')) : NaN
  if (!Number.isFinite(parsed)) return null
  const cents = toCents(parsed)
  return cents > 0 ? cents : null
}

/** One of the console's payment methods, exactly as spelled there, or null. */
export function readMethod(args: Record<string, unknown>, key: string): PaymentMethod | null {
  const raw = readString(args, key)
  if (raw === null) return null
  const hit = PAYMENT_METHODS.find((method) => method.toLowerCase() === raw.toLowerCase())
  return hit ?? null
}

/** An invoice, its family's name and its live balance — read fresh every time. */
export async function readInvoiceBalance(
  ctx: ToolContext,
  invoiceId: string,
): Promise<
  | {
      ok: true
      found: true
      id: string
      familyId: string
      familyName: string
      period: string
      amount: number
      balance: number
    }
  | { ok: true; found: false }
  | { ok: false; error: string }
> {
  const invoice = await ctx.caller.db
    .from('invoices')
    .select('id, family_id, period, amount')
    .eq('id', invoiceId)
    .maybeSingle()
  if (invoice.error !== null) return dbFailure('that invoice', invoice.error)
  if (invoice.data === null) return { ok: true, found: false }

  const payments = await ctx.caller.db.from('payments').select('amount').eq('invoice_id', invoiceId)
  if (payments.error !== null) return dbFailure('its payments', payments.error)

  const family = await ctx.caller.db
    .from('families')
    .select('name')
    .eq('id', invoice.data.family_id)
    .maybeSingle()
  if (family.error !== null) return dbFailure('that family', family.error)

  const paid = payments.data.reduce((total, row) => total + row.amount, 0)
  return {
    ok: true,
    found: true,
    id: invoice.data.id,
    familyId: invoice.data.family_id,
    familyName: family.data?.name ?? '',
    period: invoice.data.period,
    amount: invoice.data.amount,
    balance: toCents(Math.max(0, invoice.data.amount - paid)),
  }
}

/** The line every payment preview carries, so "payment" is never overstated. */
const RECORD_NOTE =
  'Writes it down against the invoice — the same as "Record a payment" on the invoice ' +
  'page. No money moves through this app. The family sees the new balance in their portal.'

/* ------------------------------ payment.record ----------------------------- */

const paymentRecord: ToolSpec = {
  name: 'payment_record',
  tier: 'money',
  description:
    'Record a payment the owner has ALREADY received outside the app (check, cash, ' +
    'Zelle and so on) against one invoice. Nothing is charged — this only writes it ' +
    'down, and it does not happen on its own: she sees the amount, the invoice and ' +
    'the new balance, and taps. Find the invoice with invoice_list first. If she did ' +
    'not say how it was paid, ask her — never guess the method. If she gives more ' +
    'than the balance, only the balance is recorded, and the card says so.',
  parameters: schema(
    {
      invoiceId: { type: 'string', description: 'From invoice_list or invoice_get' },
      amount: { type: 'number', description: 'Dollars received, e.g. 450 or 450.50' },
      method: { type: 'string', enum: PAYMENT_METHODS },
      reference: { type: 'string', description: 'Check number or similar, if she gave one' },
    },
    ['invoiceId', 'amount', 'method'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const invoiceId = readString(args, 'invoiceId')
    if (invoiceId === null) return { ok: false, error: 'An invoiceId is required' }
    const requested = readAmount(args, 'amount')
    if (requested === null) return { ok: false, error: 'An amount greater than zero is required' }
    const method = readMethod(args, 'method')
    if (method === null) {
      return { ok: false, error: `The method must be one of: ${PAYMENT_METHODS.join(', ')}` }
    }
    const reference = readString(args, 'reference')?.slice(0, MAX_REFERENCE) ?? ''

    const invoice = await readInvoiceBalance(ctx, invoiceId)
    if (!invoice.ok) return { ok: false, error: invoice.error }
    if (!invoice.found) {
      return { ok: true, data: { recorded: false, reason: 'no invoice has that id', invoiceId } }
    }
    if (invoice.balance <= SETTLED) {
      return {
        ok: true,
        data: { recorded: false, reason: 'that invoice is already paid in full', invoiceId },
      }
    }

    // The console's clamp: Math.min(amount, balance) in InvoiceView.submitPayment.
    const amount = Math.min(requested, invoice.balance)
    const clamped = amount < requested
    const remaining = toCents(invoice.balance - amount)

    const payload = {
      invoiceId: invoice.id,
      invoicePeriod: invoice.period,
      familyId: invoice.familyId,
      familyLabel: invoice.familyName,
      amount,
      method,
      reference,
    }
    const key = `payment.record:${JSON.stringify(payload)}`
    const seen = alreadyProposed(ctx, key)
    if (seen !== undefined) return proposed(seen)

    const logged = await propose(ctx, {
      instruction: ctx.instruction,
      tool: 'payment.record',
      riskTier: 'money',
      arguments: payload,
      subject: {
        familyId: invoice.familyId,
        familyLabel: invoice.familyName,
        targets: [invoice.id],
      },
      model: ctx.model,
    })
    if (!logged.ok) return { ok: false, error: logged.error }

    const detail: { label: string; value: string }[] = [
      { label: 'Family', value: invoice.familyName },
      { label: 'Invoice', value: `${invoice.id} — ${invoice.period}` },
      { label: 'Owed now', value: money(invoice.balance) },
      { label: 'Recording', value: `${money(amount)} by ${method}` },
    ]
    if (reference.length > 0) detail.push({ label: 'Reference', value: reference })
    if (clamped) {
      detail.push({
        label: 'Careful',
        value:
          `You said ${money(requested)}, which is more than is owed. Only ${money(amount)} ` +
          'is recorded — the same as the invoice page does.',
      })
    }
    detail.push({ label: 'Afterwards', value: remaining <= SETTLED ? 'Paid in full' : `${money(remaining)} still owed` })
    detail.push({ label: 'What happens', value: RECORD_NOTE })

    const preview: ActionPreview = {
      id: logged.value,
      kind: 'payment.record',
      title: 'Record a payment',
      summary: `${money(amount)} from ${invoice.familyName} — ${invoice.period}`,
      detail,
      confirmLabel: `Record ${money(amount)}`,
    }
    rememberProposal(ctx, key, preview)
    return proposed(preview)
  },
}

export const billingTools: ToolSpec[] = [paymentRecord]

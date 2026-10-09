/**
 * Billing — recording a payment and creating an invoice, both in plan §3's Money
 * tier. The payment notes come first because that tool came first; creating an
 * invoice is at the bottom, with its own notes.
 *
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

import type { LineItem } from '../../../../src/types.js'
import {
  invoicePeriod,
  invoiceTotal,
  tuitionLines,
  withAmounts,
  type DraftLineItem,
} from '../../../../src/lib/invoiceLines.js'
import { propose } from '../audit.js'
import { prettyDate } from '../clock.js'
import { money } from '../projection.js'
import {
  alreadyProposed,
  dbFailure,
  proposed,
  readBoolean,
  readString,
  rememberProposal,
  schema,
  type ActionPreview,
  type ToolContext,
  type ToolOutcome,
  type ToolSpec,
} from './kit.js'
import { readRealDate } from './schedules.js'

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

/* ------------------------------ invoice.create ----------------------------- */

const MAX_LINES = 20
const MAX_LABEL = 120
const MAX_MEMO = 500

/** A number from a number or a numeric string ("$450", "1,200.50"). Null otherwise. */
function readNumber(value: unknown): number | null {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[$,\s]/g, '')) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Invoice lines from untrusted JSON — the model's arguments, or a stored
 * proposal read back. A string says what is wrong.
 *
 * The Invoices page drops a line with no label or a zero total without a word,
 * because she can see the form. Here nobody is looking at a form, so a line that
 * would be dropped is refused instead, naming which one — a line she asked for
 * must never vanish between her sentence and the card.
 */
export function readLineItems(value: unknown): DraftLineItem[] | string {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) return 'Lines must be a list'
  if (value.length > MAX_LINES) return `An invoice can have at most ${MAX_LINES} lines`

  const lines: DraftLineItem[] = []
  for (const [index, entry] of value.entries()) {
    const which = `Line ${index + 1}`
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return `${which} is not a line`
    const record = entry as Record<string, unknown>
    const label = readString(record, 'label')
    if (label === null) return `${which} needs a description`
    const unit = readNumber(record.unit)
    if (unit === null) return `${which} ("${label}") needs a price`
    // A missing quantity is one of it, as the form's quantity box starts at 1.
    const qty = record.qty === undefined ? 1 : readNumber(record.qty)
    if (qty === null || qty <= 0) return `${which} ("${label}") needs a quantity above zero`
    const line = { label: label.slice(0, MAX_LABEL), qty, unit: toCents(unit) }
    if (toCents(line.qty * line.unit) === 0) return `${which} ("${label}") comes to $0`
    lines.push(line)
  }
  return lines
}

/** An invoice as proposed, read back out of the stored proposal by the executor. */
export interface PendingInvoice {
  familyId: string
  familyLabel: string
  period: string
  dueDate: string
  memo: string
  lineItems: LineItem[]
  amount: number
}

export function readPendingInvoice(args: Record<string, unknown>): PendingInvoice | string {
  const familyId = readString(args, 'familyId')
  const familyLabel = readString(args, 'familyLabel')
  const period = readString(args, 'period')
  const dueDate = readRealDate(args, 'dueDate')
  if (familyId === null || familyLabel === null || period === null || dueDate === null) {
    return 'it is missing its family, period or due date'
  }
  const lines = readLineItems(args.lineItems)
  if (typeof lines === 'string') return lines
  if (lines.length === 0) return 'it has no lines'
  const lineItems = withAmounts(lines)
  const amount = invoiceTotal(lineItems)
  if (amount <= 0) return 'its total is not above $0'
  return { familyId, familyLabel, period, dueDate, memo: readString(args, 'memo') ?? '', lineItems, amount }
}

/** "Brooks — Tuition (4 weeks): 4 × $250.00 = $1,000.00" */
function describeLine(line: LineItem): string {
  return line.qty === 1
    ? `${line.label}: ${money(line.amount)}`
    : `${line.label}: ${line.qty} × ${money(line.unit)} = ${money(line.amount)}`
}

const invoiceCreate: ToolSpec = {
  name: 'invoice_create',
  tier: 'money',
  description:
    'Create a new invoice (a statement) for one family — the same as "New invoice" ' +
    'on the Invoices page. It does not happen on its own: she sees every line, the ' +
    'total and the due date, and taps. Find the family with family_find first. ' +
    'Set tuition: true to bill each enrolled child at the family\'s own weekly rate ' +
    'for 4 weeks, with the sibling discount — the same as the page\'s "Prefill from ' +
    'enrollment". Add anything else (a registration fee, a late fee, a one-off ' +
    'charge) as lines with a description and a price; she must have said the price ' +
    'or it must come from settings_get — never invent one. If she did not give a due ' +
    'date, ask her. Nothing is charged and nothing is emailed: the family sees the ' +
    'invoice in their portal.',
  parameters: schema(
    {
      familyId: { type: 'string', description: 'From family_find' },
      dueDate: { type: 'string', description: 'yyyy-MM-dd' },
      tuition: {
        type: 'boolean',
        description: "Bill each enrolled child 4 weeks at the family's weekly rate, with the sibling discount",
      },
      lines: {
        type: 'array',
        description: 'Other charges, or credits as a negative price',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            qty: { type: 'number', description: 'Defaults to 1' },
            unit: { type: 'number', description: 'Price in dollars for one' },
          },
          required: ['label', 'unit'],
          additionalProperties: false,
        },
      },
      memo: { type: 'string', description: 'A note printed on the invoice, if she gave one' },
    },
    ['familyId', 'dueDate'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const familyId = readString(args, 'familyId')
    if (familyId === null) return { ok: false, error: 'A familyId is required' }
    const dueDate = readRealDate(args, 'dueDate')
    if (dueDate === null) return { ok: false, error: 'A due date (yyyy-MM-dd) is required — ask her if she did not give one' }
    const tuition = readBoolean(args, 'tuition', false)
    const extra = readLineItems(args.lines)
    if (typeof extra === 'string') return { ok: false, error: extra }
    const memo = readString(args, 'memo')?.slice(0, MAX_MEMO) ?? ''

    const family = await ctx.caller.db
      .from('families')
      .select('id, name, custom_weekly_rate')
      .eq('id', familyId)
      .maybeSingle()
    if (family.error !== null) return dbFailure('that family', family.error)
    if (family.data === null) {
      return { ok: true, data: { created: false, reason: 'no family has that id', familyId } }
    }

    const lines: DraftLineItem[] = []
    if (tuition) {
      // The same two refusals as "Prefill from enrollment", in the same order.
      const kids = await ctx.caller.db
        .from('children')
        .select('name')
        .eq('family_id', familyId)
        .eq('status', 'active')
        .order('name', { ascending: true })
      if (kids.error !== null) return dbFailure('their children', kids.error)
      if (kids.data.length === 0) {
        return {
          ok: true,
          data: { created: false, reason: `${family.data.name} has no active enrollments to bill`, familyId },
        }
      }
      const weeklyRate = family.data.custom_weekly_rate
      if (weeklyRate === null) {
        return {
          ok: true,
          data: {
            created: false,
            reason:
              `${family.data.name} has no weekly rate on file, so tuition cannot be worked out. ` +
              "It is set on the family's page under Edit details → Billing. Do not guess a rate — " +
              'tell her, or bill it as lines with a price she gives you.',
            familyId,
          },
        }
      }
      const settings = await ctx.caller.db
        .from('settings')
        .select('rate_sibling_discount_pct')
        .eq('id', 1)
        .maybeSingle()
      if (settings.error !== null) return dbFailure('the settings', settings.error)
      lines.push(
        ...tuitionLines(
          kids.data.map((kid) => kid.name),
          weeklyRate,
          settings.data?.rate_sibling_discount_pct ?? 0,
        ),
      )
    }
    lines.push(...extra)
    if (lines.length === 0) {
      return { ok: false, error: 'Nothing to bill: set tuition: true, or give at least one line with a price' }
    }
    if (lines.length > MAX_LINES) return { ok: false, error: `An invoice can have at most ${MAX_LINES} lines` }

    const lineItems = withAmounts(lines)
    const amount = invoiceTotal(lineItems)
    if (amount <= 0) {
      return { ok: false, error: `Those lines come to ${money(amount)}. An invoice has to total more than $0.` }
    }

    const period = invoicePeriod(ctx.today, family.data.name)
    const payload = {
      familyId,
      familyLabel: family.data.name,
      period,
      dueDate,
      memo,
      lineItems: lines,
    }
    const key = `invoice.create:${JSON.stringify(payload)}`
    const seen = alreadyProposed(ctx, key)
    if (seen !== undefined) return proposed(seen)

    // The page does not warn about a second invoice for the same month; she would
    // see the first one in the list beside the form. Here she would not, so the
    // card says so rather than refusing — a second statement can be intended.
    const twin = await ctx.caller.db
      .from('invoices')
      .select('id')
      .eq('family_id', familyId)
      .eq('period', period)
      .limit(1)
    if (twin.error !== null) return dbFailure('their invoices', twin.error)

    const logged = await propose(ctx, {
      instruction: ctx.instruction,
      tool: 'invoice.create',
      riskTier: 'money',
      arguments: payload,
      subject: { familyId, familyLabel: family.data.name, targets: [] },
      model: ctx.model,
    })
    if (!logged.ok) return { ok: false, error: logged.error }

    const detail: { label: string; value: string }[] = [
      { label: 'Family', value: family.data.name },
      { label: 'Period', value: period },
      ...lineItems.map((line, index) => ({ label: `Line ${index + 1}`, value: describeLine(line) })),
      { label: 'Total', value: money(amount) },
      { label: 'Due', value: prettyDate(dueDate) },
    ]
    if (memo.length > 0) detail.push({ label: 'Memo', value: memo })
    const existing = twin.data[0]
    if (existing !== undefined) {
      detail.push({
        label: 'Careful',
        value: `${existing.id} is already filed under ${period}. This would be a second invoice for it.`,
      })
    }
    if (dueDate < ctx.today) {
      detail.push({ label: 'Careful', value: 'That due date has already passed, so it will show as overdue straight away.' })
    }
    detail.push({
      label: 'What happens',
      value:
        'It gets the next invoice number and appears in the family\'s portal with this balance. ' +
        'Nothing is charged and nothing is emailed.',
    })

    const preview: ActionPreview = {
      id: logged.value,
      kind: 'invoice.create',
      title: 'Create an invoice',
      summary: `${money(amount)} to ${family.data.name}, due ${prettyDate(dueDate)}`,
      detail,
      confirmLabel: `Create ${money(amount)} invoice`,
    }
    rememberProposal(ctx, key, preview)
    return proposed(preview)
  },
}

export const billingTools: ToolSpec[] = [paymentRecord, invoiceCreate]

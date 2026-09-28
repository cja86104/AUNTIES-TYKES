/**
 * Ro's read tools — plan §3's catalog, the read/query half.
 *
 * Every column list here is written out by hand, and by the owner's decision of
 * 2026-09-27 they are complete rather than minimized — see the header of
 * `../projection.ts` for what that decision was and what it trades away. The
 * lists stay explicit anyway: `select('*')` would silently widen a payload the
 * moment a migration adds a column, and these results go to third-party models.
 *
 * The queries run on the caller's own JWT, so the `admin_all` / `own_*` policies
 * decide what comes back — this file adds no family filtering of its own and
 * must not.
 *
 * Nothing in this file writes.
 */

import type { Contact } from '../../../../src/types.js'
import { daysSince, shiftDays } from '../clock.js'
import {
  invoiceState,
  type AttendanceBrief,
  type CalendarEventBrief,
  type ChildBrief,
  type DailyLogBrief,
  type DocumentBrief,
  type EnrollmentBrief,
  type FamilyBrief,
  type InvoiceBrief,
  type PaymentBrief,
  type SettingsBrief,
  type ThreadBrief,
  type ThreadMessageBrief,
} from '../projection.js'
import {
  dbFailure,
  NO_ARGS,
  readBoolean,
  readDate,
  readEnum,
  readInt,
  readSearchTerm,
  readString,
  schema,
  type ToolOutcome,
  type ToolSpec,
} from './kit.js'

/* ------------------------------- column lists ------------------------------ */
// Nothing is withheld: full contact details, dates of birth, allergies,
// medications and payment methods are all included, per the owner's decision.
// The one field that still needs care is the business's own phone/email in
// settings, which are seeded with the literal text 'TBD — add before launch';
// settings.get's description tells the model to treat those as unset rather
// than quoting a placeholder into a draft.

// prettier-ignore
const FAMILY_COLUMNS = 'id, name, primary_contact, relation, email, phone, address, secondary, emergency, joined_at, notes, custom_weekly_rate'
// prettier-ignore
const CHILD_COLUMNS = 'id, family_id, name, dob, age_group, status, plan, start_date, teacher, allergies, medications, notes'
const ATTENDANCE_COLUMNS = 'child_id, date, status, check_in, check_out, note'
const LOG_COLUMNS = 'id, child_id, date, meals, naps, potty, mood, activities, notes, author'
const INVOICE_COLUMNS = 'id, family_id, period, issued_at, due_date, amount, memo'
const PAYMENT_COLUMNS = 'invoice_id, date, amount, method, ref'
const THREAD_COLUMNS = 'id, family_id, subject, updated_at'
const MESSAGE_COLUMNS = 'thread_id, from_role, author_name, at, body'
const DOCUMENT_COLUMNS = 'id, title, category, visible_to_parents, requires_ack, uploaded_at'
// prettier-ignore
const ENROLLMENT_COLUMNS = 'id, submitted_at, status, family_name, primary_contact, relation, email, phone, address, secondary, emergency, children, notes, acknowledged_handbook'
const CALENDAR_COLUMNS =
  'id, kind, title, note, starts_on, ends_on, closes_at, child_id, visible_to_parents'
// One unbroken literal: concatenating with `+` widens the type to `string`, and
// supabase-js needs the literal to infer the row shape it returns.
// prettier-ignore
const SETTINGS_COLUMNS = 'business_name, director, address, phone, email, hours, capacity, ratios, rate_full_time, rate_part_time, rate_drop_in, rate_registration_fee, rate_late_fee_per_minute, rate_sibling_discount_pct, policy_sick, policy_late_pickup, policy_holidays, policy_potty'

const MAX_ROWS = 200
const MAX_THREADS = 50

/* --------------------------------- mappers -------------------------------- */

interface FamilyRowShape {
  id: string
  name: string
  primary_contact: string
  relation: string
  email: string
  phone: string
  address: string
  secondary: Contact
  emergency: Contact[]
  joined_at: string
  notes: string
  custom_weekly_rate: number | null
}

function toFamilyBrief(row: FamilyRowShape): FamilyBrief {
  return {
    id: row.id,
    name: row.name,
    primaryContact: row.primary_contact,
    relation: row.relation,
    email: row.email,
    phone: row.phone,
    address: row.address,
    secondary: row.secondary,
    emergency: row.emergency,
    joinedAt: row.joined_at,
    notes: row.notes,
    customWeeklyRate: row.custom_weekly_rate,
  }
}

interface ChildRowShape {
  id: string
  family_id: string
  name: string
  dob: string
  age_group: string
  status: string
  plan: string
  start_date: string | null
  teacher: string
  allergies: string[]
  medications: string[]
  notes: string
}

function toChildBrief(row: ChildRowShape): ChildBrief {
  return {
    id: row.id,
    familyId: row.family_id,
    name: row.name,
    dob: row.dob,
    ageGroup: row.age_group,
    status: row.status,
    plan: row.plan,
    startDate: row.start_date,
    teacher: row.teacher,
    allergies: row.allergies,
    medications: row.medications,
    notes: row.notes,
  }
}

interface InvoiceRowShape {
  id: string
  family_id: string
  period: string
  issued_at: string
  due_date: string
  amount: number
  memo: string
}

function toInvoiceBrief(
  row: InvoiceRowShape,
  payments: { amount: number }[],
  today: string,
): InvoiceBrief {
  const paid = payments.reduce((total, payment) => total + payment.amount, 0)
  const balance = Math.max(0, row.amount - paid)
  return {
    id: row.id,
    familyId: row.family_id,
    period: row.period,
    dueDate: row.due_date,
    issuedAt: row.issued_at,
    amount: row.amount,
    paid,
    balance,
    status: invoiceState(row.amount, payments, row.due_date, today),
    daysPastDue: daysSince(row.due_date),
    memo: row.memo,
  }
}

interface PaymentRowShape {
  invoice_id: string
  date: string
  amount: number
  method: string
  ref: string
}

function toPaymentBrief(row: PaymentRowShape): PaymentBrief {
  return { date: row.date, amount: row.amount, method: row.method, ref: row.ref }
}

/** Groups payment rows by invoice id. */
function groupPayments(rows: PaymentRowShape[]): Map<string, PaymentBrief[]> {
  const byInvoice = new Map<string, PaymentBrief[]>()
  for (const row of rows) {
    const list = byInvoice.get(row.invoice_id) ?? []
    list.push(toPaymentBrief(row))
    byInvoice.set(row.invoice_id, list)
  }
  return byInvoice
}

/* ---------------------------------- tools --------------------------------- */

const familyFind: ToolSpec = {
  name: 'family.find',
  tier: 'read',
  description:
    'Find enrolled families by name. Searches the family name and the primary ' +
    "contact's name. Returns { matches: [] } when nothing matches — say you do not " +
    'have that family rather than guessing which one was meant.',
  parameters: schema(
    { query: { type: 'string', description: 'A family name or guardian name, or part of one' } },
    ['query'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const query = readSearchTerm(args, 'query')
    if (query === null) return { ok: false, error: 'A search term is required' }

    // Two queries rather than one `.or()`: the or() filter is a mini-language
    // parsed from the query string, and this term comes from the model.
    const byName = await ctx.caller.db
      .from('families')
      .select(FAMILY_COLUMNS)
      .ilike('name', `%${query}%`)
      .limit(MAX_ROWS)
    if (byName.error !== null) return dbFailure('families', byName.error)

    const byContact = await ctx.caller.db
      .from('families')
      .select(FAMILY_COLUMNS)
      .ilike('primary_contact', `%${query}%`)
      .limit(MAX_ROWS)
    if (byContact.error !== null) return dbFailure('families', byContact.error)

    const seen = new Set<string>()
    const matches: FamilyBrief[] = []
    for (const row of [...byName.data, ...byContact.data]) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      matches.push(toFamilyBrief(row))
    }
    return { ok: true, data: { query, matches } }
  },
}

const familyGet: ToolSpec = {
  name: 'family.get',
  tier: 'read',
  description:
    'Everything on one family: their children, their invoices and their message ' +
    'threads. Takes a family id from family.find or roster.list. Returns ' +
    '{ found: false } when no family has that id.',
  parameters: schema({ familyId: { type: 'string' } }, ['familyId']),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const familyId = readString(args, 'familyId')
    if (familyId === null) return { ok: false, error: 'A familyId is required' }

    const family = await ctx.caller.db
      .from('families')
      .select(FAMILY_COLUMNS)
      .eq('id', familyId)
      .maybeSingle()
    if (family.error !== null) return dbFailure('that family', family.error)
    if (family.data === null) return { ok: true, data: { found: false, familyId } }

    const children = await ctx.caller.db
      .from('children')
      .select(CHILD_COLUMNS)
      .eq('family_id', familyId)
      .limit(MAX_ROWS)
    if (children.error !== null) return dbFailure('their children', children.error)

    const invoices = await ctx.caller.db
      .from('invoices')
      .select(INVOICE_COLUMNS)
      .eq('family_id', familyId)
      .order('due_date', { ascending: false })
      .limit(MAX_ROWS)
    if (invoices.error !== null) return dbFailure('their invoices', invoices.error)

    const invoiceIds = invoices.data.map((row) => row.id)
    let paymentsByInvoice = new Map<string, PaymentBrief[]>()
    if (invoiceIds.length > 0) {
      const payments = await ctx.caller.db
        .from('payments')
        .select(PAYMENT_COLUMNS)
        .in('invoice_id', invoiceIds)
      if (payments.error !== null) return dbFailure('their payments', payments.error)
      paymentsByInvoice = groupPayments(payments.data)
    }

    const threads = await ctx.caller.db
      .from('threads')
      .select(THREAD_COLUMNS)
      .eq('family_id', familyId)
      .order('updated_at', { ascending: false })
      .limit(MAX_THREADS)
    if (threads.error !== null) return dbFailure('their messages', threads.error)

    return {
      ok: true,
      data: {
        found: true,
        family: toFamilyBrief(family.data),
        children: children.data.map(toChildBrief),
        invoices: invoices.data.map((row) =>
          toInvoiceBrief(row, paymentsByInvoice.get(row.id) ?? [], ctx.today),
        ),
        threads: threads.data.map((row) => ({
          id: row.id,
          subject: row.subject,
          updatedAt: row.updated_at,
        })),
      },
    }
  },
}

const rosterList: ToolSpec = {
  name: 'roster.list',
  tier: 'read',
  description:
    'The children on the roster, with the family each belongs to. Use this for ' +
    '"who is enrolled", age-group counts, or to resolve a child name to an id.',
  parameters: schema({
    status: { type: 'string', enum: ['active', 'waitlist', 'all'] },
    ageGroup: { type: 'string', enum: ['Infant', 'Toddler', 'Preschool'] },
  }),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const status = readEnum(args, 'status', ['active', 'waitlist', 'all'] as const, 'active')
    const ageGroup = readEnum(
      args,
      'ageGroup',
      ['Infant', 'Toddler', 'Preschool', 'any'] as const,
      'any',
    )

    let query = ctx.caller.db.from('children').select(CHILD_COLUMNS).limit(MAX_ROWS)
    if (status !== 'all') query = query.eq('status', status)
    if (ageGroup !== 'any') query = query.eq('age_group', ageGroup)

    const children = await query
    if (children.error !== null) return dbFailure('the roster', children.error)

    const families = await ctx.caller.db.from('families').select('id, name').limit(MAX_ROWS)
    if (families.error !== null) return dbFailure('families', families.error)
    const familyNames = new Map(families.data.map((row) => [row.id, row.name]))

    const roster = children.data.map((row) => ({
      ...toChildBrief(row),
      familyName: familyNames.get(row.family_id) ?? null,
    }))
    return { ok: true, data: { count: roster.length, children: roster } }
  },
}

const attendanceToday: ToolSpec = {
  name: 'attendance.today',
  tier: 'read',
  description:
    "Today's attendance sheet: who is checked in, checked out, absent or still " +
    'expected, plus any active child with no record at all yet. Also answers ' +
    '"how many are here right now".',
  parameters: schema({ date: { type: 'string', description: 'yyyy-MM-dd; defaults to today' } }),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const date = readDate(args, 'date') ?? ctx.today

    const children = await ctx.caller.db
      .from('children')
      .select(CHILD_COLUMNS)
      .eq('status', 'active')
      .limit(MAX_ROWS)
    if (children.error !== null) return dbFailure('the roster', children.error)

    const records = await ctx.caller.db
      .from('attendance')
      .select(ATTENDANCE_COLUMNS)
      .eq('date', date)
      .limit(MAX_ROWS)
    if (records.error !== null) return dbFailure("today's attendance", records.error)

    const byChild = new Map(records.data.map((row) => [row.child_id, row]))
    const lines = children.data.map((child) => {
      const record = byChild.get(child.id)
      const line: AttendanceBrief & { childName: string; familyId: string } = {
        childId: child.id,
        childName: child.name,
        familyId: child.family_id,
        date,
        // 'not recorded' is not an attendance_status value in the schema — it is
        // this tool's word for "no row exists yet", which is what §5's
        // daily_log_missing and a "who is still expected" question both turn on.
        status: record?.status ?? 'not recorded',
        checkIn: record?.check_in ?? null,
        checkOut: record?.check_out ?? null,
        note: record?.note ?? '',
      }
      return line
    })

    const tally = (status: string): number => lines.filter((line) => line.status === status).length
    return {
      ok: true,
      data: {
        date,
        summary: {
          present: tally('present'),
          checkedOut: tally('checked-out'),
          absent: tally('absent'),
          expected: tally('expected'),
          notRecorded: tally('not recorded'),
        },
        children: lines,
      },
    }
  },
}

const attendanceHistory: ToolSpec = {
  name: 'attendance.history',
  tier: 'read',
  description:
    "One child's recent attendance, most recent first. Use for questions about a " +
    'pattern — frequent absences, late pickups.',
  parameters: schema(
    {
      childId: { type: 'string' },
      days: { type: 'integer', description: 'How far back to look, 1-120. Default 30' },
    },
    ['childId'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const childId = readString(args, 'childId')
    if (childId === null) return { ok: false, error: 'A childId is required' }
    const days = readInt(args, 'days', 1, 120, 30)

    const records = await ctx.caller.db
      .from('attendance')
      .select(ATTENDANCE_COLUMNS)
      .eq('child_id', childId)
      .gte('date', shiftDays(ctx.today, -days))
      .lte('date', ctx.today)
      .order('date', { ascending: false })
      .limit(MAX_ROWS)
    if (records.error !== null) return dbFailure('that attendance history', records.error)

    const history: AttendanceBrief[] = records.data.map((row) => ({
      childId: row.child_id,
      date: row.date,
      status: row.status,
      checkIn: row.check_in,
      checkOut: row.check_out,
      note: row.note,
    }))
    return { ok: true, data: { childId, days, count: history.length, records: history } }
  },
}

const dailyLogList: ToolSpec = {
  name: 'dailyLog.list',
  tier: 'read',
  description:
    'Daily logs, by date or by child. Use to check whether a log was written, or ' +
    "to read what went into one before drafting a parent's message.",
  parameters: schema({
    date: { type: 'string', description: 'yyyy-MM-dd. Defaults to today when no childId is given' },
    childId: { type: 'string' },
    days: { type: 'integer', description: 'With childId: how far back, 1-60. Default 14' },
  }),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const childId = readString(args, 'childId')
    const date = readDate(args, 'date')
    const days = readInt(args, 'days', 1, 60, 14)

    let query = ctx.caller.db.from('daily_logs').select(LOG_COLUMNS)
    if (childId !== null) {
      query = query.eq('child_id', childId)
      if (date !== null) query = query.eq('date', date)
      else query = query.gte('date', shiftDays(ctx.today, -days)).lte('date', ctx.today)
    } else {
      query = query.eq('date', date ?? ctx.today)
    }

    const logs = await query.order('date', { ascending: false }).limit(MAX_ROWS)
    if (logs.error !== null) return dbFailure('daily logs', logs.error)

    const list: DailyLogBrief[] = logs.data.map((row) => ({
      id: row.id,
      childId: row.child_id,
      date: row.date,
      meals: row.meals,
      naps: row.naps,
      potty: row.potty,
      mood: row.mood,
      activities: row.activities,
      notes: row.notes,
      author: row.author,
    }))
    return { ok: true, data: { count: list.length, logs: list } }
  },
}

const invoiceList: ToolSpec = {
  name: 'invoice.list',
  tier: 'read',
  description:
    'Invoices with their real balances and status. Status is computed from ' +
    'payments and the due date, not stored — trust it over any memory of it. ' +
    'There is no payment processor: an invoice is a statement, and payments are ' +
    'recorded by the owner by hand.',
  parameters: schema({
    status: { type: 'string', enum: ['all', 'unpaid', 'overdue', 'paid'] },
    familyId: { type: 'string' },
  }),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const status = readEnum(args, 'status', ['all', 'unpaid', 'overdue', 'paid'] as const, 'all')
    const familyId = readString(args, 'familyId')

    let query = ctx.caller.db.from('invoices').select(INVOICE_COLUMNS)
    if (familyId !== null) query = query.eq('family_id', familyId)

    const invoices = await query.order('due_date', { ascending: false }).limit(MAX_ROWS)
    if (invoices.error !== null) return dbFailure('invoices', invoices.error)

    const invoiceIds = invoices.data.map((row) => row.id)
    let paymentsByInvoice = new Map<string, PaymentBrief[]>()
    if (invoiceIds.length > 0) {
      const payments = await ctx.caller.db
        .from('payments')
        .select(PAYMENT_COLUMNS)
        .in('invoice_id', invoiceIds)
      if (payments.error !== null) return dbFailure('payments', payments.error)
      paymentsByInvoice = groupPayments(payments.data)
    }

    const families = await ctx.caller.db.from('families').select('id, name').limit(MAX_ROWS)
    if (families.error !== null) return dbFailure('families', families.error)
    const familyNames = new Map(families.data.map((row) => [row.id, row.name]))

    const all = invoices.data.map((row) => ({
      ...toInvoiceBrief(row, paymentsByInvoice.get(row.id) ?? [], ctx.today),
      familyName: familyNames.get(row.family_id) ?? null,
    }))
    const filtered = status === 'all' ? all : all.filter((invoice) => invoice.status === status)

    return {
      ok: true,
      data: {
        status,
        count: filtered.length,
        totalOutstanding: filtered.reduce((total, invoice) => total + invoice.balance, 0),
        invoices: filtered,
      },
    }
  },
}

const invoiceGet: ToolSpec = {
  name: 'invoice.get',
  tier: 'read',
  description:
    'One invoice in full: its line items and the payments recorded against it. ' +
    'Returns { found: false } for an unknown id.',
  parameters: schema({ invoiceId: { type: 'string' } }, ['invoiceId']),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const invoiceId = readString(args, 'invoiceId')
    if (invoiceId === null) return { ok: false, error: 'An invoiceId is required' }

    const invoice = await ctx.caller.db
      .from('invoices')
      .select(`${INVOICE_COLUMNS}, line_items`)
      .eq('id', invoiceId)
      .maybeSingle()
    if (invoice.error !== null) return dbFailure('that invoice', invoice.error)
    if (invoice.data === null) return { ok: true, data: { found: false, invoiceId } }

    const payments = await ctx.caller.db
      .from('payments')
      .select(PAYMENT_COLUMNS)
      .eq('invoice_id', invoiceId)
      .order('date', { ascending: true })
    if (payments.error !== null) return dbFailure('its payments', payments.error)

    return {
      ok: true,
      data: {
        found: true,
        invoice: toInvoiceBrief(invoice.data, payments.data, ctx.today),
        lineItems: invoice.data.line_items,
        payments: payments.data.map(toPaymentBrief),
      },
    }
  },
}

const threadList: ToolSpec = {
  name: 'thread.list',
  tier: 'read',
  description:
    'Message threads, most recently active first. Read waitingOn literally: ' +
    '"owner" means the PARENT sent the last message and is waiting on a reply from ' +
    'her; "family" means she sent the last message and the parent has not written ' +
    'back. Never describe it the other way round — check waitingOn before saying ' +
    'who owes whom. awaitingReplyOnly filters to the threads where she owes a reply.',
  parameters: schema({ awaitingReplyOnly: { type: 'boolean' } }),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const awaitingOnly = readBoolean(args, 'awaitingReplyOnly', false)

    const threads = await ctx.caller.db
      .from('threads')
      .select(THREAD_COLUMNS)
      .order('updated_at', { ascending: false })
      .limit(MAX_THREADS)
    if (threads.error !== null) return dbFailure('message threads', threads.error)
    if (threads.data.length === 0) return { ok: true, data: { count: 0, threads: [] } }

    const messages = await ctx.caller.db
      .from('thread_messages')
      .select('thread_id, from_role, at')
      .in(
        'thread_id',
        threads.data.map((row) => row.id),
      )
      .order('at', { ascending: false })
    if (messages.error !== null) return dbFailure('their messages', messages.error)

    // Ordered newest-first, so the first sighting of a thread is its last message.
    const latest = new Map<string, { role: 'admin' | 'parent'; at: string }>()
    for (const row of messages.data) {
      if (!latest.has(row.thread_id)) latest.set(row.thread_id, { role: row.from_role, at: row.at })
    }

    const all: ThreadBrief[] = threads.data.map((row) => {
      const last = latest.get(row.id)
      return {
        id: row.id,
        familyId: row.family_id,
        subject: row.subject,
        updatedAt: row.updated_at,
        lastFrom: last?.role ?? null,
        lastAt: last?.at ?? null,
        awaitingReply: last?.role === 'parent',
        waitingOn: last === undefined ? null : last.role === 'parent' ? 'owner' : 'family',
      }
    })
    const filtered = awaitingOnly ? all.filter((thread) => thread.awaitingReply) : all
    return { ok: true, data: { count: filtered.length, threads: filtered } }
  },
}

const threadGet: ToolSpec = {
  name: 'thread.get',
  tier: 'read',
  description:
    'The messages in one thread, oldest first — so the LAST entry is the most ' +
    'recent. On each message, from: "admin" is her and from: "parent" is the ' +
    'family. Read this before drafting a reply so the draft answers what was ' +
    'actually asked, and check the last message before saying who spoke last.',
  parameters: schema(
    {
      threadId: { type: 'string' },
      limit: { type: 'integer', description: 'Most recent N messages, 1-50. Default 20' },
    },
    ['threadId'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const threadId = readString(args, 'threadId')
    if (threadId === null) return { ok: false, error: 'A threadId is required' }
    const limit = readInt(args, 'limit', 1, 50, 20)

    const thread = await ctx.caller.db
      .from('threads')
      .select(THREAD_COLUMNS)
      .eq('id', threadId)
      .maybeSingle()
    if (thread.error !== null) return dbFailure('that thread', thread.error)
    if (thread.data === null) return { ok: true, data: { found: false, threadId } }

    const messages = await ctx.caller.db
      .from('thread_messages')
      .select(MESSAGE_COLUMNS)
      .eq('thread_id', threadId)
      .order('at', { ascending: false })
      .limit(limit)
    if (messages.error !== null) return dbFailure('its messages', messages.error)

    const ordered: ThreadMessageBrief[] = messages.data
      .map((row) => ({
        from: row.from_role,
        authorName: row.author_name,
        at: row.at,
        body: row.body,
      }))
      .reverse()

    return {
      ok: true,
      data: {
        found: true,
        threadId,
        familyId: thread.data.family_id,
        subject: thread.data.subject,
        messages: ordered,
      },
    }
  },
}

const documentList: ToolSpec = {
  name: 'document.list',
  tier: 'read',
  description:
    'Documents shared with families, and how many families have acknowledged ' +
    'each one that requires it.',
  parameters: schema({ requiresAckOnly: { type: 'boolean' } }),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const requiresAckOnly = readBoolean(args, 'requiresAckOnly', false)

    let query = ctx.caller.db.from('documents').select(DOCUMENT_COLUMNS)
    if (requiresAckOnly) query = query.eq('requires_ack', true)
    const documents = await query.order('uploaded_at', { ascending: false }).limit(MAX_ROWS)
    if (documents.error !== null) return dbFailure('documents', documents.error)
    if (documents.data.length === 0) return { ok: true, data: { count: 0, documents: [] } }

    const acks = await ctx.caller.db
      .from('document_acknowledgements')
      .select('document_id')
      .in(
        'document_id',
        documents.data.map((row) => row.id),
      )
    if (acks.error !== null) return dbFailure('acknowledgements', acks.error)

    const ackCounts = new Map<string, number>()
    for (const row of acks.data) {
      ackCounts.set(row.document_id, (ackCounts.get(row.document_id) ?? 0) + 1)
    }

    const list = documents.data.map((row) => {
      const brief: DocumentBrief & { acknowledgedBy: number } = {
        id: row.id,
        title: row.title,
        category: row.category,
        visibleToParents: row.visible_to_parents,
        requiresAck: row.requires_ack,
        uploadedAt: row.uploaded_at,
        acknowledgedBy: ackCounts.get(row.id) ?? 0,
      }
      return brief
    })
    return { ok: true, data: { count: list.length, documents: list } }
  },
}

const enrollmentList: ToolSpec = {
  name: 'enrollment.list',
  tier: 'read',
  description:
    'Enrollment submissions from the public form. Defaults to the pending ones, ' +
    'with how long each has been waiting. Approving one is not something you can do.',
  parameters: schema({
    status: { type: 'string', enum: ['pending', 'approved', 'declined', 'all'] },
  }),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const status = readEnum(
      args,
      'status',
      ['pending', 'approved', 'declined', 'all'] as const,
      'pending',
    )

    let query = ctx.caller.db.from('enrollments').select(ENROLLMENT_COLUMNS)
    if (status !== 'all') query = query.eq('status', status)
    const rows = await query.order('submitted_at', { ascending: true }).limit(MAX_ROWS)
    if (rows.error !== null) return dbFailure('enrollment submissions', rows.error)

    const list: EnrollmentBrief[] = rows.data.map((row) => ({
      id: row.id,
      submittedAt: row.submitted_at,
      status: row.status,
      familyName: row.family_name,
      primaryContact: row.primary_contact,
      relation: row.relation,
      email: row.email,
      phone: row.phone,
      address: row.address,
      secondary: row.secondary,
      emergency: row.emergency,
      // The children exactly as the parent typed them, dates of birth included.
      children: row.children,
      notes: row.notes,
      acknowledgedHandbook: row.acknowledged_handbook,
      daysWaiting: daysSince(row.submitted_at.slice(0, 10)),
    }))
    return { ok: true, data: { status, count: list.length, enrollments: list } }
  },
}

const calendarUpcoming: ToolSpec = {
  name: 'calendar.upcoming',
  tier: 'read',
  description:
    'Closures, early closes, activities and reminders the owner has put on the ' +
    'calendar, including anything still running. Birthdays are not on the ' +
    "calendar — work those out from each child's dob on roster.list.",
  parameters: schema({
    days: { type: 'integer', description: 'How far ahead, 1-120. Default 14' },
  }),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const days = readInt(args, 'days', 1, 120, 14)
    const end = shiftDays(ctx.today, days)

    // Bounded 30 days back so a multi-day event that began earlier and is still
    // running is caught, without walking the whole history.
    const events = await ctx.caller.db
      .from('calendar_events')
      .select(CALENDAR_COLUMNS)
      .gte('starts_on', shiftDays(ctx.today, -30))
      .lte('starts_on', end)
      .order('starts_on', { ascending: true })
      .limit(MAX_ROWS)
    if (events.error !== null) return dbFailure('the calendar', events.error)

    const list: CalendarEventBrief[] = events.data
      .filter((row) => (row.ends_on ?? row.starts_on) >= ctx.today)
      .map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        note: row.note,
        startsOn: row.starts_on,
        endsOn: row.ends_on,
        closesAt: row.closes_at,
        childId: row.child_id,
        visibleToParents: row.visible_to_parents,
      }))
    return { ok: true, data: { from: ctx.today, through: end, count: list.length, events: list } }
  },
}

const settingsGet: ToolSpec = {
  name: 'settings.get',
  tier: 'read',
  description:
    'The business settings: contact details, hours, capacity, ratios, the rate ' +
    'card and the policy text. Quote policy wording from here rather than ' +
    "paraphrasing it from memory. If a contact field reads 'TBD — add before " +
    "launch' it is an unfilled placeholder, not real contact information — say it " +
    'is not set yet and never put that text in a draft.',
  parameters: NO_ARGS,
  execute: async (_args, ctx): Promise<ToolOutcome> => {
    const row = await ctx.caller.db
      .from('settings')
      .select(SETTINGS_COLUMNS)
      .eq('id', 1)
      .maybeSingle()
    if (row.error !== null) return dbFailure('the settings', row.error)
    if (row.data === null) return { ok: true, data: { found: false } }

    const settings: SettingsBrief = {
      businessName: row.data.business_name,
      director: row.data.director,
      address: row.data.address,
      phone: row.data.phone,
      email: row.data.email,
      hours: row.data.hours,
      capacity: row.data.capacity,
      ratios: row.data.ratios,
      rates: {
        fullTime: row.data.rate_full_time,
        partTime: row.data.rate_part_time,
        dropIn: row.data.rate_drop_in,
        registrationFee: row.data.rate_registration_fee,
        lateFeePerMinute: row.data.rate_late_fee_per_minute,
        siblingDiscountPct: row.data.rate_sibling_discount_pct,
      },
      policies: {
        sick: row.data.policy_sick,
        latePickup: row.data.policy_late_pickup,
        holidays: row.data.policy_holidays,
        potty: row.data.policy_potty,
      },
    }
    return { ok: true, data: { found: true, settings } }
  },
}

export const readTools: ToolSpec[] = [
  familyFind,
  familyGet,
  rosterList,
  attendanceToday,
  attendanceHistory,
  dailyLogList,
  invoiceList,
  invoiceGet,
  threadList,
  threadGet,
  documentList,
  enrollmentList,
  calendarUpcoming,
  settingsGet,
]

/**
 * The Supabase read/write layer behind the store.
 *
 * The store keeps its synchronous API and its in-memory cache; this module is
 * what fills that cache on sign-in and pushes changes back afterwards. Writes
 * are fire-and-forget from the caller's point of view — they reject, and the
 * store turns a rejection into an error toast.
 *
 * Every read here is additionally filtered by RLS on the server, so a parent
 * receives only their own family's rows no matter what this code asks for.
 */
import { supabase } from './supabase'
import {
  fromAnnouncement,
  fromAttendance,
  fromChild,
  fromDailyLog,
  fromDocument,
  fromFamily,
  fromInvoice,
  fromLead,
  fromPayment,
  fromSettings,
  fromThread,
  fromThreadMessage,
  toAnnouncement,
  toChild,
  toDocument,
  toEnrollment,
  toFamily,
  toInvoice,
  toLead,
  toSessionUser,
  toSettings,
  toThread,
  toWaitlistProspect,
  toAttendance,
  toDailyLog,
} from './db'
import type {
  Announcement,
  AttendanceRecord,
  Child,
  DailyLog,
  DocumentRecord,
  EnrollmentSubmission,
  Family,
  Invoice,
  Lead,
  Payment,
  SessionUser,
  Settings,
  Thread,
  ThreadMessage,
  User,
  WaitlistProspect,
} from '../types'
import type { PaymentRow, ThreadMessageRow } from './database.types'

/** Everything the store caches, as hydrated from the database. */
export interface HydratedData {
  users: User[]
  families: Family[]
  children: Child[]
  attendance: AttendanceRecord[]
  dailyLogs: DailyLog[]
  invoices: Invoice[]
  documents: DocumentRecord[]
  announcements: Announcement[]
  threads: Thread[]
  enrollments: EnrollmentSubmission[]
  leads: Lead[]
  waitlist: WaitlistProspect[]
  acknowledgements: string[]
  settings: Settings | null
}

class SupabaseError extends Error {}

/** Unwrap a PostgREST result, turning `{ error }` into a thrown error. */
async function run<T>(
  query: PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<NonNullable<T>> {
  const { data, error } = await query
  if (error) throw new SupabaseError(error.message)
  if (data === null || data === undefined) throw new SupabaseError('No data returned')
  return data
}

/** Group rows by a foreign key so parents can be assembled with their children. */
function groupBy<T, K extends string>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const row of rows) {
    const k = key(row)
    const existing = map.get(k)
    if (existing) existing.push(row)
    else map.set(k, [row])
  }
  return map
}

/* ---------------------------------- auth ---------------------------------- */

export async function signIn(email: string, password: string): Promise<SessionUser> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error || !data.user) {
    throw new SupabaseError('That email and password combination does not match our records.')
  }
  return loadProfile(data.user.id)
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw new SupabaseError(error.message)
}

async function loadProfile(userId: string): Promise<SessionUser> {
  const row = await run(supabase.from('profiles').select('*').eq('id', userId).single())
  return toSessionUser(row)
}

/**
 * Restore a signed-in user on page load. Returns null when there is no valid
 * session, which is the normal signed-out case rather than an error.
 */
export async function restoreSession(): Promise<SessionUser | null> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) return null
  try {
    return await loadProfile(data.session.user.id)
  } catch {
    return null
  }
}

/* ---------------------------------- read ---------------------------------- */

export async function hydrateAll(): Promise<HydratedData> {
  const [
    profiles,
    families,
    children,
    attendance,
    dailyLogs,
    invoices,
    payments,
    documents,
    acks,
    announcements,
    threads,
    threadMessages,
    enrollments,
    leads,
    waitlist,
    settings,
  ] = await Promise.all([
    run(supabase.from('profiles').select('*')),
    run(supabase.from('families').select('*')),
    run(supabase.from('children').select('*')),
    run(supabase.from('attendance').select('*')),
    run(supabase.from('daily_logs').select('*')),
    run(supabase.from('invoices').select('*')),
    run(supabase.from('payments').select('*')),
    run(supabase.from('documents').select('*')),
    run(supabase.from('document_acknowledgements').select('*')),
    run(supabase.from('announcements').select('*')),
    run(supabase.from('threads').select('*')),
    run(supabase.from('thread_messages').select('*')),
    run(supabase.from('enrollments').select('*')),
    run(supabase.from('leads').select('*')),
    run(supabase.from('waitlist_prospects').select('*')),
    supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
  ])

  const paymentsByInvoice = groupBy<PaymentRow, string>(payments, (p) => p.invoice_id)
  const messagesByThread = groupBy<ThreadMessageRow, string>(threadMessages, (m) => m.thread_id)

  return {
    users: profiles.map(toSessionUser),
    families: families.map(toFamily),
    children: children.map(toChild),
    attendance: attendance.map(toAttendance),
    dailyLogs: dailyLogs.map(toDailyLog),
    invoices: invoices.map((i) => toInvoice(i, paymentsByInvoice.get(i.id) ?? [])),
    documents: documents.map(toDocument),
    announcements: announcements.map(toAnnouncement),
    threads: threads.map((t) => toThread(t, messagesByThread.get(t.id) ?? [])),
    enrollments: enrollments.map(toEnrollment),
    leads: leads.map(toLead),
    waitlist: waitlist.map(toWaitlistProspect),
    acknowledgements: acks.map((a) => `${a.profile_id}:${a.document_id}`),
    settings: settings.data ? toSettings(settings.data) : null,
  }
}

/* --------------------------------- write ---------------------------------- */

/**
 * Upserts rather than inserts throughout: the store has already applied the
 * change locally with a known id, so replaying the same write must not create
 * a duplicate row.
 */
export const persist = {
  family: (family: Family) => run(supabase.from('families').upsert(fromFamily(family)).select()),

  child: (child: Child) => run(supabase.from('children').upsert(fromChild(child)).select()),

  attendance: (record: AttendanceRecord) =>
    run(supabase.from('attendance').upsert(fromAttendance(record), { onConflict: 'child_id,date' }).select()),

  dailyLog: (log: DailyLog, authorId: string | null) =>
    run(supabase.from('daily_logs').upsert(fromDailyLog(log, authorId)).select()),

  deleteDailyLog: (id: string) => run(supabase.from('daily_logs').delete().eq('id', id).select()),

  invoice: (invoice: Invoice) => run(supabase.from('invoices').upsert(fromInvoice(invoice)).select()),

  payment: (payment: Payment, invoiceId: string) =>
    run(supabase.from('payments').upsert(fromPayment(payment, invoiceId)).select()),

  document: (doc: DocumentRecord, uploadedById: string | null) =>
    run(supabase.from('documents').upsert(fromDocument(doc, uploadedById)).select()),

  deleteDocument: (id: string) => run(supabase.from('documents').delete().eq('id', id).select()),

  acknowledgement: (documentId: string, profileId: string) =>
    run(
      supabase
        .from('document_acknowledgements')
        .upsert({ document_id: documentId, profile_id: profileId })
        .select(),
    ),

  announcement: (announcement: Announcement) =>
    run(supabase.from('announcements').upsert(fromAnnouncement(announcement)).select()),

  thread: (thread: Thread) => run(supabase.from('threads').upsert(fromThread(thread)).select()),

  threadMessage: (message: ThreadMessage, threadId: string, authorId: string | null) =>
    run(supabase.from('thread_messages').upsert(fromThreadMessage(message, threadId, authorId)).select()),

  lead: (lead: Lead) => run(supabase.from('leads').upsert(fromLead(lead)).select()),

  settings: (settings: Settings) => run(supabase.from('settings').upsert(fromSettings(settings)).select()),

  /** The public enrollment form: anon may insert, and cannot read back. */
  enrollment: (submission: EnrollmentSubmission) =>
    run(
      supabase
        .from('enrollments')
        .insert({
          id: submission.id,
          submitted_at: submission.submittedAt,
          status: submission.status,
          family_name: submission.familyName,
          primary_contact: submission.primaryContact,
          relation: submission.relation,
          email: submission.email,
          phone: submission.phone,
          address: submission.address,
          secondary: submission.secondary,
          emergency: submission.emergency,
          children: submission.children,
          notes: submission.notes,
          acknowledged_handbook: submission.acknowledgedHandbook,
        })
        .select(),
    ),

  enrollmentStatus: (id: string, status: EnrollmentSubmission['status'], createdFamilyId?: string) =>
    run(
      supabase
        .from('enrollments')
        .update({
          status,
          reviewed_at: new Date().toISOString(),
          created_family_id: createdFamilyId ?? null,
        })
        .eq('id', id)
        .select(),
    ),

  waitlist: async (list: WaitlistProspect[]) => {
    await run(supabase.from('waitlist_prospects').delete().neq('id', '').select())
    if (list.length === 0) return
    await run(
      supabase.from('waitlist_prospects').insert(
        list.map((p) => ({
          id: p.id,
          child_name: p.childName,
          age_group: p.ageGroup,
          requested: p.requested || null,
          family: p.family,
          note: p.note,
        })),
      ).select(),
    )
  },
}

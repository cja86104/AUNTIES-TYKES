import { create } from 'zustand'
import {
  users as mUsers,
  families as mFamilies,
  children as mChildren,
  attendance as mAttendance,
  dailyLogs as mDailyLogs,
  invoices as mInvoices,
  documents as mDocuments,
  announcements as mAnnouncements,
  threads as mThreads,
  settings as mSettings,
  leads as mLeads,
  waitlistProspects,
} from '../data/mockData'
import { uid, nowTime, todayISO } from '../lib/helpers'
import type {
  Announcement,
  ApprovalResult,
  EnrollmentSubmission,
  NewChild,
  NewEnrollmentSubmission,
  NewFamily,
  PortalCredentials,
  User,
  AttendanceRecord,
  Child,
  DailyLog,
  DocumentRecord,
  Family,
  Invoice,
  Lead,
  NewAnnouncement,
  NewDailyLog,
  NewDocument,
  NewInvoice,
  NewLead,
  NewPayment,
  NewThread,
  NewThreadMessage,
  NewToast,
  Policies,
  Rates,
  SessionUser,
  Settings,
  Thread,
  Toast,
  WaitlistProspect,
} from '../types'

/** Avatar gradients cycled through as children are added. */
const CHILD_HUES = [
  'from-[#4F77D9] to-[#7DA0F0]',
  'from-[#5DC4A6] to-[#8FE0C9]',
  'from-[#F5B942] to-[#F9D28A]',
  'from-[#E86A6A] to-[#F49C9C]',
  'from-[#8B6ED9] to-[#B49CEE]',
  'from-[#4FB0C6] to-[#8FD7E4]',
] as const

function pickHue(index: number): string {
  return CHILD_HUES[index % CHILD_HUES.length] ?? CHILD_HUES[0]
}

/** Short, readable temporary password the owner can read out over the phone. */
function makeTempPassword(): string {
  return `tykes-${String(Math.floor(1000 + Math.random() * 9000))}`
}

/** "peanuts, eggs" -> ["peanuts", "eggs"] */
function splitList(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

const DATA_KEY = 'auntiestykes.data.v1'
const SESSION_KEY = 'auntiestykes.session.v1'

/** The persisted slice of the store — everything that survives a reload. */
interface DataSlice {
  /** Live account list. Seeded from mockData so new enrollments can add logins. */
  users: User[]
  enrollments: EnrollmentSubmission[]
  families: Family[]
  children: Child[]
  attendance: AttendanceRecord[]
  dailyLogs: DailyLog[]
  invoices: Invoice[]
  documents: DocumentRecord[]
  announcements: Announcement[]
  threads: Thread[]
  settings: Settings
  leads: Lead[]
  waitlist: WaitlistProspect[]
  /** `${userId}:${documentId}` pairs for documents a parent has acknowledged. */
  acknowledgements: string[]
}

export type LoginResult = { ok: true; user: SessionUser } | { ok: false; error: string }

export interface StoreState extends DataSlice {
  user: SessionUser | null
  toasts: Toast[]

  pushToast: (toast: NewToast) => void
  dismissToast: (id: string) => void

  login: (email: string, password: string) => LoginResult
  logout: () => void

  checkIn: (childId: string) => void
  checkOut: (childId: string) => void
  markAbsent: (childId: string, note?: string) => void

  addDailyLog: (log: NewDailyLog) => void
  updateDailyLog: (id: string, patch: Partial<DailyLog>) => void
  deleteDailyLog: (id: string) => void

  createInvoice: (invoice: NewInvoice) => void
  recordPayment: (invoiceId: string, payment: NewPayment) => void

  addDocument: (doc: NewDocument) => void
  deleteDocument: (id: string) => void
  toggleDocVisibility: (id: string) => void
  acknowledgeDocument: (docId: string) => void

  addAnnouncement: (announcement: NewAnnouncement) => void
  sendThreadMessage: (threadId: string, message: NewThreadMessage) => void
  startThread: (thread: NewThread) => void

  addFamily: (family: NewFamily) => string
  updateFamily: (id: string, patch: Partial<Family>) => void
  addChild: (child: NewChild) => string
  updateChild: (id: string, patch: Partial<Child>) => void

  submitEnrollment: (submission: NewEnrollmentSubmission) => string
  approveEnrollment: (id: string) => ApprovalResult | null
  declineEnrollment: (id: string) => void
  createParentLogin: (familyId: string, name: string, email: string) => PortalCredentials | null

  addLead: (lead: NewLead) => void
  updateLead: (id: string, patch: Partial<Lead>) => void

  setWaitlist: (list: WaitlistProspect[]) => void

  updateSettings: (patch: Partial<Settings>) => void
  updateRates: (patch: Partial<Rates>) => void
  updatePolicies: (patch: Partial<Policies>) => void

  resetDemoData: () => void
}

const initialData: DataSlice = {
  users: mUsers,
  enrollments: [],
  families: mFamilies,
  children: mChildren,
  attendance: mAttendance,
  dailyLogs: mDailyLogs,
  invoices: mInvoices,
  documents: mDocuments,
  announcements: mAnnouncements,
  threads: mThreads,
  settings: mSettings,
  leads: mLeads,
  waitlist: waitlistProspects,
  acknowledgements: [],
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable — demo still works in memory */
  }
}

/** Pull just the persisted slice out of the live store state. */
function snapshot(state: StoreState): DataSlice {
  return {
    users: state.users,
    enrollments: state.enrollments,
    families: state.families,
    children: state.children,
    attendance: state.attendance,
    dailyLogs: state.dailyLogs,
    invoices: state.invoices,
    documents: state.documents,
    announcements: state.announcements,
    threads: state.threads,
    settings: state.settings,
    leads: state.leads,
    waitlist: state.waitlist,
    acknowledgements: state.acknowledgements,
  }
}

const savedData = readJSON<Partial<DataSlice>>(DATA_KEY)
const savedSession = readJSON<SessionUser>(SESSION_KEY)

export const useStore = create<StoreState>()((set, get) => {
  const commit = (updater: (state: StoreState) => Partial<StoreState>) => {
    set(updater)
    writeJSON(DATA_KEY, snapshot(get()))
  }

  return {
    ...initialData,
    ...(savedData ?? {}),
    user: savedSession,
    toasts: [],

    /* ------------------------------- toasts ------------------------------- */
    pushToast: (toast) => {
      const id = uid('toast')
      set((s) => ({ toasts: [...s.toasts, { tone: 'success', ...toast, id }] }))
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4600)
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    /* -------------------------------- auth -------------------------------- */
    login: (email, password) => {
      const found = get().users.find(
        (u) => u.email.toLowerCase() === String(email).trim().toLowerCase() && u.password === password,
      )
      if (!found) return { ok: false, error: 'That email and password combination does not match our records.' }
      const session: SessionUser = {
        id: found.id,
        name: found.name,
        email: found.email,
        role: found.role,
        familyId: found.familyId,
        title: found.title,
      }
      writeJSON(SESSION_KEY, session)
      set({ user: session })
      return { ok: true, user: session }
    },
    logout: () => {
      try {
        localStorage.removeItem(SESSION_KEY)
      } catch {
        /* noop */
      }
      set({ user: null })
    },

    /* ----------------------------- attendance ----------------------------- */
    checkIn: (childId) =>
      commit((s) => {
        const date = todayISO()
        const time = nowTime()
        const exists = s.attendance.find((a) => a.childId === childId && a.date === date)
        if (exists) {
          return {
            attendance: s.attendance.map((a) =>
              a.id === exists.id ? { ...a, checkIn: time, checkOut: null, status: 'present' as const } : a,
            ),
          }
        }
        return {
          attendance: [
            { id: uid('att'), childId, date, checkIn: time, checkOut: null, status: 'present' as const, note: '' },
            ...s.attendance,
          ],
        }
      }),

    checkOut: (childId) =>
      commit((s) => {
        const date = todayISO()
        const time = nowTime()
        return {
          attendance: s.attendance.map((a) =>
            a.childId === childId && a.date === date ? { ...a, checkOut: time, status: 'checked-out' as const } : a,
          ),
        }
      }),

    markAbsent: (childId, note = 'Marked absent') =>
      commit((s) => {
        const date = todayISO()
        const exists = s.attendance.find((a) => a.childId === childId && a.date === date)
        if (exists) {
          return {
            attendance: s.attendance.map((a) =>
              a.id === exists.id ? { ...a, status: 'absent' as const, checkIn: null, checkOut: null, note } : a,
            ),
          }
        }
        return {
          attendance: [
            { id: uid('att'), childId, date, checkIn: null, checkOut: null, status: 'absent' as const, note },
            ...s.attendance,
          ],
        }
      }),

    /* ------------------------------ daily logs ---------------------------- */
    addDailyLog: (log) =>
      commit((s) => ({
        dailyLogs: [
          { author: s.user?.name ?? 'Rosalind Hayes', photos: [], ...log, id: uid('dl') },
          ...s.dailyLogs,
        ],
      })),
    updateDailyLog: (id, patch) =>
      commit((s) => ({ dailyLogs: s.dailyLogs.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
    deleteDailyLog: (id) => commit((s) => ({ dailyLogs: s.dailyLogs.filter((l) => l.id !== id) })),

    /* ------------------------------- invoices ----------------------------- */
    createInvoice: (invoice) =>
      commit((s) => {
        const nextNum = 1045 + s.invoices.filter((i) => i.id.startsWith('INV-')).length
        return {
          invoices: [
            { issuedAt: todayISO(), ...invoice, id: `INV-${nextNum}`, payments: [] },
            ...s.invoices,
          ],
        }
      }),
    recordPayment: (invoiceId, payment) =>
      commit((s) => ({
        invoices: s.invoices.map((i) =>
          i.id === invoiceId
            ? { ...i, payments: [...i.payments, { date: todayISO(), ...payment, id: uid('pay') }] }
            : i,
        ),
      })),

    /* ------------------------------ documents ----------------------------- */
    addDocument: (doc) =>
      commit((s) => ({
        documents: [
          {
            category: 'Forms' as const,
            visibleToParents: false,
            uploadedBy: s.user?.name ?? 'Aunties Tykes',
            uploadedAt: todayISO(),
            url: '#',
            requiresAck: false,
            ...doc,
            id: uid('doc'),
          },
          ...s.documents,
        ],
      })),
    deleteDocument: (id) => commit((s) => ({ documents: s.documents.filter((d) => d.id !== id) })),
    toggleDocVisibility: (id) =>
      commit((s) => ({
        documents: s.documents.map((d) => (d.id === id ? { ...d, visibleToParents: !d.visibleToParents } : d)),
      })),
    acknowledgeDocument: (docId) =>
      commit((s) => {
        const key = `${s.user?.id ?? 'anon'}:${docId}`
        if (s.acknowledgements.includes(key)) return {}
        return { acknowledgements: [...s.acknowledgements, key] }
      }),

    /* --------------------------- communications --------------------------- */
    addAnnouncement: (announcement) =>
      commit((s) => ({
        announcements: [{ date: todayISO(), ...announcement, id: uid('an') }, ...s.announcements],
      })),
    sendThreadMessage: (threadId, message) =>
      commit((s) => ({
        threads: s.threads.map((t) =>
          t.id === threadId
            ? {
                ...t,
                updatedAt: todayISO(),
                messages: [...t.messages, { at: todayISO(), ...message, id: uid('msg') }],
              }
            : t,
        ),
      })),
    startThread: (thread) =>
      commit((s) => ({
        threads: [{ updatedAt: todayISO(), messages: [], ...thread, id: uid('thr') }, ...s.threads],
      })),

    /* ------------------------- families & children ------------------------ */
    addFamily: (family) => {
      const id = uid('fam')
      commit((s) => ({ families: [...s.families, { ...family, id }] }))
      return id
    },
    updateFamily: (id, patch) =>
      commit((s) => ({ families: s.families.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),

    addChild: (child) => {
      const id = uid('chd')
      commit((s) => ({
        children: [...s.children, { hue: pickHue(s.children.length), ...child, id }],
      }))
      return id
    },
    updateChild: (id, patch) =>
      commit((s) => ({ children: s.children.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),

    createParentLogin: (familyId, name, email) => {
      const clean = email.trim()
      if (!clean) return null
      if (get().users.some((u) => u.email.toLowerCase() === clean.toLowerCase())) return null
      const credentials: PortalCredentials = { email: clean, password: makeTempPassword() }
      commit((s) => ({
        users: [
          ...s.users,
          { id: uid('usr'), name, email: clean, password: credentials.password, role: 'parent' as const, familyId },
        ],
      }))
      return credentials
    },

    /* ------------------------------ enrollment ---------------------------- */
    submitEnrollment: (submission) => {
      const id = uid('enr')
      commit((s) => ({
        enrollments: [
          { ...submission, id, submittedAt: todayISO(), status: 'pending' as const },
          ...s.enrollments,
        ],
      }))
      return id
    },

    approveEnrollment: (id) => {
      const sub = get().enrollments.find((e) => e.id === id)
      if (!sub || sub.status !== 'pending') return null

      const familyId = uid('fam')
      const childIds = sub.children.map(() => uid('chd'))
      const cleanEmail = sub.email.trim()
      const emailTaken = get().users.some((u) => u.email.toLowerCase() === cleanEmail.toLowerCase())
      const credentials: PortalCredentials | null = emailTaken
        ? null
        : { email: cleanEmail, password: makeTempPassword() }

      commit((s) => {
        const family: Family = {
          id: familyId,
          name: sub.familyName,
          primaryContact: sub.primaryContact,
          relation: sub.relation,
          email: cleanEmail,
          phone: sub.phone,
          address: sub.address,
          secondary: sub.secondary,
          emergency: sub.emergency,
          joinedAt: todayISO(),
          notes: sub.notes,
        }
        const kids: Child[] = sub.children.map((c, i) => ({
          id: childIds[i] ?? uid('chd'),
          familyId,
          name: c.name,
          dob: c.dob,
          ageGroup: c.ageGroup,
          status: 'active' as const,
          plan: c.plan,
          startDate: c.startDate,
          teacher: 'Auntie Roz',
          allergies: splitList(c.allergies),
          medications: splitList(c.medications),
          notes: c.notes,
          hue: pickHue(s.children.length + i),
        }))
        return {
          families: [...s.families, family],
          children: [...s.children, ...kids],
          users: credentials
            ? [
                ...s.users,
                {
                  id: uid('usr'),
                  name: sub.primaryContact,
                  email: credentials.email,
                  password: credentials.password,
                  role: 'parent' as const,
                  familyId,
                },
              ]
            : s.users,
          enrollments: s.enrollments.map((e) =>
            e.id === id
              ? { ...e, status: 'approved' as const, reviewedAt: todayISO(), createdFamilyId: familyId }
              : e,
          ),
        }
      })

      return {
        familyId,
        childIds,
        credentials,
        loginError: emailTaken ? 'An account already uses that email, so no new login was created.' : undefined,
      }
    },

    declineEnrollment: (id) =>
      commit((s) => ({
        enrollments: s.enrollments.map((e) =>
          e.id === id ? { ...e, status: 'declined' as const, reviewedAt: todayISO() } : e,
        ),
      })),

    /* -------------------------------- leads ------------------------------- */
    addLead: (lead) =>
      commit((s) => ({
        leads: [
          { createdAt: todayISO(), status: 'New inquiry', tourDate: '', ...lead, id: uid('ld') },
          ...s.leads,
        ],
      })),
    updateLead: (id, patch) => commit((s) => ({ leads: s.leads.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),

    /* ------------------------------ waitlist ------------------------------ */
    setWaitlist: (list) => commit(() => ({ waitlist: list })),

    /* ------------------------------ settings ------------------------------ */
    updateSettings: (patch) => commit((s) => ({ settings: { ...s.settings, ...patch } })),
    updateRates: (patch) => commit((s) => ({ settings: { ...s.settings, rates: { ...s.settings.rates, ...patch } } })),
    updatePolicies: (patch) =>
      commit((s) => ({ settings: { ...s.settings, policies: { ...s.settings.policies, ...patch } } })),

    resetDemoData: () => {
      commit(() => ({ ...initialData }))
    },
  }
})

/* ----------------------------- selector helpers ---------------------------- */

export const selectChildrenForFamily = (state: StoreState, familyId: string): Child[] =>
  state.children.filter((c) => c.familyId === familyId)

export const selectChild = (state: StoreState, id: string): Child | undefined =>
  state.children.find((c) => c.id === id)

export const selectFamily = (state: StoreState, id: string): Family | undefined =>
  state.families.find((f) => f.id === id)

export const selectInvoicesForFamily = (state: StoreState, familyId: string): Invoice[] =>
  state.invoices.filter((i) => i.familyId === familyId)

export const selectLogsForChild = (state: StoreState, childId: string): DailyLog[] =>
  state.dailyLogs.filter((l) => l.childId === childId)

export const selectAttendanceForChild = (state: StoreState, childId: string): AttendanceRecord[] =>
  state.attendance.filter((a) => a.childId === childId)

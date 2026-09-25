import { create } from 'zustand'
import { uid, nowISO, nowTime, todayISO } from '../lib/helpers'
import {
  createParentLogin as createParentLoginRequest,
  hydrateAll,
  hydrateSettings,
  persist,
  restoreSession,
  signIn,
  signOut,
} from '../lib/persist'
import type { SectionName } from '../lib/database.types'
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
  CalendarEvent,
  Child,
  DailyLog,
  DocumentRecord,
  Family,
  Invoice,
  Language,
  Lead,
  NewAnnouncement,
  NewCalendarEvent,
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
  'from-[#3F8570] to-[#7DA0F0]',
  'from-[#D98B9B] to-[#8FE0C9]',
  'from-[#F5B942] to-[#F9D28A]',
  'from-[#E86A6A] to-[#F49C9C]',
  'from-[#8B6ED9] to-[#B49CEE]',
  'from-[#4FB0C6] to-[#8FD7E4]',
] as const

function pickHue(index: number): string {
  return CHILD_HUES[index % CHILD_HUES.length] ?? CHILD_HUES[0]
}

/** "peanuts, eggs" -> ["peanuts", "eggs"] */
function splitList(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}


/** The persisted slice of the store — everything that survives a reload. */
interface DataSlice {
  /** Profiles loaded from the database. Supabase Auth owns the credentials. */
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
  /** Owner-authored calendar entries. Birthdays and due dates are derived. */
  calendarEvents: CalendarEvent[]
  /** `${userId}:${documentId}` pairs for documents a parent has acknowledged. */
  acknowledgements: string[]
  /**
   * When the signed-in person last opened each section. Anything stamped later
   * than this is new to them. Only ever holds the current user's markers —
   * RLS returns nobody else's.
   */
  sectionViews: Partial<Record<SectionName, string>>
}

export type LoginResult = { ok: true; user: SessionUser } | { ok: false; error: string }

export interface StoreState extends DataSlice {
  user: SessionUser | null
  toasts: Toast[]
  /**
   * False until bootstrap settles. Route guards must wait on this, or a
   * refresh would bounce a signed-in user to /login before their Supabase
   * session has been restored.
   */
  ready: boolean

  pushToast: (toast: NewToast) => void
  dismissToast: (id: string) => void

  /** Async in live mode — Supabase Auth is a round trip. */
  login: (email: string, password: string) => Promise<LoginResult>
  logout: () => void

  /**
   * Loads public settings, restores any Supabase session, and hydrates the
   * cache for a signed-in user. Call once on app start.
   */
  bootstrap: () => Promise<void>

  checkIn: (childId: string) => void
  checkOut: (childId: string) => void
  markAbsent: (childId: string, note?: string) => void

  addDailyLog: (log: NewDailyLog) => void
  updateDailyLog: (id: string, patch: Partial<DailyLog>) => void
  deleteDailyLog: (id: string) => void

  createInvoice: (invoice: NewInvoice) => void
  recordPayment: (invoiceId: string, payment: NewPayment) => void
  deleteInvoice: (id: string) => void

  addDocument: (doc: NewDocument) => void
  deleteDocument: (id: string) => void
  toggleDocVisibility: (id: string) => void
  acknowledgeDocument: (docId: string) => void
  /**
   * Records that the signed-in person has now looked at a section, so its
   * "new" markers clear. Silent: no toast, and a failure must not interrupt
   * reading the page.
   */
  markSectionSeen: (section: SectionName) => void

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
  /**
   * Creates a parent portal account. The owner always chooses the password:
   * it is shown once and cannot be recovered, so a generated one that nobody
   * wrote down just means another phone call. Returns null when the email is
   * already in use.
   */
  createParentLogin: (
    familyId: string,
    name: string,
    email: string,
    password: string,
    preferredLanguage?: Language,
  ) => Promise<PortalCredentials | null>

  addLead: (lead: NewLead) => void
  updateLead: (id: string, patch: Partial<Lead>) => void

  setWaitlist: (list: WaitlistProspect[]) => void

  addCalendarEvent: (event: NewCalendarEvent) => string
  updateCalendarEvent: (id: string, patch: Partial<CalendarEvent>) => void
  deleteCalendarEvent: (id: string) => void

  updateSettings: (patch: Partial<Settings>) => void
  updateRates: (patch: Partial<Rates>) => void
  updatePolicies: (patch: Partial<Policies>) => void

}

/** Live mode starts empty and fills from Supabase; nothing is seeded. */
const EMPTY_SETTINGS: Settings = {
  businessName: '',
  tagline: '',
  director: '',
  address: '',
  phone: '',
  email: '',
  hours: '',
  capacity: 0,
  ratios: '',
  rates: { fullTime: 0, partTime: 0, dropIn: 0, registrationFee: 0, lateFeePerMinute: 0, siblingDiscountPct: 0 },
  policies: { sick: '', latePickup: '', holidays: '', potty: '' },
}

const emptyData: DataSlice = {
  users: [],
  enrollments: [],
  families: [],
  children: [],
  attendance: [],
  dailyLogs: [],
  invoices: [],
  documents: [],
  announcements: [],
  threads: [],
  settings: EMPTY_SETTINGS,
  leads: [],
  waitlist: [],
  calendarEvents: [],
  acknowledgements: [],
  sectionViews: {},
}

export const useStore = create<StoreState>()((set, get) => {
  /**
   * Applies a change to the cache, then persists it.
   *
   * `sync` receives the post-update state so it can pick out the row that
   * changed and push only that. It is REQUIRED, not optional: an action that
   * updated the cache without writing through would look like it worked and
   * then vanish on the next reload, so the compiler refuses that shape
   * outright rather than leaving it to be caught in review.
   *
   * A failed write surfaces as a toast while the local change stays applied —
   * that is the trade-off of a write-through cache, and the reason every sync
   * failure is made visible.
   */
  const commit = (
    updater: (state: StoreState) => Partial<StoreState>,
    sync: (state: StoreState) => Promise<unknown>,
  ) => {
    set(updater)
    const state = get()
    void sync(state).catch((error: unknown) => {
      get().pushToast({
        tone: 'error',
        title: 'That change did not save',
        description:
          error instanceof Error ? error.message : 'Check your connection and try again.',
      })
    })
  }

  /** Replace the cached slice with a fresh read from the database. */
  const applyHydration = async (): Promise<void> => {
    const data = await hydrateAll()
    set({
      users: data.users,
      families: data.families,
      children: data.children,
      attendance: data.attendance,
      dailyLogs: data.dailyLogs,
      invoices: data.invoices,
      documents: data.documents,
      announcements: data.announcements,
      threads: data.threads,
      enrollments: data.enrollments,
      leads: data.leads,
      waitlist: data.waitlist,
      calendarEvents: data.calendarEvents,
      acknowledgements: data.acknowledgements,
      sectionViews: data.sectionViews,
      ...(data.settings ? { settings: data.settings } : {}),
    })
  }

  /* ---- sync helpers: pick the row that changed out of the updated state ---- */

  const authorId = (state: StoreState): string | null => state.user?.id ?? null

  const syncAttendance = (state: StoreState, childId: string): Promise<unknown> => {
    const record = state.attendance.find((a) => a.childId === childId && a.date === todayISO())
    return record ? persist.attendance(record) : Promise.resolve()
  }

  return {
    ...emptyData,
    user: null,
    toasts: [],
    ready: false,

    /* ------------------------------- toasts ------------------------------- */
    pushToast: (toast) => {
      const id = uid('toast')
      set((s) => ({ toasts: [...s.toasts, { tone: 'success', ...toast, id }] }))
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4600)
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    /* -------------------------------- auth -------------------------------- */
    login: async (email, password) => {
      try {
        const session = await signIn(email, password)
        set({ user: session })
        await applyHydration()
        return { ok: true, user: session }
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'That email and password combination does not match our records.',
        }
      }
    },
    logout: () => {
      // Clear the cache as well as the session. On a shared device the next
      // person to sign in must not inherit the previous family's data.
      set({ user: null, ...emptyData })
      void signOut().catch(() => {
        /* the local session is dropped either way */
      })
    },

    bootstrap: async () => {
      try {
        const settings = await hydrateSettings()
        if (settings) set({ settings })
        const session = await restoreSession()
        if (session) {
          set({ user: session })
          await applyHydration()
        }
      } catch (error) {
        get().pushToast({
          tone: 'error',
          title: 'Could not load your data',
          description:
            error instanceof Error ? error.message : 'Check your connection and reload the page.',
        })
      } finally {
        set({ ready: true })
      }
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
      },
      (s) => syncAttendance(s, childId),
      ),

    checkOut: (childId) =>
      commit((s) => {
        const date = todayISO()
        const time = nowTime()
        return {
          attendance: s.attendance.map((a) =>
            a.childId === childId && a.date === date ? { ...a, checkOut: time, status: 'checked-out' as const } : a,
          ),
        }
      },
      (s) => syncAttendance(s, childId),
      ),

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
      },
      (s) => syncAttendance(s, childId),
      ),

    /* ------------------------------ daily logs ---------------------------- */
    addDailyLog: (log) =>
      commit(
        (s) => ({
          dailyLogs: [
            { author: s.user?.name ?? s.settings.businessName, photos: [], ...log, id: uid('dl') },
            ...s.dailyLogs,
          ],
        }),
        (s) => {
          const created = s.dailyLogs[0]
          return created ? persist.dailyLog(created, authorId(s)) : Promise.resolve()
        },
      ),
    updateDailyLog: (id, patch) =>
      commit(
        (s) => ({ dailyLogs: s.dailyLogs.map((l) => (l.id === id ? { ...l, ...patch } : l)) }),
        (s) => {
          const log = s.dailyLogs.find((l) => l.id === id)
          return log ? persist.dailyLog(log, authorId(s)) : Promise.resolve()
        },
      ),
    deleteDailyLog: (id) =>
      commit(
        (s) => ({ dailyLogs: s.dailyLogs.filter((l) => l.id !== id) }),
        () => persist.deleteDailyLog(id),
      ),

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
      },
      (s) => {
        const created = s.invoices[0]
        return created ? persist.invoice(created) : Promise.resolve()
      },
      ),
    recordPayment: (invoiceId, payment) =>
      commit(
        (s) => ({
          invoices: s.invoices.map((i) =>
            i.id === invoiceId
              ? { ...i, payments: [...i.payments, { date: todayISO(), ...payment, id: uid('pay') }] }
              : i,
          ),
        }),
        (s) => {
          const invoice = s.invoices.find((i) => i.id === invoiceId)
          const recorded = invoice?.payments[invoice.payments.length - 1]
          return recorded ? persist.payment(recorded, invoiceId) : Promise.resolve()
        },
      ),
    deleteInvoice: (id) =>
      commit(
        (s) => ({ invoices: s.invoices.filter((i) => i.id !== id) }),
        () => persist.deleteInvoice(id),
      ),

    /* ------------------------------ documents ----------------------------- */
    addDocument: (doc) =>
      commit(
        (s) => ({
        documents: [
          {
            category: 'Forms' as const,
            visibleToParents: false,
            uploadedBy: s.user?.name ?? 'Aunties Tykes',
            uploadedAt: nowISO(),
            url: '#',
            requiresAck: false,
            ...doc,
            id: uid('doc'),
          },
          ...s.documents,
        ],
      }),
      (s) => {
        const created = s.documents[0]
        return created ? persist.document(created, authorId(s)) : Promise.resolve()
      },
      ),
    deleteDocument: (id) =>
      commit(
        (s) => ({ documents: s.documents.filter((d) => d.id !== id) }),
        () => persist.deleteDocument(id),
      ),
    toggleDocVisibility: (id) =>
      commit(
        (s) => ({
          documents: s.documents.map((d) => (d.id === id ? { ...d, visibleToParents: !d.visibleToParents } : d)),
        }),
        (s) => {
          const doc = s.documents.find((d) => d.id === id)
          return doc ? persist.document(doc, authorId(s)) : Promise.resolve()
        },
      ),
    acknowledgeDocument: (docId) =>
      commit(
        (s) => {
          const key = `${s.user?.id ?? 'anon'}:${docId}`
          if (s.acknowledgements.includes(key)) return {}
          return { acknowledgements: [...s.acknowledgements, key] }
        },
        (s) => {
          const id = s.user?.id
          return id ? persist.acknowledgement(docId, id) : Promise.resolve()
        },
      ),

    /* --------------------------- communications --------------------------- */
    markSectionSeen: (section) => {
      const profileId = authorId(get())
      if (!profileId) return
      const seenAt = nowISO()
      set((state) => ({ sectionViews: { ...state.sectionViews, [section]: seenAt } }))
      // Not routed through commit(): this is a side effect of reading a page,
      // not an edit the person made, so a failed write gets no error toast.
      void persist.sectionView(section, profileId, seenAt).catch(() => {
        /* the marker simply stays where it was; the page still works */
      })
    },

    addAnnouncement: (announcement) =>
      commit(
        (s) => ({
          announcements: [{ date: nowISO(), ...announcement, id: uid('an') }, ...s.announcements],
        }),
        (s) => {
          const created = s.announcements[0]
          return created ? persist.announcement(created) : Promise.resolve()
        },
      ),
    sendThreadMessage: (threadId, message) =>
      commit(
        (s) => ({
          threads: s.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  updatedAt: nowISO(),
                  messages: [...t.messages, { at: nowISO(), ...message, id: uid('msg') }],
                }
              : t,
          ),
        }),
        async (s) => {
          const thread = s.threads.find((t) => t.id === threadId)
          const sent = thread?.messages[thread.messages.length - 1]
          if (!thread || !sent) return
          // Thread first: its updatedAt drives the inbox ordering.
          await persist.thread(thread)
          await persist.threadMessage(sent, threadId, authorId(s))
        },
      ),
    startThread: (thread) =>
      commit(
        (s) => ({
          threads: [{ updatedAt: nowISO(), messages: [], ...thread, id: uid('thr') }, ...s.threads],
        }),
        async (s) => {
          const created = s.threads[0]
          if (!created) return
          // The thread row first: the message rows reference it. Persisting
          // only the thread — as this did — left the opening message in the
          // cache alone, so it vanished on reload and the owner never saw it.
          await persist.thread(created)
          for (const message of created.messages) {
            await persist.threadMessage(message, created.id, authorId(s))
          }
        },
      ),

    /* ------------------------- families & children ------------------------ */
    addFamily: (family) => {
      const id = uid('fam')
      commit(
        (s) => ({ families: [...s.families, { ...family, id }] }),
        (s) => {
          const created = s.families.find((f) => f.id === id)
          return created ? persist.family(created) : Promise.resolve()
        },
      )
      return id
    },
    updateFamily: (id, patch) =>
      commit(
        (s) => ({ families: s.families.map((f) => (f.id === id ? { ...f, ...patch } : f)) }),
        (s) => {
          const family = s.families.find((f) => f.id === id)
          return family ? persist.family(family) : Promise.resolve()
        },
      ),

    addChild: (child) => {
      const id = uid('chd')
      commit(
        (s) => ({
          children: [...s.children, { hue: pickHue(s.children.length), ...child, id }],
        }),
        (s) => {
          const created = s.children.find((c) => c.id === id)
          return created ? persist.child(created) : Promise.resolve()
        },
      )
      return id
    },
    updateChild: (id, patch) =>
      commit(
        (s) => ({ children: s.children.map((c) => (c.id === id ? { ...c, ...patch } : c)) }),
        (s) => {
          const child = s.children.find((c) => c.id === id)
          return child ? persist.child(child) : Promise.resolve()
        },
      ),

    createParentLogin: async (familyId, name, email, password, preferredLanguage) => {
      const clean = email.trim()
      if (!clean) return null
      if (get().users.some((u) => u.email.toLowerCase() === clean.toLowerCase())) return null
      const credentials: PortalCredentials = { email: clean, password: password.trim() }

      // Rejects with the server's message; the caller surfaces it. The account
      // is created server-side with the service-role key and the credential
      // belongs to Supabase Auth — nothing password-shaped is kept in the store.
      await createParentLoginRequest({
        familyId,
        name,
        email: clean,
        password: credentials.password,
        preferredLanguage: preferredLanguage ?? 'en',
      })
      await applyHydration()
      return credentials
    },

    /* ------------------------------ enrollment ---------------------------- */
    submitEnrollment: (submission) => {
      const id = uid('enr')
      commit(
        (s) => ({
          enrollments: [
            { ...submission, id, submittedAt: todayISO(), status: 'pending' as const },
            ...s.enrollments,
          ],
        }),
        (s) => {
          const created = s.enrollments.find((e) => e.id === id)
          return created ? persist.enrollment(created) : Promise.resolve()
        },
      )
      return id
    },

    approveEnrollment: (id) => {
      const sub = get().enrollments.find((e) => e.id === id)
      if (!sub || sub.status !== 'pending') return null

      const familyId = uid('fam')
      const childIds = sub.children.map(() => uid('chd'))
      const cleanEmail = sub.email.trim()

      commit(
        (s) => {
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
          teacher: 'Auntie Melissa',
          allergies: splitList(c.allergies),
          medications: splitList(c.medications),
          notes: c.notes,
          hue: pickHue(s.children.length + i),
        }))
        return {
          families: [...s.families, family],
          children: [...s.children, ...kids],
          enrollments: s.enrollments.map((e) =>
            e.id === id
              ? { ...e, status: 'approved' as const, reviewedAt: todayISO(), createdFamilyId: familyId }
              : e,
          ),
        }
      },
      async (s) => {
        const family = s.families.find((f) => f.id === familyId)
        if (family) await persist.family(family)
        for (const childId of childIds) {
          const child = s.children.find((c) => c.id === childId)
          if (child) await persist.child(child)
        }
        await persist.enrollmentStatus(id, 'approved', familyId)
      },
      )

      return { familyId, childIds }
    },

    declineEnrollment: (id) =>
      commit(
        (s) => ({
          enrollments: s.enrollments.map((e) =>
            e.id === id ? { ...e, status: 'declined' as const, reviewedAt: todayISO() } : e,
          ),
        }),
        () => persist.enrollmentStatus(id, 'declined'),
      ),

    /* -------------------------------- leads ------------------------------- */
    addLead: (lead) =>
      commit(
        (s) => ({
          leads: [
            { createdAt: todayISO(), status: 'New inquiry', tourDate: '', ...lead, id: uid('ld') },
            ...s.leads,
          ],
        }),
        (s) => {
          const created = s.leads[0]
          return created ? persist.lead(created) : Promise.resolve()
        },
      ),
    updateLead: (id, patch) =>
      commit(
        (s) => ({ leads: s.leads.map((l) => (l.id === id ? { ...l, ...patch } : l)) }),
        (s) => {
          const lead = s.leads.find((l) => l.id === id)
          return lead ? persist.lead(lead) : Promise.resolve()
        },
      ),

    /* ------------------------------ waitlist ------------------------------ */
    setWaitlist: (list) =>
      commit(
        () => ({ waitlist: list }),
        () => persist.waitlist(list),
      ),

    /* --------------------------- family calendar -------------------------- */
    addCalendarEvent: (event) => {
      const id = uid('cal')
      commit(
        (s) => ({
          calendarEvents: [...s.calendarEvents, { createdAt: todayISO(), ...event, id }],
        }),
        (s) => {
          const created = s.calendarEvents.find((e) => e.id === id)
          return created ? persist.calendarEvent(created, authorId(s)) : Promise.resolve()
        },
      )
      return id
    },
    updateCalendarEvent: (id, patch) =>
      commit(
        (s) => ({
          calendarEvents: s.calendarEvents.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        }),
        (s) => {
          const event = s.calendarEvents.find((e) => e.id === id)
          return event ? persist.calendarEvent(event, authorId(s)) : Promise.resolve()
        },
      ),
    deleteCalendarEvent: (id) =>
      commit(
        (s) => ({ calendarEvents: s.calendarEvents.filter((e) => e.id !== id) }),
        () => persist.deleteCalendarEvent(id),
      ),

    /* ------------------------------ settings ------------------------------ */
    updateSettings: (patch) =>
      commit(
        (s) => ({ settings: { ...s.settings, ...patch } }),
        (s) => persist.settings(s.settings),
      ),
    updateRates: (patch) =>
      commit(
        (s) => ({ settings: { ...s.settings, rates: { ...s.settings.rates, ...patch } } }),
        (s) => persist.settings(s.settings),
      ),
    updatePolicies: (patch) =>
      commit(
        (s) => ({ settings: { ...s.settings, policies: { ...s.settings.policies, ...patch } } }),
        (s) => persist.settings(s.settings),
      ),
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

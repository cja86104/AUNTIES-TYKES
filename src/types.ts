/**
 * Shared domain types for the Aunties Tykes app.
 *
 * Every record shape the app reads from Supabase or writes
 * through `src/store/useStore.ts` is declared here so the two stay honest
 * about each other.
 */

/* --------------------------------- auth ---------------------------------- */

export type Role = 'admin' | 'parent'

/**
 * Languages the parent portal can render in. Admin stays English-only by
 * design (see CLAUDE.md) — this only ever affects `src/pages/parent/**`.
 */
export const SUPPORTED_LANGUAGES = ['en', 'vi', 'es'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

export interface User {
  id: string
  name: string
  email: string
  role: Role
  familyId?: string
  title?: string
  /**
   * UI language for the parent portal, set by the owner when the account is
   * created. Optional rather than defaulted: a profile row written before this
   * column existed won't have it, and every read site falls back to 'en'.
   */
  preferredLanguage?: Language
}

/** The subset of a profile the app keeps as the active session. */
export type SessionUser = Omit<User, 'password'>

/* -------------------------------- families -------------------------------- */

export interface Contact {
  name: string
  relation: string
  phone: string
}

export interface Family {
  id: string
  name: string
  primaryContact: string
  relation: string
  email: string
  phone: string
  address: string
  secondary: Contact
  emergency: Contact[]
  joinedAt: string
  notes: string
  /**
   * Weekly tuition rate agreed with this family, if it differs from the
   * standard rate card in Settings. When set, invoice prefill bills every
   * enrolled child in this family at this rate instead of the published
   * full-time/part-time price. Undefined/absent means "use the standard
   * rate card."
   */
  customWeeklyRate?: number
}

/* -------------------------------- children -------------------------------- */

export type AgeGroup = 'Infant' | 'Toddler' | 'Preschool'
export type ChildStatus = 'active' | 'waitlist'

export interface Child {
  id: string
  familyId: string
  name: string
  /** ISO date, yyyy-MM-dd */
  dob: string
  ageGroup: AgeGroup
  status: ChildStatus
  plan: string
  startDate: string
  teacher: string
  allergies: string[]
  medications: string[]
  notes: string
  /** Tailwind gradient stops used by the Avatar component. */
  hue: string
}

export interface WaitlistProspect {
  id: string
  childName: string
  ageGroup: AgeGroup
  requested: string
  family: string
  note: string
}

/* ------------------------------- attendance ------------------------------- */

export type AttendanceStatus = 'present' | 'absent' | 'expected' | 'checked-out'

export interface AttendanceRecord {
  id: string
  childId: string
  /** ISO date, yyyy-MM-dd */
  date: string
  /** 24h HH:mm, or null when not yet recorded. */
  checkIn: string | null
  checkOut: string | null
  status: AttendanceStatus
  note: string
}

/* ------------------------------- daily logs ------------------------------- */

export interface LogPhoto {
  slot: number
  url: string
  caption: string
}

export interface DailyLog {
  id: string
  childId: string
  date: string
  meals: string
  naps: string
  potty: string
  mood: string
  activities: string[]
  notes: string
  photos: LogPhoto[]
  author: string
}

/** Fields the daily-log composer supplies; the store fills in the rest. */
export type NewDailyLog = Omit<DailyLog, 'id' | 'author' | 'photos'> &
  Partial<Pick<DailyLog, 'photos' | 'author'>>

/* -------------------------------- invoices -------------------------------- */

export type InvoiceStatus = 'paid' | 'unpaid' | 'overdue'

export interface LineItem {
  label: string
  qty: number
  unit: number
  amount: number
}

export interface Payment {
  id: string
  date: string
  amount: number
  method: string
  ref: string
}

export interface Invoice {
  id: string
  familyId: string
  period: string
  issuedAt: string
  dueDate: string
  amount: number
  lineItems: LineItem[]
  payments: Payment[]
  memo: string
}

/** Fields the invoice composer supplies; the store assigns id/issuedAt/payments. */
export type NewInvoice = Omit<Invoice, 'id' | 'issuedAt' | 'payments'> &
  Partial<Pick<Invoice, 'issuedAt'>>

export type NewPayment = Omit<Payment, 'id' | 'date'> & Partial<Pick<Payment, 'date'>>

/* -------------------------------- documents ------------------------------- */

export type DocumentCategory = 'Handbooks' | 'Policies' | 'Forms' | 'Menus' | 'Calendars'

export interface DocumentRecord {
  id: string
  title: string
  category: DocumentCategory
  size?: number
  fileName?: string
  /** Object key in the private `documents` bucket. Absent = no file behind it. */
  storagePath?: string
  visibleToParents: boolean
  uploadedBy: string
  uploadedAt: string
  url: string
  requiresAck: boolean
}

/** Metadata handed back by FileUploader once a file is stored. */
export interface UploadedFileMeta {
  title: string
  fileName: string
  size: number
  /** Where the file actually landed. */
  storagePath: string
}

/** Fields a caller supplies to the store; the rest are defaulted. */
export type NewDocument = Partial<DocumentRecord> & Pick<DocumentRecord, 'title'>

/* ----------------------------- communications ----------------------------- */

/** Either the literal 'all' or a family id. */
export type Audience = string

export interface Announcement {
  id: string
  title: string
  audience: Audience
  date: string
  body: string
  /** Optional file attached at posting time. */
  attachmentFileName?: string
  attachmentSize?: number
  /** Object key in the private `documents` bucket. Absent = no file behind it. */
  attachmentStoragePath?: string
}

export type NewAnnouncement = Omit<Announcement, 'id' | 'date'> & Partial<Pick<Announcement, 'date'>>

export interface ThreadMessage {
  id: string
  from: Role
  authorName: string
  at: string
  body: string
}

export type NewThreadMessage = Omit<ThreadMessage, 'id' | 'at'> & Partial<Pick<ThreadMessage, 'at'>>

export interface Thread {
  id: string
  familyId: string
  subject: string
  updatedAt: string
  messages: ThreadMessage[]
}

export type NewThread = Omit<Thread, 'id' | 'updatedAt' | 'messages'> &
  Partial<Pick<Thread, 'updatedAt' | 'messages'>>

/* ------------------------------ enrollment -------------------------------- */

/** A family record before it exists — everything except the assigned id. */
export type NewFamily = Omit<Family, 'id'>

/** A child record before it exists. `hue` is assigned automatically if omitted. */
export type NewChild = Omit<Child, 'id' | 'hue'> & Partial<Pick<Child, 'hue'>>

export type EnrollmentStatus = 'pending' | 'approved' | 'declined'

/** One child as typed into the public enrollment form, before conversion. */
export interface EnrollmentChildDraft {
  id: string
  name: string
  dob: string
  ageGroup: AgeGroup
  plan: string
  startDate: string
  /** Free text as the parent typed it; split into a list on approval. */
  allergies: string
  medications: string
  notes: string
}

/**
 * A completed public enrollment form awaiting the owner's review. Approving one
 * creates the family, its children, and a parent portal login in a single step.
 */
export interface EnrollmentSubmission {
  id: string
  submittedAt: string
  status: EnrollmentStatus
  familyName: string
  primaryContact: string
  relation: string
  email: string
  phone: string
  address: string
  secondary: Contact
  emergency: Contact[]
  children: EnrollmentChildDraft[]
  notes: string
  acknowledgedHandbook: boolean
  /** Set once reviewed. */
  reviewedAt?: string
  createdFamilyId?: string
}

export type NewEnrollmentSubmission = Omit<EnrollmentSubmission, 'id' | 'submittedAt' | 'status'>

/** What the owner hands to a family after approving their enrollment. */
export interface PortalCredentials {
  email: string
  password: string
}

/**
 * Approving an enrollment creates the family and its children only. Portal
 * accounts are made separately, one per guardian, so the owner always chooses
 * the password and can repeat it to anyone who forgets it.
 */
export interface ApprovalResult {
  familyId: string
  childIds: string[]
}

/* ----------------------------- family calendar ---------------------------- */

export type CalendarEventKind =
  /** Closed all day — a holiday or a vacation day. */
  | 'closure'
  /** Open, but care ends early. */
  | 'early_close'
  /** Picture day, pajama day, a theme day. */
  | 'activity'
  /** A dated note: "bring a change of clothes". */
  | 'reminder'
  /** One child only: "Johnny is not coming Tuesday". */
  | 'schedule_exception'

/**
 * An event the owner authored. Birthdays and invoice due dates are NOT stored
 * here — they are derived from `Child.dob` and `Invoice.dueDate` when the
 * calendar is assembled, so they never need re-entering or fall out of sync.
 */
export interface CalendarEvent {
  id: string
  kind: CalendarEventKind
  title: string
  note: string
  /** ISO date, yyyy-MM-dd */
  startsOn: string
  /** Undefined for a single day; set for a vacation week and the like. */
  endsOn?: string
  /** 24h HH:mm. Only meaningful on `early_close`. */
  closesAt?: string
  /** Only set on `schedule_exception`; undefined means daycare-wide. */
  childId?: string
  visibleToParents: boolean
  createdAt: string
}

export type NewCalendarEvent = Omit<CalendarEvent, 'id' | 'createdAt'> &
  Partial<Pick<CalendarEvent, 'createdAt'>>

/* --------------------------------- leads ---------------------------------- */

export interface Lead {
  id: string
  parentName: string
  email: string
  phone: string
  childAges: string
  message: string
  createdAt: string
  tourDate: string
  status: string
}

export type NewLead = Omit<Lead, 'id' | 'createdAt' | 'status' | 'tourDate'> &
  Partial<Pick<Lead, 'createdAt' | 'status' | 'tourDate'>>

/* -------------------------------- settings -------------------------------- */

export interface Rates {
  fullTime: number
  partTime: number
  dropIn: number
  registrationFee: number
  lateFeePerMinute: number
  siblingDiscountPct: number
}

export interface Policies {
  sick: string
  latePickup: string
  holidays: string
  potty: string
}

export interface Settings {
  businessName: string
  tagline: string
  director: string
  address: string
  phone: string
  email: string
  hours: string
  capacity: number
  ratios: string
  rates: Rates
  policies: Policies
}

/* ---------------------------- marketing content --------------------------- */

export interface Program {
  id: string
  name: string
  ages: string
  hours: string
  ratio: string
  spots: string
  slot: number
  image: string
  summary: string
  routine: string[]
  highlights: string[]
}

export interface TeamMember {
  id: string
  name: string
  role: string
  slot: number
  image: string
  bio: string
  creds: string[]
}

export type GalleryCategory = 'Classroom' | 'Outdoor' | 'Activities'

export interface GalleryItem {
  id: string
  slot: number
  category: GalleryCategory
  title: string
  src: string
}

export interface Testimonial {
  id: string
  quote: string
  name: string
  detail: string
}

export interface Faq {
  q: string
  a: string
}

export interface RevenuePoint {
  month: string
  collected: number
  billed: number
}

/* --------------------------------- toasts --------------------------------- */

export type ToastTone = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  tone: ToastTone
  title: string
  description?: string
}

export type NewToast = Omit<Toast, 'id' | 'tone'> & Partial<Pick<Toast, 'tone'>>

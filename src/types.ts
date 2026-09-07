/**
 * Shared domain types for the Aunties Tykes demo build.
 *
 * Every record shape the app reads from `src/data/mockData.ts` or writes
 * through `src/store/useStore.ts` is declared here so the two stay honest
 * about each other.
 */

/* --------------------------------- auth ---------------------------------- */

export type Role = 'admin' | 'parent'

export interface User {
  id: string
  name: string
  email: string
  /** Demo build only — there is no auth backend yet. */
  password: string
  role: Role
  familyId?: string
  title?: string
}

/** The subset of a user persisted to localStorage as the active session. */
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
  visibleToParents: boolean
  uploadedBy: string
  uploadedAt: string
  url: string
  requiresAck: boolean
}

/** Metadata handed back by the demo FileUploader once a file "finishes". */
export interface UploadedFileMeta {
  title: string
  fileName: string
  size: number
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

export interface ApprovalResult {
  familyId: string
  childIds: string[]
  credentials: PortalCredentials | null
  /** Set when a login could not be made because the email is already in use. */
  loginError?: string
}

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
  licenseNumber: string
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

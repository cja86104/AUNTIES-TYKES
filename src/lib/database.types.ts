/**
 * Row shapes for the tables created by supabase/migrations/0001_init.sql.
 *
 * Hand-maintained rather than generated: `supabase gen types` needs network
 * access to the project. If you change the migration, change this file in the
 * same commit — `tsc` is what keeps the two honest about each other.
 *
 * Columns are snake_case here because that is what Postgres returns. The
 * camelCase domain types in src/types.ts stay unchanged; src/lib/db.ts maps
 * between the two.
 */
import type { Contact, EnrollmentChildDraft, LineItem, LogPhoto } from '../types'

export type UserRoleDb = 'admin' | 'parent'
export type LanguageDb = 'en' | 'vi' | 'es'
export type AgeGroupDb = 'Infant' | 'Toddler' | 'Preschool'
export type ChildStatusDb = 'active' | 'waitlist'
export type AttendanceStatusDb = 'present' | 'absent' | 'expected' | 'checked-out'
export type DocumentCategoryDb = 'Handbooks' | 'Policies' | 'Forms' | 'Menus' | 'Calendars'
export type EnrollmentStatusDb = 'pending' | 'approved' | 'declined'
export type CalendarEventKindDb =
  | 'closure'
  | 'early_close'
  | 'activity'
  | 'reminder'
  | 'schedule_exception'

/** Columns in `Required` must be supplied on insert; the rest have defaults. */
type Insertable<Row, Required extends keyof Row> = Pick<Row, Required> & Partial<Omit<Row, Required>>

export type FamilyRow = {
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
  created_at: string
}

export type ProfileRow = {
  id: string
  name: string
  email: string
  role: UserRoleDb
  family_id: string | null
  title: string | null
  preferred_language: LanguageDb
  created_at: string
}

export type ChildRow = {
  id: string
  family_id: string
  name: string
  dob: string
  age_group: AgeGroupDb
  status: ChildStatusDb
  plan: string
  start_date: string | null
  teacher: string
  allergies: string[]
  medications: string[]
  notes: string
  hue: string
  created_at: string
}

export type AttendanceRow = {
  id: string
  child_id: string
  date: string
  check_in: string | null
  check_out: string | null
  status: AttendanceStatusDb
  note: string
  created_at: string
}

export type DailyLogRow = {
  id: string
  child_id: string
  date: string
  meals: string
  naps: string
  potty: string
  mood: string
  activities: string[]
  notes: string
  photos: LogPhoto[]
  author: string
  author_id: string | null
  created_at: string
}

export type InvoiceRow = {
  id: string
  family_id: string
  period: string
  issued_at: string
  due_date: string
  amount: number
  line_items: LineItem[]
  memo: string
  created_at: string
}

export type PaymentRow = {
  id: string
  invoice_id: string
  date: string
  amount: number
  method: string
  ref: string
  created_at: string
}

export type DocumentRow = {
  id: string
  title: string
  category: DocumentCategoryDb
  size: number | null
  file_name: string | null
  storage_path: string | null
  url: string
  visible_to_parents: boolean
  requires_ack: boolean
  uploaded_by: string
  uploaded_by_id: string | null
  uploaded_at: string
}

export type DocumentAcknowledgementRow = {
  document_id: string
  profile_id: string
  acknowledged_at: string
}

export type AnnouncementRow = {
  id: string
  title: string
  body: string
  /** NULL is the app's 'all' audience. */
  audience_family_id: string | null
  date: string
}

export type ThreadRow = {
  id: string
  family_id: string
  subject: string
  updated_at: string
  created_at: string
}

export type ThreadMessageRow = {
  id: string
  thread_id: string
  from_role: UserRoleDb
  author_name: string
  author_id: string | null
  body: string
  at: string
}

export type EnrollmentRow = {
  id: string
  submitted_at: string
  status: EnrollmentStatusDb
  family_name: string
  primary_contact: string
  relation: string
  email: string
  phone: string
  address: string
  secondary: Contact
  emergency: Contact[]
  children: EnrollmentChildDraft[]
  notes: string
  acknowledged_handbook: boolean
  reviewed_at: string | null
  created_family_id: string | null
}

export type LeadRow = {
  id: string
  parent_name: string
  email: string
  phone: string
  child_ages: string
  message: string
  tour_date: string | null
  status: string
  created_at: string
}

export type WaitlistProspectRow = {
  id: string
  child_name: string
  age_group: AgeGroupDb
  requested: string | null
  family: string
  note: string
  created_at: string
}

export type CalendarEventRow = {
  id: string
  kind: CalendarEventKindDb
  title: string
  note: string
  starts_on: string
  /** NULL for a single-day event. */
  ends_on: string | null
  /** Only on early_close. */
  closes_at: string | null
  /** Only on schedule_exception; NULL means daycare-wide. */
  child_id: string | null
  visible_to_parents: boolean
  created_at: string
  created_by: string | null
}

/** Single row, id = 1. No license_number: the daycare is not a licensed facility. */
export type SettingsRow = {
  id: number
  business_name: string
  tagline: string
  director: string
  address: string
  phone: string
  email: string
  hours: string
  capacity: number
  ratios: string
  rate_full_time: number
  rate_part_time: number
  rate_drop_in: number
  rate_registration_fee: number
  rate_late_fee_per_minute: number
  rate_sibling_discount_pct: number
  policy_sick: string
  policy_late_pickup: string
  policy_holidays: string
  policy_potty: string
  updated_at: string
}

type Table<Row, Required extends keyof Row> = {
  Row: Row
  Insert: Insertable<Row, Required>
  Update: Partial<Row>
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      families: Table<FamilyRow, 'name'>
      profiles: Table<ProfileRow, 'id' | 'email'>
      children: Table<ChildRow, 'family_id' | 'name' | 'dob' | 'age_group'>
      attendance: Table<AttendanceRow, 'child_id' | 'date'>
      daily_logs: Table<DailyLogRow, 'child_id' | 'date'>
      invoices: Table<InvoiceRow, 'family_id' | 'period' | 'due_date'>
      payments: Table<PaymentRow, 'invoice_id' | 'amount'>
      documents: Table<DocumentRow, 'title'>
      document_acknowledgements: Table<DocumentAcknowledgementRow, 'document_id' | 'profile_id'>
      announcements: Table<AnnouncementRow, 'title'>
      threads: Table<ThreadRow, 'family_id' | 'subject'>
      thread_messages: Table<ThreadMessageRow, 'thread_id' | 'from_role' | 'body'>
      enrollments: Table<EnrollmentRow, 'family_name' | 'email'>
      leads: Table<LeadRow, 'parent_name'>
      waitlist_prospects: Table<WaitlistProspectRow, 'child_name' | 'age_group'>
      settings: Table<SettingsRow, 'id'>
      calendar_events: Table<CalendarEventRow, 'id' | 'kind' | 'title' | 'starts_on'>
    }
    Views: { [_ in never]: never }
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean }
      current_family_id: { Args: Record<string, never>; Returns: string }
    }
    Enums: {
      user_role: UserRoleDb
      language: LanguageDb
      age_group: AgeGroupDb
      child_status: ChildStatusDb
      attendance_status: AttendanceStatusDb
      document_category: DocumentCategoryDb
      enrollment_status: EnrollmentStatusDb
      calendar_event_kind: CalendarEventKindDb
    }
    CompositeTypes: { [_ in never]: never }
  }
}

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
import type {
  Contact,
  EnrollmentChildDraft,
  Incident,
  LineItem,
  LogAttachment,
  LogPhoto,
  ScheduleBlock,
  WeeklySchedule,
} from '../types'

export type UserRoleDb = 'admin' | 'parent'
export type LanguageDb = 'en' | 'vi' | 'es'
export type AgeGroupDb = 'Infant' | 'Toddler' | 'Preschool'
export type ChildStatusDb = 'active' | 'waitlist'
export type AttendanceStatusDb = 'present' | 'absent' | 'expected' | 'checked-out'
export type DocumentCategoryDb = 'Handbooks' | 'Policies' | 'Forms' | 'Menus' | 'Calendars'
export type EnrollmentStatusDb = 'pending' | 'approved' | 'declined'
/** Sections that carry a "new since you last looked" marker. */
export type SectionName = 'documents' | 'messages' | 'daily_reports' | 'inquiries' | 'schedule_changes'
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
  /** Per child, per week. NULL = no rate on file; invoice prefill asks for one. */
  custom_weekly_rate: number | null
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
  /** Migration 0020. NULL = never set; `{}` = set with no scheduled days. */
  schedule: WeeklySchedule | null
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

/** Migration 0020. One child, one date, overriding the weekly pattern. */
export type ChildScheduleChangeRow = {
  id: string
  child_id: string
  date: string
  /** Empty = not coming that day. */
  blocks: ScheduleBlock[]
  note: string
  created_at: string
  updated_at: string
  created_by: string | null
}

/** Migration 0021. A weekly pattern that starts on `starts_on`. Never empty. */
export type ChildSchedulePlanRow = {
  id: string
  child_id: string
  starts_on: string
  schedule: WeeklySchedule
  note: string
  created_at: string
  updated_at: string
  created_by: string | null
}

/** Migration 0020. One arrival/departure; `attendance` stays the day summary. */
export type AttendanceVisitRow = {
  id: string
  child_id: string
  date: string
  check_in: string
  /** NULL while the visit is still open. */
  check_out: string | null
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
  /** Migration 0016. */
  attachments: LogAttachment[]
  /** Migration 0017. NULL when there was no incident. */
  incident: Incident | null
  author: string
  author_id: string | null
  created_at: string
}

/** Migration 0017. Insert-only; one row per parent per incident version. */
export type IncidentAcknowledgementRow = {
  log_id: string
  profile_id: string
  incident_version: string
  acknowledged_at: string
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

/** When this person last opened a section; anything newer is new to them. */
export type SectionViewRow = {
  profile_id: string
  section: SectionName
  seen_at: string
}

export type AnnouncementRow = {
  id: string
  title: string
  body: string
  /** NULL is the app's 'all' audience. */
  audience_family_id: string | null
  date: string
  /** Object key in the private `documents` bucket. NULL = no file attached. */
  attachment_storage_path: string | null
  attachment_file_name: string | null
  attachment_size: number | null
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

/* ------------------------------ Ro's own tables ----------------------------- */
// supabase/migrations/0013_ai_assistant.sql. Owner-only by RLS: these carry no
// parent-facing policy, so a family's session sees none of these rows.

export type AiOutcomeDb = 'proposed' | 'confirmed' | 'executed' | 'failed' | 'declined' | 'undone'
export type AiRuleKindDb = 'contact_hold' | 'payment_expectation' | 'reminder' | 'manual'
export type AiRuleChannelDb = 'any' | 'message' | 'announcement'
export type AiCommitmentStatusDb = 'open' | 'kept' | 'dropped'

/**
 * One AI-initiated action. Note the absence of foreign keys on `family_id` and
 * `child_id`: an audit row outlives the rows it describes, so the labels are
 * captured at write time and never resolved again. See the migration's comment.
 */
export type AiAuditLogRow = {
  id: string
  at: string
  actor_id: string | null
  actor_name: string
  /** What she actually said, before any model touched it. */
  instruction: string
  tool: string
  risk_tier: string
  arguments: Record<string, unknown>
  family_id: string | null
  family_label: string
  child_id: string | null
  child_label: string
  /** Invoice ids, thread ids, recipient lists — whatever else it touched. */
  targets: unknown[]
  outcome: AiOutcomeDb
  error: string
  model: string
  undo_until: string | null
  undone_at: string | null
}

/** A standing instruction, as a row that ordinary code checks before a send. */
export type AiStandingRuleRow = {
  id: string
  created_at: string
  created_by: string | null
  kind: AiRuleKindDb
  /** Her words, so the rule can be explained back in the form she gave it. */
  said: string
  /** The plain English shown to her before saving (§7). */
  summary: string
  /** NULL applies the rule to every family. */
  family_id: string | null
  family_label: string
  channel: AiRuleChannelDb
  /** Explicit, never inferred from `kind` — see the migration's comment. */
  blocks_sends: boolean
  /** Last date the rule applies; NULL is indefinite. */
  hold_until: string | null
  details: Record<string, unknown>
  active: boolean
  retired_at: string | null
}

/** Something Ro said it would follow up on. */
export type AiCommitmentRow = {
  id: string
  created_at: string
  said: string
  due_on: string | null
  family_id: string | null
  family_label: string
  status: AiCommitmentStatusDb
  closed_at: string | null
  closed_note: string
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
      attendance_visits: Table<AttendanceVisitRow, 'id' | 'child_id' | 'date' | 'check_in'>
      child_schedule_changes: Table<ChildScheduleChangeRow, 'id' | 'child_id' | 'date'>
      child_schedule_plans: Table<ChildSchedulePlanRow, 'id' | 'child_id' | 'starts_on' | 'schedule'>
      daily_logs: Table<DailyLogRow, 'child_id' | 'date'>
      invoices: Table<InvoiceRow, 'family_id' | 'period' | 'due_date'>
      payments: Table<PaymentRow, 'invoice_id' | 'amount'>
      documents: Table<DocumentRow, 'title'>
      document_acknowledgements: Table<DocumentAcknowledgementRow, 'document_id' | 'profile_id'>
      incident_acknowledgements: Table<IncidentAcknowledgementRow, 'log_id' | 'profile_id' | 'incident_version'>
      section_views: Table<SectionViewRow, 'profile_id' | 'section'>
      announcements: Table<AnnouncementRow, 'title'>
      threads: Table<ThreadRow, 'family_id' | 'subject'>
      thread_messages: Table<ThreadMessageRow, 'thread_id' | 'from_role' | 'body'>
      enrollments: Table<EnrollmentRow, 'family_name' | 'email'>
      leads: Table<LeadRow, 'parent_name'>
      waitlist_prospects: Table<WaitlistProspectRow, 'child_name' | 'age_group'>
      settings: Table<SettingsRow, 'id'>
      calendar_events: Table<CalendarEventRow, 'id' | 'kind' | 'title' | 'starts_on'>
      ai_audit_log: Table<AiAuditLogRow, 'id' | 'tool'>
      ai_standing_rules: Table<AiStandingRuleRow, 'id' | 'kind' | 'said' | 'summary'>
      ai_commitments: Table<AiCommitmentRow, 'id' | 'said'>
    }
    Views: { [_ in never]: never }
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean }
      current_family_id: { Args: Record<string, never>; Returns: string }
      /** Migration 0015. Owner only; issues the next `INV-n`, never reused. */
      next_invoice_id: { Args: Record<string, never>; Returns: string }
      /** Migration 0020. Pure validators behind the schedule check constraints. */
      valid_schedule_blocks: { Args: { blocks: ScheduleBlock[] }; Returns: boolean }
      valid_weekly_schedule: { Args: { schedule: WeeklySchedule }; Returns: boolean }
      /** Migration 0021. */
      schedule_has_days: { Args: { schedule: WeeklySchedule }; Returns: boolean }
      /** Migration 0021. Owner only. Folds started plans into children.schedule; returns children updated. */
      promote_due_schedule_plans: { Args: { today: string }; Returns: number }
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
      ai_outcome: AiOutcomeDb
      ai_rule_kind: AiRuleKindDb
      ai_rule_channel: AiRuleChannelDb
      ai_commitment_status: AiCommitmentStatusDb
    }
    CompositeTypes: { [_ in never]: never }
  }
}

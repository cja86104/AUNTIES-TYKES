/**
 * Mapping between Postgres rows (snake_case, nullable) and the domain types in
 * src/types.ts (camelCase, mostly non-nullable).
 *
 * Kept as pure functions on purpose: they are fully type-checked without a
 * network round trip, so `tsc` catches a schema/domain mismatch at build time
 * rather than at runtime against live data.
 *
 * Null handling follows the domain types, not the database: a column the app
 * declares as a required string becomes '' when NULL, and an optional one
 * becomes undefined.
 */
import type {
  Announcement,
  AttendanceRecord,
  CalendarEvent,
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
  WaitlistProspect,
} from '../types'
import type {
  AnnouncementRow,
  AttendanceRow,
  CalendarEventRow,
  ChildRow,
  Database,
  DailyLogRow,
  DocumentRow,
  EnrollmentRow,
  FamilyRow,
  InvoiceRow,
  LeadRow,
  PaymentRow,
  ProfileRow,
  SettingsRow,
  ThreadMessageRow,
  ThreadRow,
  WaitlistProspectRow,
} from './database.types'

type Ins<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']

/** The app's 'all' audience is stored as NULL. */
const ALL_AUDIENCE = 'all'

/* --------------------------------- read ---------------------------------- */

export function toSessionUser(row: ProfileRow): SessionUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    familyId: row.family_id ?? undefined,
    title: row.title ?? undefined,
    preferredLanguage: row.preferred_language,
  }
}

export function toFamily(row: FamilyRow): Family {
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
  }
}

export function toChild(row: ChildRow): Child {
  return {
    id: row.id,
    familyId: row.family_id,
    name: row.name,
    dob: row.dob,
    ageGroup: row.age_group,
    status: row.status,
    plan: row.plan,
    startDate: row.start_date ?? '',
    teacher: row.teacher,
    allergies: row.allergies,
    medications: row.medications,
    notes: row.notes,
    hue: row.hue,
  }
}

export function toAttendance(row: AttendanceRow): AttendanceRecord {
  return {
    id: row.id,
    childId: row.child_id,
    date: row.date,
    checkIn: row.check_in,
    checkOut: row.check_out,
    status: row.status,
    note: row.note,
  }
}

export function toDailyLog(row: DailyLogRow): DailyLog {
  return {
    id: row.id,
    childId: row.child_id,
    date: row.date,
    meals: row.meals,
    naps: row.naps,
    potty: row.potty,
    mood: row.mood,
    activities: row.activities,
    notes: row.notes,
    photos: row.photos,
    author: row.author,
  }
}

export function toPayment(row: PaymentRow): Payment {
  return { id: row.id, date: row.date, amount: row.amount, method: row.method, ref: row.ref }
}

/** Payments live in their own table; pass the rows belonging to this invoice. */
export function toInvoice(row: InvoiceRow, payments: PaymentRow[]): Invoice {
  return {
    id: row.id,
    familyId: row.family_id,
    period: row.period,
    issuedAt: row.issued_at,
    dueDate: row.due_date,
    amount: row.amount,
    lineItems: row.line_items,
    payments: payments.map(toPayment),
    memo: row.memo,
  }
}

export function toDocument(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    size: row.size ?? undefined,
    fileName: row.file_name ?? undefined,
    visibleToParents: row.visible_to_parents,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
    url: row.url,
    requiresAck: row.requires_ack,
  }
}

export function toAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    title: row.title,
    audience: row.audience_family_id ?? ALL_AUDIENCE,
    date: row.date,
    body: row.body,
  }
}

export function toThreadMessage(row: ThreadMessageRow): ThreadMessage {
  return {
    id: row.id,
    from: row.from_role,
    authorName: row.author_name,
    at: row.at,
    body: row.body,
  }
}

export function toThread(row: ThreadRow, messages: ThreadMessageRow[]): Thread {
  return {
    id: row.id,
    familyId: row.family_id,
    subject: row.subject,
    updatedAt: row.updated_at,
    messages: messages.map(toThreadMessage),
  }
}

export function toEnrollment(row: EnrollmentRow): EnrollmentSubmission {
  return {
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
    children: row.children,
    notes: row.notes,
    acknowledgedHandbook: row.acknowledged_handbook,
    reviewedAt: row.reviewed_at ?? undefined,
    createdFamilyId: row.created_family_id ?? undefined,
  }
}

export function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    parentName: row.parent_name,
    email: row.email,
    phone: row.phone,
    childAges: row.child_ages,
    message: row.message,
    createdAt: row.created_at,
    tourDate: row.tour_date ?? '',
    status: row.status,
  }
}

export function toWaitlistProspect(row: WaitlistProspectRow): WaitlistProspect {
  return {
    id: row.id,
    childName: row.child_name,
    ageGroup: row.age_group,
    requested: row.requested ?? '',
    family: row.family,
    note: row.note,
  }
}

export function toSettings(row: SettingsRow): Settings {
  return {
    businessName: row.business_name,
    tagline: row.tagline,
    director: row.director,
    address: row.address,
    phone: row.phone,
    email: row.email,
    hours: row.hours,
    capacity: row.capacity,
    ratios: row.ratios,
    rates: {
      fullTime: row.rate_full_time,
      partTime: row.rate_part_time,
      dropIn: row.rate_drop_in,
      registrationFee: row.rate_registration_fee,
      lateFeePerMinute: row.rate_late_fee_per_minute,
      siblingDiscountPct: row.rate_sibling_discount_pct,
    },
    policies: {
      sick: row.policy_sick,
      latePickup: row.policy_late_pickup,
      holidays: row.policy_holidays,
      potty: row.policy_potty,
    },
  }
}

export function toCalendarEvent(row: CalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    note: row.note,
    startsOn: row.starts_on,
    endsOn: row.ends_on ?? undefined,
    closesAt: row.closes_at ?? undefined,
    childId: row.child_id ?? undefined,
    visibleToParents: row.visible_to_parents,
    createdAt: row.created_at,
  }
}

/* --------------------------------- write --------------------------------- */

export function fromFamily(family: Family): Ins<'families'> {
  return {
    id: family.id,
    name: family.name,
    primary_contact: family.primaryContact,
    relation: family.relation,
    email: family.email,
    phone: family.phone,
    address: family.address,
    secondary: family.secondary,
    emergency: family.emergency,
    joined_at: family.joinedAt,
    notes: family.notes,
  }
}

export function fromChild(child: Child): Ins<'children'> {
  return {
    id: child.id,
    family_id: child.familyId,
    name: child.name,
    dob: child.dob,
    age_group: child.ageGroup,
    status: child.status,
    plan: child.plan,
    start_date: child.startDate || null,
    teacher: child.teacher,
    allergies: child.allergies,
    medications: child.medications,
    notes: child.notes,
    hue: child.hue,
  }
}

export function fromAttendance(record: AttendanceRecord): Ins<'attendance'> {
  return {
    id: record.id,
    child_id: record.childId,
    date: record.date,
    check_in: record.checkIn,
    check_out: record.checkOut,
    status: record.status,
    note: record.note,
  }
}

export function fromDailyLog(log: DailyLog, authorId: string | null): Ins<'daily_logs'> {
  return {
    id: log.id,
    child_id: log.childId,
    date: log.date,
    meals: log.meals,
    naps: log.naps,
    potty: log.potty,
    mood: log.mood,
    activities: log.activities,
    notes: log.notes,
    photos: log.photos,
    author: log.author,
    author_id: authorId,
  }
}

export function fromInvoice(invoice: Invoice): Ins<'invoices'> {
  return {
    id: invoice.id,
    family_id: invoice.familyId,
    period: invoice.period,
    issued_at: invoice.issuedAt,
    due_date: invoice.dueDate,
    amount: invoice.amount,
    line_items: invoice.lineItems,
    memo: invoice.memo,
  }
}

export function fromPayment(payment: Payment, invoiceId: string): Ins<'payments'> {
  return {
    id: payment.id,
    invoice_id: invoiceId,
    date: payment.date,
    amount: payment.amount,
    method: payment.method,
    ref: payment.ref,
  }
}

export function fromDocument(doc: DocumentRecord, uploadedById: string | null): Ins<'documents'> {
  return {
    id: doc.id,
    title: doc.title,
    category: doc.category,
    size: doc.size ?? null,
    file_name: doc.fileName ?? null,
    url: doc.url,
    visible_to_parents: doc.visibleToParents,
    requires_ack: doc.requiresAck,
    uploaded_by: doc.uploadedBy,
    uploaded_by_id: uploadedById,
  }
}

export function fromAnnouncement(announcement: Announcement): Ins<'announcements'> {
  return {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    audience_family_id:
      announcement.audience === ALL_AUDIENCE ? null : announcement.audience,
    date: announcement.date,
  }
}

export function fromThread(thread: Thread): Ins<'threads'> {
  return {
    id: thread.id,
    family_id: thread.familyId,
    subject: thread.subject,
    updated_at: thread.updatedAt,
  }
}

export function fromThreadMessage(
  message: ThreadMessage,
  threadId: string,
  authorId: string | null,
): Ins<'thread_messages'> {
  return {
    id: message.id,
    thread_id: threadId,
    from_role: message.from,
    author_name: message.authorName,
    author_id: authorId,
    body: message.body,
    at: message.at,
  }
}

export function fromLead(lead: Lead): Ins<'leads'> {
  return {
    id: lead.id,
    parent_name: lead.parentName,
    email: lead.email,
    phone: lead.phone,
    child_ages: lead.childAges,
    message: lead.message,
    tour_date: lead.tourDate || null,
    status: lead.status,
  }
}

export function fromCalendarEvent(event: CalendarEvent, createdBy: string | null): Ins<'calendar_events'> {
  return {
    id: event.id,
    kind: event.kind,
    title: event.title,
    note: event.note,
    starts_on: event.startsOn,
    ends_on: event.endsOn ?? null,
    // The database rejects closes_at on anything but an early close, and a
    // child_id on anything but a schedule exception — mirror that here so a
    // bad combination fails locally instead of as a constraint violation.
    closes_at: event.kind === 'early_close' ? (event.closesAt ?? null) : null,
    child_id: event.kind === 'schedule_exception' ? (event.childId ?? null) : null,
    visible_to_parents: event.visibleToParents,
    created_by: createdBy,
  }
}

export function fromSettings(settings: Settings): Ins<'settings'> {
  return {
    id: 1,
    business_name: settings.businessName,
    tagline: settings.tagline,
    director: settings.director,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    hours: settings.hours,
    capacity: settings.capacity,
    ratios: settings.ratios,
    rate_full_time: settings.rates.fullTime,
    rate_part_time: settings.rates.partTime,
    rate_drop_in: settings.rates.dropIn,
    rate_registration_fee: settings.rates.registrationFee,
    rate_late_fee_per_minute: settings.rates.lateFeePerMinute,
    rate_sibling_discount_pct: settings.rates.siblingDiscountPct,
    policy_sick: settings.policies.sick,
    policy_late_pickup: settings.policies.latePickup,
    policy_holidays: settings.policies.holidays,
    policy_potty: settings.policies.potty,
  }
}

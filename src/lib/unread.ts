/**
 * "There is something new here" markers.
 *
 * Newness is per account, not per browser: the last time a person opened a
 * section lives in public.section_views (migration 0008), so checking on a
 * phone also clears it on a laptop.
 *
 * Everything compares ISO timestamp strings directly, which sorts correctly
 * as long as the stamps really are timestamps. That is why documents and
 * announcements use nowISO() rather than todayISO() — a date-only stamp is
 * always "older" than the moment you looked, so it could never show as new.
 */
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import type { SectionName } from './database.types'
import { todayISO } from './helpers'
import type {
  Announcement,
  DailyLog,
  DocumentAck,
  DocumentRecord,
  IncidentAck,
  Lead,
  ScheduleChange,
  SchedulePlan,
  Thread,
} from '../types'

/** Never opened means everything in it is new. */
function newerThan(at: string | undefined, seenAt: string | undefined): boolean {
  if (!at) return false
  return !seenAt || at > seenAt
}

export interface SectionSeen {
  /**
   * False until the marker has been read from the store. Pills stay hidden
   * until then, otherwise a slow load flashes every row as new.
   */
  settled: boolean
  isNew: (at: string | undefined) => boolean
}

/**
 * Reads the section's marker, freezes it for this visit, and records that the
 * person has now looked.
 *
 * The freeze matters: marking the section seen updates the store straight
 * away, and without a frozen copy the pills would vanish in the same render
 * that drew them.
 */
export function useSectionSeen(section: SectionName): SectionSeen {
  const ready = useStore((s) => s.ready)
  const userId = useStore((s) => s.user?.id)
  const markSectionSeen = useStore((s) => s.markSectionSeen)

  const [seenAt, setSeenAt] = useState<string | undefined>(undefined)
  const [settled, setSettled] = useState(false)
  const captured = useRef(false)

  useEffect(() => {
    if (!ready || !userId || captured.current) return
    captured.current = true
    setSeenAt(useStore.getState().sectionViews[section])
    setSettled(true)
    markSectionSeen(section)
  }, [ready, userId, section, markSectionSeen])

  return {
    settled,
    isNew: (at) => settled && newerThan(at, seenAt),
  }
}

/* ----------------------------- what counts as new ------------------------- */

/** Your own upload is never news to you. */
export function newDocuments(
  documents: DocumentRecord[],
  seenAt: string | undefined,
  ownName: string | undefined,
): DocumentRecord[] {
  return documents.filter((d) => d.uploadedBy !== ownName && newerThan(d.uploadedAt, seenAt))
}

/** Threads carrying a message from the other side since you last looked. */
export function newThreads(
  threads: Thread[],
  seenAt: string | undefined,
  fromRole: 'admin' | 'parent',
): Thread[] {
  return threads.filter((t) =>
    t.messages.some((m) => m.from === fromRole && newerThan(m.at, seenAt)),
  )
}

export function newAnnouncements(
  announcements: Announcement[],
  seenAt: string | undefined,
): Announcement[] {
  return announcements.filter((a) => newerThan(a.date, seenAt))
}

export function newDailyLogs(logs: DailyLog[], seenAt: string | undefined): DailyLog[] {
  return logs.filter((l) => newerThan(l.postedAt, seenAt))
}

/**
 * Reports whose current incident this parent has not acknowledged. Not "new
 * since you looked": opening Daily reports does not clear these — only
 * acknowledging does, the same way an enrollment waits for an answer.
 */
export function incidentsAwaitingAck(
  logs: DailyLog[],
  acks: IncidentAck[],
  profileId: string | undefined,
): DailyLog[] {
  return logs.filter((l) => {
    const incident = l.incident
    if (!incident) return false
    return !acks.some((a) => a.logId === l.id && a.profileId === profileId && a.version === incident.recordedAt)
  })
}

/** Owner side: parents who confirmed a document since she last opened Documents. */
export function newDocumentAcks(acks: DocumentAck[], seenAt: string | undefined): DocumentAck[] {
  return acks.filter((a) => newerThan(a.acknowledgedAt, seenAt))
}

/** Owner side: parents who confirmed an incident report since she last opened Daily logs. */
export function newIncidentAcks(acks: IncidentAck[], seenAt: string | undefined): IncidentAck[] {
  return acks.filter((a) => newerThan(a.acknowledgedAt, seenAt))
}

/** Owner side: contact-form inquiries since she last opened the inquiry inbox. */
export function newLeads(leads: Lead[], seenAt: string | undefined): Lead[] {
  return leads.filter((l) => newerThan(l.createdAt, seenAt))
}

/**
 * Parent side: one-off changes to their children's schedules, made or edited
 * since they last looked. Only changes to today or later count; a change to a
 * day that has passed is not news. Opening the calendar or a child's page
 * clears these.
 */
export function newScheduleChanges(
  changes: ScheduleChange[],
  seenAt: string | undefined,
  today: string,
): ScheduleChange[] {
  return changes.filter((c) => c.date >= today && newerThan(c.updatedAt, seenAt))
}

/**
 * Parent side: new weekly patterns starting on a future date, set or edited
 * since they last looked. Counted with one-off changes under the same marker.
 */
export function newSchedulePlans(plans: SchedulePlan[], seenAt: string | undefined, today: string): SchedulePlan[] {
  return plans.filter((p) => p.startsOn >= today && newerThan(p.updatedAt, seenAt))
}

/* -------------------------------- nav badges ------------------------------ */

export interface UnreadCounts {
  /**
   * New files from the other side; for the owner, also parents who have
   * acknowledged a document since she last looked.
   */
  documents: number
  messages: number
  /**
   * Enrollment submissions still waiting on the owner's decision. Unlike the
   * other two this is not "new since you looked" — opening Future Arrivals
   * does not clear it, approving or declining does. A submission is a family
   * waiting to hear back, so it stays visible until it has been answered.
   * Always 0 for a parent, who cannot see submissions at all.
   */
  enrollments: number
  /**
   * Parent only: reports posted since they last opened Daily reports, plus
   * any incident still waiting for their acknowledgement, counted once per
   * report. For the owner: parents who confirmed an incident report since she
   * last opened Daily logs.
   */
  dailyReports: number
  /** Owner only: contact-form inquiries since she last opened the inbox. Always 0 for a parent. */
  inquiries: number
  /**
   * Parent only: upcoming one-off schedule changes and new weekly schedules for
   * their children, made or edited since they last looked. Always 0 for the
   * owner, who makes them.
   */
  calendar: number
}

/**
 * Counts for the nav badges, from the signed-in person's point of view: the
 * owner is waiting on families, a parent is waiting on Auntie Melissa.
 *
 * Unlike useSectionSeen this reads the live marker, so opening a section
 * clears its badge straight away.
 */
export function useUnreadCounts(): UnreadCounts {
  const user = useStore((s) => s.user)
  const documents = useStore((s) => s.documents)
  const threads = useStore((s) => s.threads)
  const announcements = useStore((s) => s.announcements)
  const sectionViews = useStore((s) => s.sectionViews)
  const enrollments = useStore((s) => s.enrollments)
  const dailyLogs = useStore((s) => s.dailyLogs)
  const children = useStore((s) => s.children)
  const incidentAcks = useStore((s) => s.incidentAcks)
  const documentAcks = useStore((s) => s.acknowledgements)
  const leads = useStore((s) => s.leads)
  const scheduleChanges = useStore((s) => s.scheduleChanges)
  const schedulePlans = useStore((s) => s.schedulePlans)

  if (!user) return { documents: 0, messages: 0, enrollments: 0, dailyReports: 0, inquiries: 0, calendar: 0 }

  const docsSeen = sectionViews.documents
  const msgsSeen = sectionViews.messages

  if (user.role === 'admin') {
    return {
      documents: newDocuments(documents, docsSeen, user.name).length + newDocumentAcks(documentAcks, docsSeen).length,
      messages: newThreads(threads, msgsSeen, 'parent').length,
      enrollments: enrollments.filter((e) => e.status === 'pending').length,
      dailyReports: newIncidentAcks(incidentAcks, sectionViews.daily_reports).length,
      inquiries: newLeads(leads, sectionViews.inquiries).length,
      calendar: 0,
    }
  }

  const familyId = user.familyId ?? ''
  const mine = documents.filter((d) => d.visibleToParents || d.uploadedBy === user.name)
  const ours = threads.filter((t) => t.familyId === familyId)
  const forUs = announcements.filter((a) => a.audience === 'all' || a.audience === familyId)
  const kidIds = new Set(children.filter((c) => c.familyId === familyId).map((c) => c.id))
  const ourLogs = dailyLogs.filter((l) => kidIds.has(l.childId))
  const reportIds = new Set([
    ...newDailyLogs(ourLogs, sectionViews.daily_reports).map((l) => l.id),
    ...incidentsAwaitingAck(ourLogs, incidentAcks, user.id).map((l) => l.id),
  ])

  return {
    documents: newDocuments(mine, docsSeen, user.name).length,
    messages: newThreads(ours, msgsSeen, 'admin').length + newAnnouncements(forUs, msgsSeen).length,
    enrollments: 0,
    dailyReports: reportIds.size,
    inquiries: 0,
    calendar:
      newScheduleChanges(
        scheduleChanges.filter((c) => kidIds.has(c.childId)),
        sectionViews.schedule_changes,
        todayISO(),
      ).length +
      newSchedulePlans(
        schedulePlans.filter((p) => kidIds.has(p.childId)),
        sectionViews.schedule_changes,
        todayISO(),
      ).length,
  }
}

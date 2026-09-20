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
import type { Announcement, DocumentRecord, Thread } from '../types'

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

/* -------------------------------- nav badges ------------------------------ */

export interface UnreadCounts {
  documents: number
  messages: number
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

  if (!user) return { documents: 0, messages: 0 }

  const docsSeen = sectionViews.documents
  const msgsSeen = sectionViews.messages

  if (user.role === 'admin') {
    return {
      documents: newDocuments(documents, docsSeen, user.name).length,
      messages: newThreads(threads, msgsSeen, 'parent').length,
    }
  }

  const familyId = user.familyId ?? ''
  const mine = documents.filter((d) => d.visibleToParents || d.uploadedBy === user.name)
  const ours = threads.filter((t) => t.familyId === familyId)
  const forUs = announcements.filter((a) => a.audience === 'all' || a.audience === familyId)

  return {
    documents: newDocuments(mine, docsSeen, user.name).length,
    messages: newThreads(ours, msgsSeen, 'admin').length + newAnnouncements(forUs, msgsSeen).length,
  }
}

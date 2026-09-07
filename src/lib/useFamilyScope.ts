import { useMemo } from 'react'
import { useStore } from '../store/useStore'
import { invoiceBalance, invoiceStatus } from './helpers'
import type { Announcement, Child, DocumentRecord, Family, Invoice, SessionUser } from '../types'

export interface FamilyScope {
  user: SessionUser | null
  familyId: string
  family: Family | undefined
  /** Every child belonging to this family, enrolled or waitlisted. */
  kids: Child[]
  /** Only the actively enrolled children. */
  activeKids: Child[]
  invoices: Invoice[]
  outstanding: number
  /** The soonest unpaid invoice, if any. */
  nextInvoice: Invoice | undefined
  overdueCount: number
  /** Announcements addressed to everyone, or to this family specifically. */
  announcements: Announcement[]
  /** Documents shared with parents, plus anything this family uploaded. */
  documents: DocumentRecord[]
}

/**
 * Everything a parent-portal page needs, already narrowed to the signed-in
 * family. Keeps the nine portal pages from each re-deriving the same filters.
 */
export function useFamilyScope(): FamilyScope {
  const user = useStore((s) => s.user)
  const families = useStore((s) => s.families)
  const children = useStore((s) => s.children)
  const allInvoices = useStore((s) => s.invoices)
  const allAnnouncements = useStore((s) => s.announcements)
  const allDocuments = useStore((s) => s.documents)

  const familyId = user?.familyId ?? ''

  return useMemo(() => {
    const family = families.find((f) => f.id === familyId)
    const kids = children.filter((c) => c.familyId === familyId)
    const invoices = allInvoices
      .filter((i) => i.familyId === familyId)
      .sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1))

    const open = invoices
      .filter((i) => invoiceBalance(i) > 0)
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))

    return {
      user,
      familyId,
      family,
      kids,
      activeKids: kids.filter((c) => c.status === 'active'),
      invoices,
      outstanding: invoices.reduce((s, i) => s + invoiceBalance(i), 0),
      nextInvoice: open[0],
      overdueCount: invoices.filter((i) => invoiceStatus(i) === 'overdue').length,
      announcements: allAnnouncements
        .filter((a) => a.audience === 'all' || a.audience === familyId)
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
      documents: allDocuments
        .filter((d) => d.visibleToParents || d.uploadedBy === user?.name)
        .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1)),
    }
  }, [user, familyId, families, children, allInvoices, allAnnouncements, allDocuments])
}

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  FolderOpen,
  FileText,
  Trash2,
  Eye,
  EyeOff,
  Download,
  Search,
  ShieldCheck,
  Users,
  Pin,
  PinOff,
  CalendarDays,
} from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatCard,
} from '../../components/ui'
import FileUploader from '../../components/FileUploader'
import WeekPicker from '../../components/WeekPicker'
import { useStore } from '../../store/useStore'
import { DAYCARE_TIME_ZONE, bytes, fmtDate, todayISO, weekLabel } from '../../lib/helpers'
import { weekOf, weekStartOf, weeksWithItems } from '../../lib/weeks'
import { downloadDocument, removeDocumentFile } from '../../lib/storage'
import { useSectionSeen } from '../../lib/unread'
import type { DocumentRecord, UploadedFileMeta } from '../../types'

export default function AdminDocuments() {
  const documents = useStore((s) => s.documents)
  const addDocument = useStore((s) => s.addDocument)
  const deleteDocument = useStore((s) => s.deleteDocument)
  const toggleDocVisibility = useStore((s) => s.toggleDocVisibility)
  const toggleDocPinned = useStore((s) => s.toggleDocPinned)
  const pushToast = useStore((s) => s.pushToast)
  const user = useStore((s) => s.user)
  const users = useStore((s) => s.users)
  const acknowledgements = useStore((s) => s.acknowledgements)
  const seen = useSectionSeen('documents')

  const [query, setQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<DocumentRecord | null>(null)

  /** Settings applied to the next file dropped on the uploader. */
  const [uploadVisible, setUploadVisible] = useState(true)
  const [uploadRequiresAck, setUploadRequiresAck] = useState(false)
  const [uploadPinned, setUploadPinned] = useState(false)

  /**
   * The page starts fresh every Monday on the admin side only: it opens on
   * this week (Mon–Sun, Eastern), earlier weeks are one step back, and search
   * looks across every week. Pinned documents ("Keep visible") show on every
   * week. Nothing is deleted, and families still see every shared document.
   */
  const thisWeek = weekStartOf(todayISO()) ?? todayISO()
  const [week, setWeek] = useState(thisWeek)
  const searching = query.trim() !== ''

  /** A parent acknowledged it since she last opened this page. */
  const hasNewAck = (docId: string) =>
    acknowledgements.some((a) => a.documentId === docId && seen.isNew(a.acknowledgedAt))

  const sorted = useMemo(
    () =>
      [...documents]
        .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1))
        .map((d) => ({ ...d, week: weekOf(d.uploadedAt, DAYCARE_TIME_ZONE) })),
    [documents],
  )
  const weeks = useMemo(
    () => weeksWithItems(sorted.filter((d) => !d.pinned).map((d) => d.week), thisWeek),
    [sorted, thisWeek],
  )

  const searchRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return sorted.filter((d) => `${d.title} ${d.uploadedBy} ${d.fileName ?? ''}`.toLowerCase().includes(q))
  }, [sorted, query])

  const pinnedRows = sorted.filter((d) => d.pinned)
  // A new acknowledgement on an older document keeps it on this week until she
  // has seen it, so its "New" marker is never tucked away in a past week.
  const weekRows = sorted.filter(
    (d) => !d.pinned && (d.week === week || (week === thisWeek && hasNewAck(d.id))),
  )
  /** Everything on screen for the chosen week; the stat cards count these. */
  const onScreen = searching ? searchRows : [...pinnedRows, ...weekRows]

  const visibleCount = onScreen.filter((d) => d.visibleToParents).length
  const ackCount = onScreen.filter((d) => d.requiresAck).length
  const totalSize = onScreen.reduce((s, d) => s + (d.size ?? 0), 0)
  const scopeLabel = searching ? 'Search results' : weekLabel(week, thisWeek)

  const onUploaded = (meta: UploadedFileMeta) => {
    addDocument({
      title: meta.title,
      fileName: meta.fileName,
      size: meta.size,
      storagePath: meta.storagePath,
      visibleToParents: uploadVisible,
      requiresAck: uploadRequiresAck,
      pinned: uploadPinned,
    })
    // A new upload belongs to this week; bring her back to it to see it land.
    setWeek(thisWeek)
    setQuery('')
    pushToast({
      title: 'Document added',
      description: `${meta.title} was added${uploadVisible ? ' and shared with parents.' : ' (staff only).'}`,
    })
  }

  const onUploadError = (message: string) => {
    pushToast({ tone: 'error', title: 'That file was not uploaded', description: message })
  }

  const doDelete = () => {
    if (!confirmDelete) return
    const { id, title, storagePath } = confirmDelete
    // Drop the file first: a deleted row with a surviving object would leave
    // the family able to fetch it straight from their own storage prefix.
    if (storagePath) {
      void removeDocumentFile(storagePath).catch((error: unknown) => {
        pushToast({
          tone: 'error',
          title: 'The record went, the file stayed',
          description:
            error instanceof Error ? error.message : 'The stored file could not be removed.',
        })
      })
    }
    deleteDocument(id)
    pushToast({ tone: 'info', title: 'Document removed', description: `${title} was deleted.` })
    setConfirmDelete(null)
  }

  const onDownload = (doc: DocumentRecord) => {
    if (!doc.storagePath) {
      pushToast({
        tone: 'info',
        title: 'No file on this record',
        description: `${doc.title} was filed without an attachment. Upload the file to replace it.`,
      })
      return
    }
    void downloadDocument(doc.storagePath, doc.fileName)
      .catch((error: unknown) => {
        pushToast({
          tone: 'error',
          title: 'That download did not open',
          description:
            error instanceof Error ? error.message : 'Check your connection and try again.',
        })
      })
  }

  const onTogglePinned = (doc: DocumentRecord) => {
    toggleDocPinned(doc.id)
    pushToast({
      tone: 'info',
      title: doc.pinned ? 'No longer kept visible' : 'Kept visible every week',
      description: doc.pinned
        ? `${doc.title} now sits in the week it was added. Families still see it as before.`
        : `${doc.title} will show on this page every week. Families see no change.`,
    })
  }

  /** One list of document rows. `showWeek` tags each row with its week (search results). */
  const renderList = (list: (DocumentRecord & { week: string | null })[], showWeek: boolean) => (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-slate-100">
        {list.map((d, i) => (
          <motion.li
            key={d.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.04, 0.3) }}
            className="flex flex-wrap items-center gap-3 px-5 py-4"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E8F3EE] text-[#3F8570]">
              <FileText size={19} />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-bold text-slate-900">{d.title}</p>
              <p className="truncate text-xs text-slate-500">
                {bytes(d.size)} · added {fmtDate(d.uploadedAt)} by {d.uploadedBy}
              </p>
              {d.requiresAck && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                  {acknowledgements.filter((a) => a.documentId === d.id).length === 0 ? (
                    <span>No parent has acknowledged it yet.</span>
                  ) : (
                    <>
                      <span className="font-semibold">Acknowledged by</span>
                      {acknowledgements
                        .filter((a) => a.documentId === d.id)
                        .sort((a, b) => (a.acknowledgedAt < b.acknowledgedAt ? 1 : -1))
                        .map((a) => (
                          <span key={a.profileId} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">
                            {users.find((u) => u.id === a.profileId)?.name ?? 'a parent'} · {fmtDate(a.acknowledgedAt, 'MMM d')}
                            {seen.isNew(a.acknowledgedAt) && <Badge tone="violet">New</Badge>}
                          </span>
                        ))}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {d.uploadedBy !== user?.name && seen.isNew(d.uploadedAt) && <Badge tone="violet">New</Badge>}
              {showWeek && d.week && (
                <Badge tone="neutral">
                  <CalendarDays size={12} /> {weekLabel(d.week, thisWeek)}
                </Badge>
              )}
              {d.pinned && (
                <Badge tone="blue">
                  <Pin size={12} /> Kept visible
                </Badge>
              )}
              {d.requiresAck && (
                <Badge tone="amber">
                  <ShieldCheck size={12} /> Ack required
                </Badge>
              )}
              <Badge tone={d.visibleToParents ? 'green' : 'neutral'}>
                {d.visibleToParents ? 'Parents' : 'Staff only'}
              </Badge>
            </div>

            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  toggleDocVisibility(d.id)
                  pushToast({
                    tone: 'info',
                    title: d.visibleToParents ? 'Hidden from parents' : 'Shared with parents',
                    description: `${d.title} is now ${d.visibleToParents ? 'staff only' : 'visible in the parent portal'}.`,
                  })
                }}
              >
                {d.visibleToParents ? <EyeOff size={14} /> : <Eye size={14} />}
                {d.visibleToParents ? 'Hide' : 'Share'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onTogglePinned(d)}
                aria-label={d.pinned ? `Stop keeping ${d.title} visible every week` : `Keep ${d.title} visible every week`}
                title={d.pinned ? 'Stop keeping visible' : 'Keep visible every week'}
              >
                {d.pinned ? <PinOff size={15} /> : <Pin size={15} />}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDownload(d)} aria-label={`Download ${d.title}`}>
                <Download size={15} />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(d)} aria-label={`Delete ${d.title}`}>
                <Trash2 size={15} />
              </Button>
            </div>
          </motion.li>
        ))}
      </ul>
    </Card>
  )

  return (
    <PageTransition>
      <PageHeader
        title="Documents"
        description="Handbooks, policies, forms, menus, and calendars — and who can see each one."
        actions={
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search all weeks…"
              className="w-full pl-9 sm:w-56"
              aria-label="Search documents"
            />
          </div>
        }
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          icon={FolderOpen}
          label={`Documents · ${scopeLabel}`}
          value={onScreen.length}
          sub={searching ? bytes(totalSize) : `${bytes(totalSize)} · ${pinnedRows.length} kept visible`}
          tone="blue"
        />
        <StatCard icon={Users} label="Shared with parents" value={visibleCount} sub={`${onScreen.length - visibleCount} staff-only`} tone="green" />
        <StatCard icon={ShieldCheck} label="Need acknowledgement" value={ackCount} sub="Parents must confirm they read these" tone="amber" />
      </div>

      <Card className="mt-6 mb-8 p-5">
        <h2 className="font-display text-lg font-bold text-slate-900">Upload a document</h2>
        <p className="mt-1 text-sm text-slate-500">
          Choose who sees it, then drop the file. Files are stored privately — only a signed-in account with permission can open one.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Visible to parents">
            <Select value={uploadVisible ? 'yes' : 'no'} onChange={(e) => setUploadVisible(e.target.value === 'yes')}>
              <option value="yes">Yes — show in the parent portal</option>
              <option value="no">No — staff only</option>
            </Select>
          </Field>
          <Field label="Require acknowledgement">
            <Select value={uploadRequiresAck ? 'yes' : 'no'} onChange={(e) => setUploadRequiresAck(e.target.value === 'yes')}>
              <option value="no">Not required</option>
              <option value="yes">Parents must confirm they read it</option>
            </Select>
          </Field>
          <Field label="Keep visible every week">
            <Select value={uploadPinned ? 'yes' : 'no'} onChange={(e) => setUploadPinned(e.target.value === 'yes')}>
              <option value="no">No — moves to past weeks next Monday</option>
              <option value="yes">Yes — handbook, policies, forms</option>
            </Select>
          </Field>
        </div>

        <div className="mt-4">
          <FileUploader prefix="admin" onUploaded={onUploaded} onError={onUploadError} />
        </div>
      </Card>

      {documents.length > 0 && (
        <div className="mb-5">
          {searching ? (
            <p className="text-sm text-slate-500">Searching every week · {searchRows.length} found</p>
          ) : (
            <WeekPicker week={week} thisWeek={thisWeek} weeks={weeks} onChange={setWeek} noun={['document', 'documents']} />
          )}
        </div>
      )}

      {documents.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No documents yet"
          description="Upload your handbook and enrollment packet so families can find them without emailing you."
        />
      ) : searching ? (
        searchRows.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Nothing matches that search"
            description="Search looks through every week's documents, including the ones kept visible."
            action={
              <Button variant="outline" onClick={() => setQuery('')}>
                Clear search
              </Button>
            }
          />
        ) : (
          renderList(searchRows, true)
        )
      ) : (
        <>
          {pinnedRows.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2.5 flex items-center gap-1.5 font-display text-sm font-bold text-slate-700">
                <Pin size={14} /> Kept visible every week
              </h2>
              {renderList(pinnedRows, false)}
            </section>
          )}
          <section>
            <h2 className="mb-2.5 flex items-center gap-1.5 font-display text-sm font-bold text-slate-700">
              <CalendarDays size={14} /> {week === thisWeek ? 'Added this week' : `Added · ${weekLabel(week, thisWeek)}`}
            </h2>
            {weekRows.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title={week === thisWeek ? 'A fresh week' : 'Nothing added that week'}
                description={
                  week === thisWeek
                    ? 'Nothing added yet this week. Earlier weeks are one step back with the arrow, or search finds anything.'
                    : 'Step to another week, or search to find a document by name.'
                }
                action={
                  week === thisWeek ? undefined : (
                    <Button variant="outline" onClick={() => setWeek(thisWeek)}>
                      Back to this week
                    </Button>
                  )
                }
              />
            ) : (
              renderList(weekRows, false)
            )}
          </section>
        </>
      )}

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Delete this document?"
        description={confirmDelete?.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={doDelete}>
              <Trash2 size={16} /> Delete
            </Button>
          </>
        }
      >
        <Card className="bg-rose-50/60 p-4 text-sm text-rose-900">
          {confirmDelete?.visibleToParents
            ? 'Families will immediately lose access to this document in their portal.'
            : 'This document is staff-only, so no family will notice the change.'}{' '}
          This cannot be undone.
        </Card>
      </Modal>
    </PageTransition>
  )
}

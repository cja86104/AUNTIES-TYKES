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
  Tabs,
} from '../../components/ui'
import FileUploader from '../../components/FileUploader'
import { useStore } from '../../store/useStore'
import { bytes, fmtDate } from '../../lib/helpers'
import { documentCategories } from '../../data/mockData'
import type { DocumentCategory, DocumentRecord, UploadedFileMeta } from '../../types'

export default function AdminDocuments() {
  const documents = useStore((s) => s.documents)
  const addDocument = useStore((s) => s.addDocument)
  const deleteDocument = useStore((s) => s.deleteDocument)
  const toggleDocVisibility = useStore((s) => s.toggleDocVisibility)
  const pushToast = useStore((s) => s.pushToast)

  const [tab, setTab] = useState<'all' | DocumentCategory>('all')
  const [query, setQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<DocumentRecord | null>(null)

  /** Settings applied to the next file dropped on the uploader. */
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('Forms')
  const [uploadVisible, setUploadVisible] = useState(true)
  const [uploadRequiresAck, setUploadRequiresAck] = useState(false)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return documents
      .filter((d) => (tab === 'all' ? true : d.category === tab))
      .filter((d) => (q ? `${d.title} ${d.category} ${d.uploadedBy}`.toLowerCase().includes(q) : true))
      .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1))
  }, [documents, tab, query])

  const tabs = useMemo(
    () => [
      { value: 'all', label: 'All', count: documents.length },
      ...documentCategories.map((c) => ({
        value: c,
        label: c,
        count: documents.filter((d) => d.category === c).length,
      })),
    ],
    [documents],
  )

  const visibleCount = documents.filter((d) => d.visibleToParents).length
  const ackCount = documents.filter((d) => d.requiresAck).length
  const totalSize = documents.reduce((s, d) => s + (d.size ?? 0), 0)

  const onUploaded = (meta: UploadedFileMeta) => {
    addDocument({
      title: meta.title,
      fileName: meta.fileName,
      size: meta.size,
      category: uploadCategory,
      visibleToParents: uploadVisible,
      requiresAck: uploadRequiresAck,
    })
    pushToast({
      title: 'Document added',
      description: `${meta.title} filed under ${uploadCategory}${uploadVisible ? ' and shared with parents.' : ' (staff only).'}`,
    })
  }

  const doDelete = () => {
    if (!confirmDelete) return
    deleteDocument(confirmDelete.id)
    pushToast({ tone: 'info', title: 'Document removed', description: `${confirmDelete.title} was deleted.` })
    setConfirmDelete(null)
  }

  const onDownload = (doc: DocumentRecord) => {
    pushToast({
      tone: 'info',
      title: 'Demo build — no file attached',
      description: `${doc.title} is a placeholder record. Real files download here once storage is connected.`,
    })
  }

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
              placeholder="Search documents…"
              className="w-full pl-9 sm:w-56"
              aria-label="Search documents"
            />
          </div>
        }
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={FolderOpen} label="Documents" value={documents.length} sub={bytes(totalSize)} tone="blue" />
        <StatCard icon={Users} label="Shared with parents" value={visibleCount} sub={`${documents.length - visibleCount} staff-only`} tone="green" />
        <StatCard icon={ShieldCheck} label="Need acknowledgement" value={ackCount} sub="Parents must confirm they read these" tone="amber" />
        <StatCard icon={FileText} label="Categories" value={documentCategories.length} sub={documentCategories.join(' · ')} tone="violet" />
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-display text-lg font-bold text-slate-900">Upload a document</h2>
        <p className="mt-1 text-sm text-slate-500">
          Choose where it files and who sees it, then drop the file. This preview keeps the record locally — no file leaves your browser.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Category">
            <Select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value as DocumentCategory)}>
              {documentCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
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
        </div>

        <div className="mt-4">
          <FileUploader onUploaded={onUploaded} />
        </div>
      </Card>

      <div className="mb-6 mt-8">
        <Tabs tabs={tabs} value={tab} onChange={(v) => setTab(v as 'all' | DocumentCategory)} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={query || tab !== 'all' ? 'Nothing filed here yet' : 'No documents yet'}
          description={
            query || tab !== 'all'
              ? 'Try another category, or clear the search.'
              : 'Upload your handbook and enrollment packet so families can find them without emailing you.'
          }
          action={
            query || tab !== 'all' ? (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery('')
                  setTab('all')
                }}
              >
                Show everything
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {rows.map((d, i) => (
              <motion.li
                key={d.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.3) }}
                className="flex flex-wrap items-center gap-3 px-5 py-4"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#EAF0FC] to-white text-[#4F77D9]">
                  <FileText size={19} />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold text-slate-900">{d.title}</p>
                  <p className="truncate text-xs text-slate-500">
                    {d.category} · {bytes(d.size)} · added {fmtDate(d.uploadedAt)} by {d.uploadedBy}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
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

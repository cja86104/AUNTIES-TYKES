import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { FolderOpen, FileText, Download, ShieldCheck, CheckCircle2, Search, Upload } from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  StatCard,
  Tabs,
} from '../../components/ui'
import FileUploader from '../../components/FileUploader'
import { useStore } from '../../store/useStore'
import { useFamilyScope } from '../../lib/useFamilyScope'
import { bytes, fmtDate } from '../../lib/helpers'
import { documentCategories } from '../../data/mockData'
import type { DocumentCategory, DocumentRecord, UploadedFileMeta } from '../../types'

export default function ParentDocuments() {
  const { user, documents } = useFamilyScope()
  const acknowledgements = useStore((s) => s.acknowledgements)
  const acknowledgeDocument = useStore((s) => s.acknowledgeDocument)
  const addDocument = useStore((s) => s.addDocument)
  const pushToast = useStore((s) => s.pushToast)

  const [tab, setTab] = useState<'all' | DocumentCategory>('all')
  const [query, setQuery] = useState('')
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('Forms')

  const hasAcknowledged = (docId: string) => acknowledgements.includes(`${user?.id ?? 'anon'}:${docId}`)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return documents
      .filter((d) => (tab === 'all' ? true : d.category === tab))
      .filter((d) => (q ? `${d.title} ${d.category}`.toLowerCase().includes(q) : true))
  }, [documents, tab, query])

  const tabs = useMemo(
    () => [
      { value: 'all', label: 'All', count: documents.length },
      ...documentCategories
        .filter((c) => documents.some((d) => d.category === c))
        .map((c) => ({ value: c, label: c, count: documents.filter((d) => d.category === c).length })),
    ],
    [documents],
  )

  const needsAck = documents.filter((d) => d.requiresAck && !hasAcknowledged(d.id))
  const myUploads = documents.filter((d) => d.uploadedBy === user?.name)

  const onUploaded = (meta: UploadedFileMeta) => {
    addDocument({
      title: meta.title,
      fileName: meta.fileName,
      size: meta.size,
      category: uploadCategory,
      visibleToParents: false,
      uploadedBy: user?.name ?? 'Parent',
      requiresAck: false,
    })
    pushToast({
      title: 'Thanks — we got it',
      description: `${meta.title} was sent to Auntie Roz for your child's file.`,
    })
  }

  const onDownload = (doc: DocumentRecord) => {
    pushToast({
      tone: 'info',
      title: 'Demo build — no file attached',
      description: `${doc.title} is a placeholder record in this preview.`,
    })
  }

  const onAcknowledge = (doc: DocumentRecord) => {
    acknowledgeDocument(doc.id)
    pushToast({ title: 'Thank you', description: `We've noted that you read ${doc.title}.` })
  }

  return (
    <PageTransition>
      <PageHeader
        title="Documents"
        description="Handbooks, menus, calendars, and the forms we need back from you."
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

      <div className="grid gap-5 sm:grid-cols-3">
        <StatCard icon={FolderOpen} label="Available to you" value={documents.length} sub="Shared by Aunties Tykes" tone="blue" />
        <StatCard
          icon={ShieldCheck}
          label="Need your confirmation"
          value={needsAck.length}
          sub={needsAck.length === 0 ? 'You are all caught up' : 'Please read and confirm'}
          tone={needsAck.length > 0 ? 'amber' : 'green'}
        />
        <StatCard icon={Upload} label="You've sent us" value={myUploads.length} sub="Forms uploaded from your account" tone="violet" />
      </div>

      {needsAck.length > 0 && (
        <Card className="mt-6 border-[#F5B942]/50 bg-[#FDF1DC]/60 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[#8a6112]" />
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                {needsAck.length} {needsAck.length === 1 ? 'document needs' : 'documents need'} your confirmation
              </h2>
              <p className="mt-1 text-sm text-slate-700">
                Give {needsAck.length === 1 ? 'it' : 'them'} a read, then tap <strong>I've read this</strong> so we have
                it on record: {needsAck.map((d) => d.title).join(', ')}.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="mb-6 mt-6">
        <Tabs tabs={tabs} value={tab} onChange={(v) => setTab(v as 'all' | DocumentCategory)} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={query || tab !== 'all' ? 'Nothing matches that' : 'No documents shared yet'}
          description={
            query || tab !== 'all'
              ? 'Try another category or clear the search.'
              : 'Handbooks and forms will show up here as we share them.'
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
            {rows.map((d, i) => {
              const acked = hasAcknowledged(d.id)
              const mine = d.uploadedBy === user?.name
              return (
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
                      {d.category} · {bytes(d.size)} · {mine ? 'you sent this' : 'shared'} {fmtDate(d.uploadedAt)}
                    </p>
                  </div>

                  {d.requiresAck &&
                    (acked ? (
                      <Badge tone="green">
                        <CheckCircle2 size={12} /> Confirmed
                      </Badge>
                    ) : (
                      <Badge tone="amber">
                        <ShieldCheck size={12} /> Needs confirmation
                      </Badge>
                    ))}
                  {mine && <Badge tone="violet">Your upload</Badge>}

                  <div className="flex gap-1.5">
                    {d.requiresAck && !acked && (
                      <Button size="sm" variant="accent" onClick={() => onAcknowledge(d)}>
                        <CheckCircle2 size={14} /> I've read this
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => onDownload(d)}>
                      <Download size={14} /> Download
                    </Button>
                  </div>
                </motion.li>
              )
            })}
          </ul>
        </Card>
      )}

      <Card className="mt-8 p-5">
        <h2 className="font-display text-lg font-bold text-slate-900">Send us a form</h2>
        <p className="mt-1 text-sm text-slate-500">
          Immunization records, physicals, permission slips — anything we've asked for. Only Aunties Tykes staff can see
          what you upload here.
        </p>

        <div className="mt-4 max-w-xs">
          <Field label="What kind of document is it?">
            <Select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value as DocumentCategory)}>
              {documentCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-4">
          <FileUploader onUploaded={onUploaded} label="Drop your file here or browse" />
        </div>
      </Card>
    </PageTransition>
  )
}

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { FolderOpen, FileText, Download, ShieldCheck, CheckCircle2, Search, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
import { downloadDocument } from '../../lib/storage'
import { useSectionSeen } from '../../lib/unread'
import { documentCategories } from '../../data/content'
import type { DocumentCategory, DocumentRecord, UploadedFileMeta } from '../../types'

export default function ParentDocuments() {
  const { t } = useTranslation()
  const { user, familyId, documents } = useFamilyScope()
  const acknowledgements = useStore((s) => s.acknowledgements)
  const acknowledgeDocument = useStore((s) => s.acknowledgeDocument)
  const addDocument = useStore((s) => s.addDocument)
  const pushToast = useStore((s) => s.pushToast)
  const seen = useSectionSeen('documents')

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
      { value: 'all', label: t('billing.tabAll'), count: documents.length },
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
      storagePath: meta.storagePath,
      category: uploadCategory,
      visibleToParents: false,
      uploadedBy: user?.name ?? 'Parent',
      requiresAck: false,
    })
    pushToast({
      title: t('documents.toastThanksTitle'),
      description: t('documents.toastThanksDesc', { title: meta.title }),
    })
  }

  const onUploadError = (message: string) => {
    pushToast({ tone: 'error', title: t('documents.toastUploadFailedTitle'), description: message })
  }

  const onDownload = (doc: DocumentRecord) => {
    if (!doc.storagePath) {
      pushToast({
        tone: 'info',
        title: t('documents.toastNoFileTitle'),
        description: t('documents.toastNoFileDesc', { title: doc.title }),
      })
      return
    }
    void downloadDocument(doc.storagePath, doc.fileName)
      .catch(() => {
        pushToast({
          tone: 'error',
          title: t('documents.toastDownloadFailedTitle'),
          description: t('documents.toastDownloadFailedDesc'),
        })
      })
  }

  const onAcknowledge = (doc: DocumentRecord) => {
    acknowledgeDocument(doc.id)
    pushToast({ title: t('documents.toastAckTitle'), description: t('documents.toastAckDesc', { title: doc.title }) })
  }

  return (
    <PageTransition>
      <PageHeader
        title={t('documents.title')}
        description={t('documents.description')}
        actions={
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('documents.searchPlaceholder')}
              className="w-full pl-9 sm:w-56"
              aria-label={t('documents.searchPlaceholder')}
            />
          </div>
        }
      />

      <div className="grid gap-5 sm:grid-cols-3">
        <StatCard icon={FolderOpen} label={t('documents.statAvailable')} value={documents.length} sub={t('documents.statAvailableSub')} tone="blue" />
        <StatCard
          icon={ShieldCheck}
          label={t('documents.statNeedsConfirm')}
          value={needsAck.length}
          sub={needsAck.length === 0 ? t('documents.statNeedsConfirmSubClear') : t('documents.statNeedsConfirmSubSome')}
          tone={needsAck.length > 0 ? 'amber' : 'green'}
        />
        <StatCard icon={Upload} label={t('documents.statSent')} value={myUploads.length} sub={t('documents.statSentSub')} tone="violet" />
      </div>

      {needsAck.length > 0 && (
        <Card className="mt-6 border-[#F5B942]/50 bg-[#FDF1DC]/60 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[#8a6112]" />
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                {t('documents.needsAckTitle', { count: needsAck.length })}
              </h2>
              <p className="mt-1 text-sm text-slate-700">
                {t('documents.needsAckBody', {
                  count: needsAck.length,
                  cta: t('documents.iveReadThis'),
                  titles: needsAck.map((d) => d.title).join(', '),
                })}
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
          title={query || tab !== 'all' ? t('documents.noMatchTitle') : t('documents.noDocsTitle')}
          description={
            query || tab !== 'all'
              ? t('documents.noMatchDesc')
              : t('documents.noDocsDesc')
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
                {t('documents.showEverything')}
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
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E8F3EE] text-[#3F8570]">
                    <FileText size={19} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-bold text-slate-900">{d.title}</p>
                    <p className="truncate text-xs text-slate-500">
                      {d.category} · {bytes(d.size)} · {mine ? t('documents.youSentThis') : t('documents.shared')} {fmtDate(d.uploadedAt)}
                    </p>
                  </div>

                  {!mine && seen.isNew(d.uploadedAt) && <Badge tone="violet">{t('common.new')}</Badge>}
                  {d.requiresAck &&
                    (acked ? (
                      <Badge tone="green">
                        <CheckCircle2 size={12} /> {t('documents.confirmed')}
                      </Badge>
                    ) : (
                      <Badge tone="amber">
                        <ShieldCheck size={12} /> {t('documents.needsConfirmation')}
                      </Badge>
                    ))}
                  {mine && <Badge tone="violet">{t('documents.yourUpload')}</Badge>}

                  <div className="flex gap-1.5">
                    {d.requiresAck && !acked && (
                      <Button size="sm" variant="accent" onClick={() => onAcknowledge(d)}>
                        <CheckCircle2 size={14} /> {t('documents.iveReadThis')}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => onDownload(d)}>
                      <Download size={14} /> {t('documents.download')}
                    </Button>
                  </div>
                </motion.li>
              )
            })}
          </ul>
        </Card>
      )}

      <Card className="mt-8 p-5">
        <h2 className="font-display text-lg font-bold text-slate-900">{t('documents.sendUsForm')}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {t('documents.sendUsFormDesc')}
        </p>

        <div className="mt-4 max-w-xs">
          <Field label={t('documents.whatKind')}>
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
          <FileUploader
            prefix={`family/${familyId}`}
            onUploaded={onUploaded}
            onError={onUploadError}
            label={t('documents.dropFile')}
          />
        </div>
      </Card>
    </PageTransition>
  )
}

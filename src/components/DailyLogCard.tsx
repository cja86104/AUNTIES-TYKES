import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Utensils, Moon, UserRound, Smile, Sparkles, NotebookPen, Paperclip, ImageOff, AlertTriangle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card, Badge, Avatar } from './ui'
import { bytes, fmtDay, fmtTime } from '../lib/helpers'
import { downloadDocument, isInlineImage, viewDocumentUrl } from '../lib/storage'
import { useStore } from '../store/useStore'
import type { Child, DailyLog, Incident, LogAttachment } from '../types'

interface RowProps {
  icon: LucideIcon
  label: string
  children: ReactNode
}

const Row = ({ icon: Icon, label, children }: RowProps) => (
  <div className="flex gap-3">
    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
      <Icon size={15} />
    </span>
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-slate-700">{children}</p>
    </div>
  </div>
)

/**
 * One attached photo. The bucket is private, so the image source is a signed
 * URL fetched when the card mounts; tapping it opens the full-size photo.
 */
function AttachmentPhoto({ attachment }: { attachment: LogAttachment }) {
  const { t } = useTranslation()
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    setFailed(false)
    viewDocumentUrl(attachment.storagePath)
      .then((signed) => {
        if (!cancelled) setUrl(signed)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [attachment.storagePath])

  return (
    <figure className="w-40 shrink-0">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block h-28 w-full overflow-hidden rounded-xl bg-slate-100"
          aria-label={t('dailyLogCard.openPhoto', { name: attachment.fileName })}
        >
          <img
            src={url}
            alt={attachment.fileName}
            className="h-full w-full object-cover transition duration-500 hover:scale-105"
            loading="lazy"
          />
        </a>
      ) : (
        <div className="flex h-28 w-full items-center justify-center rounded-xl bg-slate-100 text-slate-400">
          {failed ? <ImageOff size={20} aria-label={t('dailyLogCard.photoUnavailable')} /> : null}
        </div>
      )}
      <figcaption className="mt-1.5 truncate text-xs text-slate-500">{attachment.fileName}</figcaption>
    </figure>
  )
}

/** Photos and files attached to the note home. Renders nothing when there are none. */
function LogAttachments({ attachments }: { attachments: LogAttachment[] }) {
  const { t } = useTranslation()
  const pushToast = useStore((s) => s.pushToast)
  if (attachments.length === 0) return null

  const photos = attachments.filter((a) => isInlineImage(a.fileName))
  const files = attachments.filter((a) => !isInlineImage(a.fileName))

  const onDownload = (a: LogAttachment) => {
    void downloadDocument(a.storagePath, a.fileName).catch(() => {
      pushToast({ tone: 'error', title: t('dailyLogCard.fileError') })
    })
  }

  return (
    <div className="space-y-3 border-t border-slate-100 px-5 py-4">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('dailyLogCard.attachments')}</p>
      {photos.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {photos.map((a) => (
            <AttachmentPhoto key={a.storagePath} attachment={a} />
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((a) => (
            <button
              key={a.storagePath}
              type="button"
              onClick={() => onDownload(a)}
              className="inline-flex min-h-[2.75rem] max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:border-[#3F8570] hover:text-[#3F8570] sm:min-h-0"
            >
              <Paperclip size={14} className="shrink-0" />
              <span className="truncate">{a.fileName}</span>
              <span className="shrink-0 text-xs font-normal text-slate-400">· {bytes(a.size)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** One labelled line of the incident report. */
const IncidentRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <p className="text-xs font-bold uppercase tracking-wider text-rose-700/80">{label}</p>
    <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-slate-800">{children}</p>
  </div>
)

function IncidentPanel({ incident, footer }: { incident: Incident; footer?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="border-t border-rose-100 bg-rose-50/60 px-5 py-4">
      <p className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-rose-800">
        <AlertTriangle size={16} /> {t('dailyLogCard.incidentTitle')}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <IncidentRow label={t('dailyLogCard.incidentTime')}>{fmtTime(incident.time)}</IncidentRow>
        <IncidentRow label={t('dailyLogCard.incidentLocation')}>{incident.location}</IncidentRow>
        <div className="sm:col-span-2">
          <IncidentRow label={t('dailyLogCard.incidentWhat')}>{incident.description}</IncidentRow>
        </div>
        <IncidentRow label={t('dailyLogCard.incidentInjury')}>{incident.injury || '—'}</IncidentRow>
        <IncidentRow label={t('dailyLogCard.incidentFirstAid')}>{incident.firstAid || '—'}</IncidentRow>
        <IncidentRow label={t('dailyLogCard.incidentWitness')}>{incident.witnessedBy || '—'}</IncidentRow>
        <IncidentRow label={t('dailyLogCard.incidentNotified')}>{incident.parentNotified}</IncidentRow>
      </div>
      {footer && <div className="mt-4 border-t border-rose-100 pt-3">{footer}</div>}
    </div>
  )
}

export interface DailyLogCardProps {
  log: DailyLog
  child?: Child | undefined
  index?: number
  actions?: ReactNode
  /**
   * Shown under the incident report, when there is one: the parent's
   * acknowledge button in the portal, who has acknowledged it in the console.
   */
  incidentFooter?: ReactNode
  /** Shows a "New" pill: posted since the reader last opened Daily reports. */
  isNew?: boolean
}

export default function DailyLogCard({ log, child, index = 0, actions, incidentFooter, isNew = false }: DailyLogCardProps) {
  const { t } = useTranslation()
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.4), duration: 0.4 }}
    >
      <Card hover className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4">
          <div className="flex items-center gap-3">
            <Avatar name={child?.name ?? 'Child'} hue={child?.hue} size="md" />
            <div>
              <p className="font-display text-base font-bold text-slate-900">{child?.name ?? 'Child'}</p>
              <p className="text-xs text-slate-500">{fmtDay(log.date)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isNew && <Badge tone="violet">{t('common.new')}</Badge>}
            {log.incident && (
              <Badge tone="rose">
                <AlertTriangle size={12} /> {t('dailyLogCard.incidentBadge')}
              </Badge>
            )}
            <Badge tone="amber">
              <Smile size={12} /> {log.mood}
            </Badge>
            {actions}
          </div>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Row icon={Utensils} label={t('dailyLogCard.meals')}>{log.meals}</Row>
          <Row icon={Moon} label={t('dailyLogCard.naps')}>{log.naps}</Row>
          <Row icon={UserRound} label={t('dailyLogCard.diapersPotty')}>{log.potty}</Row>
          <Row icon={Sparkles} label={t('dailyLogCard.activities')}>{log.activities.join(' · ')}</Row>
          <div className="sm:col-span-2">
            <Row icon={NotebookPen} label={t('dailyLogCard.noteFrom', { author: log.author || t('dailyLogCard.defaultAuthor') })}>{log.notes || '—'}</Row>
          </div>
        </div>

        {log.incident && <IncidentPanel incident={log.incident} footer={incidentFooter} />}

        <LogAttachments attachments={log.attachments} />

        {log.photos.length > 0 && (
          <div className="flex gap-3 overflow-x-auto border-t border-slate-100 px-5 py-4">
            {log.photos.map((p) => (
              <figure key={p.slot} className="w-52 shrink-0">
                <div className="h-32 w-full overflow-hidden rounded-xl bg-slate-100">
                  <img
                    data-aiwp-slot={p.slot}
                    src={p.url}
                    alt={p.caption || t('dailyLogCard.photoAlt')}
                    className="h-full w-full object-cover transition duration-500 hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <figcaption className="mt-1.5 text-xs text-slate-500">{p.caption}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  )
}

import React, { useMemo, useRef, useState } from 'react'
import { NotebookPen, Plus, Trash2, Pencil, Search, CalendarDays, X, Paperclip, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import {
  Card,
  Button,
  Badge,
  PageHeader,
  Modal,
  Field,
  Input,
  Textarea,
  Select,
  EmptyState,
  Tabs,
} from '../../components/ui'
import DailyLogCard from '../../components/DailyLogCard'
import FileUploader from '../../components/FileUploader'
import { useStore } from '../../store/useStore'
import { bytes, todayISO, fmtDate, isFilled, nowISO, nowTime } from '../../lib/helpers'
import { removeDocumentFile } from '../../lib/storage'
import { useSectionSeen } from '../../lib/unread'
import type { DailyLog, Incident, LogAttachment, UploadedFileMeta } from '../../types'

const moodOptions = [
  'Cheerful',
  'Sleepy but sweet',
  'Busy & curious',
  'Snuggly',
  'Silly',
  'Focused',
  'Tender',
  'Grumpy',
  'Tired',
  'Feeling sick',
]

interface LogForm {
  childId: string
  date: string
  meals: string
  naps: string
  potty: string
  mood: string
  activities: string
  notes: string
}

type LogErrors = Partial<Record<keyof LogForm, string>>

/** The incident details she types; `recordedAt` is stamped on save. */
type IncidentForm = Omit<Incident, 'recordedAt'>
type IncidentErrors = Partial<Record<keyof IncidentForm, string>>

const INCIDENT_FIELDS = [
  'time',
  'location',
  'description',
  'injury',
  'firstAid',
  'witnessedBy',
  'parentNotified',
] as const satisfies readonly (keyof IncidentForm)[]

const emptyIncident = (): IncidentForm => ({
  time: nowTime(),
  location: '',
  description: '',
  injury: '',
  firstAid: '',
  witnessedBy: '',
  parentNotified: '',
})

const trimIncident = (i: IncidentForm): IncidentForm => ({
  time: i.time,
  location: i.location.trim(),
  description: i.description.trim(),
  injury: i.injury.trim(),
  firstAid: i.firstAid.trim(),
  witnessedBy: i.witnessedBy.trim(),
  parentNotified: i.parentNotified.trim(),
})

/** Photos and PDFs only — what the family sees on the report. */
const ATTACHMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.heic'

/** Best-effort removal of a stored file nothing points at any more. */
const discardFile = (storagePath: string) => {
  void removeDocumentFile(storagePath).catch(() => {
    /* an orphaned object is harmless and unreadable by parents */
  })
}

const emptyForm: LogForm = {
  childId: '',
  date: todayISO(),
  meals: '',
  naps: '',
  potty: '',
  mood: 'Cheerful',
  activities: '',
  notes: '',
}

export default function AdminDailyLogs() {
  const children = useStore((s) => s.children)
  const dailyLogs = useStore((s) => s.dailyLogs)
  const addDailyLog = useStore((s) => s.addDailyLog)
  const updateDailyLog = useStore((s) => s.updateDailyLog)
  const deleteDailyLog = useStore((s) => s.deleteDailyLog)
  const users = useStore((s) => s.users)
  const incidentAcks = useStore((s) => s.incidentAcks)
  /** Marks parents' incident confirmations that came in since she last opened this page. */
  const seen = useSectionSeen('daily_reports')
  const pushToast = useStore((s) => s.pushToast)

  const active = useMemo(() => children.filter((c) => c.status === 'active'), [children])

  const [childFilter, setChildFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<LogForm>(emptyForm)
  const [errors, setErrors] = useState<LogErrors>({})
  const [confirmDelete, setConfirmDelete] = useState<DailyLog | null>(null)

  /** The incident on the report being written, or null when there is none. */
  const [incident, setIncident] = useState<IncidentForm | null>(null)
  const [incidentErrors, setIncidentErrors] = useState<IncidentErrors>({})
  /**
   * The incident as it was when an existing report was opened. Saving it
   * unchanged keeps its version, so parents who already acknowledged it are
   * not asked again; any change restamps it.
   */
  const [originalIncident, setOriginalIncident] = useState<Incident | null>(null)

  /** Files on the report being written, in the order they were added. */
  const [attachments, setAttachments] = useState<LogAttachment[]>([])
  /** True while a file is still uploading, so the report cannot post without it. */
  const [uploading, setUploading] = useState(false)
  /** Uploaded while this form has been open: deleted again if she cancels. */
  const staged = useRef<Set<string>>(new Set())
  /** Already saved on the report and taken off it: deleted once the change is saved. */
  const removed = useRef<string[]>([])
  /**
   * Which draft is on screen, bumped every time the form opens, posts or is
   * cancelled. A phone photo can still be uploading when she closes the form;
   * an upload that finishes for a draft that is gone is deleted rather than
   * landing on the next report she opens.
   */
  const [draftId, setDraftId] = useState(0)
  const liveDraft = useRef(0)

  const startDraft = () => {
    liveDraft.current += 1
    setDraftId(liveDraft.current)
    staged.current = new Set()
    removed.current = []
    setUploading(false)
  }

  const closeForm = () => {
    staged.current.forEach(discardFile)
    startDraft()
    setOpen(false)
  }

  const onAttachmentUploaded = (meta: UploadedFileMeta) => {
    if (draftId !== liveDraft.current) {
      discardFile(meta.storagePath)
      return
    }
    staged.current.add(meta.storagePath)
    setAttachments((list) => [...list, { storagePath: meta.storagePath, fileName: meta.fileName, size: meta.size }])
  }

  const onAttachmentBusy = (busy: boolean) => {
    if (draftId === liveDraft.current) setUploading(busy)
  }

  const onAttachmentError = (message: string) => {
    pushToast({ tone: 'error', title: 'That file was not uploaded', description: message })
  }

  const removeAttachment = (attachment: LogAttachment) => {
    setAttachments((list) => list.filter((a) => a.storagePath !== attachment.storagePath))
    if (staged.current.has(attachment.storagePath)) {
      staged.current.delete(attachment.storagePath)
      discardFile(attachment.storagePath)
    } else {
      removed.current.push(attachment.storagePath)
    }
  }

  const logs = useMemo(() => {
    const q = query.trim().toLowerCase()
    return dailyLogs
      .filter((l) => (childFilter === 'all' ? true : l.childId === childFilter))
      .filter((l) => (dateFilter ? l.date === dateFilter : true))
      .filter((l) => {
        if (!q) return true
        const text = `${l.meals} ${l.naps} ${l.potty} ${l.mood} ${l.notes} ${l.activities.join(' ')} ${l.incident?.description ?? ''}`.toLowerCase()
        return text.includes(q)
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [dailyLogs, childFilter, dateFilter, query])

  const openNew = () => {
    startDraft()
    setEditingId(null)
    setForm({ ...emptyForm, childId: active[0]?.id ?? '' })
    setAttachments([])
    setIncident(null)
    setOriginalIncident(null)
    setIncidentErrors({})
    setErrors({})
    setOpen(true)
  }

  const openEdit = (log: DailyLog) => {
    startDraft()
    setEditingId(log.id)
    setAttachments(log.attachments)
    setOriginalIncident(log.incident)
    setIncident(log.incident ? trimIncident(log.incident) : null)
    setIncidentErrors({})
    setForm({
      childId: log.childId,
      date: log.date,
      // Older reports stored "—" for an empty section; the form shows it as empty.
      meals: isFilled(log.meals) ? log.meals : '',
      naps: isFilled(log.naps) ? log.naps : '',
      potty: isFilled(log.potty) ? log.potty : '',
      mood: log.mood,
      activities: log.activities.join('\n'),
      notes: isFilled(log.notes) ? log.notes : '',
    })
    setErrors({})
    setOpen(true)
  }

  const set =
    (key: keyof LogForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  const setIncidentField =
    (key: keyof IncidentForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = e.target.value
      setIncident((i) => (i ? { ...i, [key]: value } : i))
    }

  const validate = () => {
    const next: LogErrors = {}
    if (!form.childId) next.childId = 'Pick a child'
    if (!form.date) next.date = 'Pick a date'
    // Every section is optional — the report shows only what was filled in —
    // but a report with nothing in it at all is not posted.
    const hasContent =
      [form.meals, form.naps, form.potty, form.mood, form.activities, form.notes].some(isFilled) ||
      attachments.length > 0 ||
      incident !== null
    if (!hasContent) next.notes = 'Fill in at least one section before posting'
    setErrors(next)

    const nextIncident: IncidentErrors = {}
    if (incident) {
      if (!incident.time) nextIncident.time = 'When did it happen?'
      if (!incident.location.trim()) nextIncident.location = 'Where did it happen?'
      if (!incident.description.trim()) nextIncident.description = 'Describe what happened'
      if (!incident.parentNotified.trim()) nextIncident.parentNotified = 'How and when was the parent told?'
    }
    setIncidentErrors(nextIncident)
    return Object.keys(next).length === 0 && Object.keys(nextIncident).length === 0
  }

  /** The incident to save, keeping its version when nothing in it changed. */
  const incidentToSave = (): Incident | null => {
    if (!incident) return null
    const details = trimIncident(incident)
    const unchanged =
      originalIncident !== null && INCIDENT_FIELDS.every((k) => details[k] === originalIncident[k].trim())
    return { ...details, recordedAt: unchanged && originalIncident ? originalIncident.recordedAt : nowISO() }
  }

  /** Under an incident in the list: which parents have read the current version. */
  const incidentFooter = (log: DailyLog) => {
    if (!log.incident) return undefined
    const version = log.incident.recordedAt
    const current = incidentAcks.filter((a) => a.logId === log.id && a.version === version)
    if (current.length > 0) {
      return (
        <ul className="space-y-1">
          {current.map((a) => (
            <li key={a.profileId} className="flex items-center gap-2 text-sm font-semibold text-[#2E8C72]">
              <CheckCircle2 size={15} />
              Acknowledged by {users.find((u) => u.id === a.profileId)?.name ?? 'a parent'} ·{' '}
              {fmtDate(a.acknowledgedAt, 'MMM d, h:mm a')}
              {seen.isNew(a.acknowledgedAt) && <Badge tone="violet">New</Badge>}
            </li>
          ))}
        </ul>
      )
    }
    const ackedEarlierVersion = incidentAcks.some((a) => a.logId === log.id)
    return (
      <p className="flex items-center gap-2 text-sm text-rose-900">
        <Clock size={15} />
        {ackedEarlierVersion
          ? 'Edited after a parent acknowledged it — waiting for them to confirm the new version.'
          : 'Waiting for a parent to acknowledge.'}
      </p>
    )
  }

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Posting mid-upload would save the report without the file and leave it behind.
    if (uploading) return
    if (!validate()) return
    const payload = {
      childId: form.childId,
      date: form.date,
      meals: form.meals.trim(),
      naps: form.naps.trim(),
      potty: form.potty.trim(),
      mood: form.mood,
      activities: form.activities
        .split('\n')
        .map((a) => a.trim())
        .filter(Boolean),
      notes: form.notes.trim(),
      attachments,
      incident: incidentToSave(),
    }
    const childName = children.find((c) => c.id === form.childId)?.name.split(' ')[0] ?? 'Child'
    if (editingId) {
      updateDailyLog(editingId, payload)
      pushToast({ title: 'Report updated', description: `${childName}'s ${fmtDate(form.date)} report was saved.` })
    } else {
      addDailyLog(payload)
      pushToast({ title: 'Report posted', description: `${childName}'s report is now visible to their family.` })
    }
    // The staged files are now on the saved report, so they are kept; the ones
    // she took off are no longer referenced and go.
    removed.current.forEach(discardFile)
    startDraft()
    setOpen(false)
  }

  const doDelete = () => {
    if (!confirmDelete) return
    confirmDelete.attachments.forEach((a) => {
      void removeDocumentFile(a.storagePath).catch((error: unknown) => {
        pushToast({
          tone: 'error',
          title: 'The report went, a file stayed',
          description: error instanceof Error ? error.message : `${a.fileName} could not be removed.`,
        })
      })
    })
    deleteDailyLog(confirmDelete.id)
    setConfirmDelete(null)
    pushToast({ tone: 'info', title: 'Report deleted' })
  }

  const tabs = useMemo(
    () => [
      { value: 'all', label: 'All children', count: dailyLogs.length },
      ...active.map((c) => ({
        value: c.id,
        label: c.name.split(' ')[0] ?? c.name,
        count: dailyLogs.filter((l) => l.childId === c.id).length,
      })),
    ],
    [active, dailyLogs],
  )

  const filtersActive = Boolean(query || dateFilter || childFilter !== 'all')

  return (
    <PageTransition>
      <PageHeader
        title="Daily logs"
        description="Write the report parents read at pickup — meals, naps, diapers, mood, activities, and a personal note."
        actions={
          <>
            <div className="relative w-full sm:w-auto">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search reports…"
                className="w-full pl-9 sm:w-56"
                aria-label="Search daily logs"
              />
            </div>
            <div className="relative w-full sm:w-auto">
              <CalendarDays size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="date"
                value={dateFilter}
                max={todayISO()}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full pl-9 sm:w-44"
                aria-label="Filter by date"
              />
            </div>
            <Button onClick={openNew} className="ml-auto sm:ml-0">
              <Plus size={16} /> New report
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Tabs tabs={tabs} value={childFilter} onChange={setChildFilter} />
        {filtersActive && (
          <button
            onClick={() => {
              setQuery('')
              setDateFilter('')
              setChildFilter('all')
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            <X size={13} /> Clear filters
          </button>
        )}
        <Badge tone="neutral">
          {logs.length} {logs.length === 1 ? 'report' : 'reports'}
        </Badge>
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title={filtersActive ? 'No reports match those filters' : 'No daily reports yet'}
          description={
            filtersActive
              ? 'Try a different child or clear the date filter to see the full history.'
              : 'Write the first report of the day and it will appear in the family’s portal right away.'
          }
          action={
            filtersActive ? (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery('')
                  setDateFilter('')
                  setChildFilter('all')
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button onClick={openNew}>
                <Plus size={16} /> Write a report
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {logs.map((log, i) => (
            <DailyLogCard
              key={log.id}
              log={log}
              child={children.find((c) => c.id === log.childId)}
              index={i}
              incidentFooter={incidentFooter(log)}
              actions={
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(log)}
                    aria-label={`Edit report from ${fmtDate(log.date)}`}
                    className="inline-flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center sm:min-h-0 sm:min-w-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-[#3F8570]"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(log)}
                    aria-label={`Delete report from ${fmtDate(log.date)}`}
                    className="inline-flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center sm:min-h-0 sm:min-w-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-rose-600"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              }
            />
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={closeForm}
        wide
        title={editingId ? 'Edit daily report' : 'New daily report'}
        description="Parents see this in their portal the moment you save it."
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Child" error={errors.childId}>
              <Select value={form.childId} onChange={set('childId')} invalid={Boolean(errors.childId)}>
                <option value="">Select a child…</option>
                {active.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date" error={errors.date}>
              <Input type="date" value={form.date} max={todayISO()} onChange={set('date')} invalid={Boolean(errors.date)} />
            </Field>
          </div>

          <Field label="Meals" error={errors.meals} hint="Breakfast, lunch, and snack — and how much they ate.">
            <Textarea rows={3} value={form.meals} onChange={set('meals')} invalid={Boolean(errors.meals)} placeholder="Breakfast: oatmeal with banana (all) · Lunch: …" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Naps" error={errors.naps}>
              <Input value={form.naps} onChange={set('naps')} invalid={Boolean(errors.naps)} placeholder="12:45–2:30 PM" />
            </Field>
            <Field label="Diapers / potty">
              <Input value={form.potty} onChange={set('potty')} placeholder="4 changes · 2 potty trips" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mood">
              <Select value={form.mood} onChange={set('mood')}>
                <option value="">Not noted</option>
                {moodOptions.map((m) => (
                  <option key={m}>{m}</option>
                ))}
                {/* A mood Ro wrote in its own words stays selectable, so saving does not change it. */}
                {isFilled(form.mood) && !moodOptions.includes(form.mood) && <option>{form.mood}</option>}
              </Select>
            </Field>
            <Field label="Activities" hint="One per line.">
              <Textarea rows={3} value={form.activities} onChange={set('activities')} placeholder={'Morning circle\nSensory bin\nOutdoor bike path'} />
            </Field>
          </div>

          <Field label="Note home" hint="The line the family will actually remember.">
            <Textarea rows={3} value={form.notes} onChange={set('notes')} placeholder="Asked to help set the table today — so proud of that job." />
          </Field>

          {/* A div, not <Field>: Field is a <label>, and a tap on a label fires its first button — here, a remove. */}
          <div>
            <p className="mb-1.5 text-sm font-semibold text-slate-700">Photos &amp; files (optional)</p>
            {attachments.length > 0 && (
              <ul className="mb-3 space-y-2">
                {attachments.map((a) => (
                  <li key={a.storagePath} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <Paperclip size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{a.fileName}</p>
                      <p className="text-xs text-slate-500">{bytes(a.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(a)}
                      className="inline-flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center sm:min-h-0 sm:min-w-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                      aria-label={`Remove ${a.fileName}`}
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <FileUploader
              // Keyed to the draft so each report starts with an empty upload queue.
              key={draftId}
              prefix="admin"
              accept={ATTACHMENT_ACCEPT}
              label="Add photos or a PDF for the family"
              onUploaded={onAttachmentUploaded}
              onError={onAttachmentError}
              onBusyChange={onAttachmentBusy}
            />
            <p className="mt-1 text-xs text-slate-500">The family sees these with the report in their portal.</p>
          </div>

          {incident ? (
            <div className="space-y-4 rounded-2xl border border-rose-200 bg-rose-50/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-display text-sm font-bold text-rose-800">
                  <AlertTriangle size={16} /> Incident / injury report
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIncident(null)
                    setIncidentErrors({})
                  }}
                >
                  <X size={14} /> Remove incident
                </Button>
              </div>
              <p className="text-xs text-rose-900/80">
                The family sees this on the report and is asked to confirm they have read it.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Time" error={incidentErrors.time}>
                  <Input type="time" value={incident.time} onChange={setIncidentField('time')} invalid={Boolean(incidentErrors.time)} />
                </Field>
                <Field label="Where it happened" error={incidentErrors.location}>
                  <Input value={incident.location} onChange={setIncidentField('location')} invalid={Boolean(incidentErrors.location)} placeholder="Backyard, by the slide" />
                </Field>
              </div>
              <Field label="What happened" error={incidentErrors.description}>
                <Textarea rows={3} value={incident.description} onChange={setIncidentField('description')} invalid={Boolean(incidentErrors.description)} placeholder="Tripped running to the slide and landed on both hands." />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Injury and body part" hint="Leave blank if nobody was hurt.">
                  <Input value={incident.injury} onChange={setIncidentField('injury')} placeholder="Small scrape on left palm" />
                </Field>
                <Field label="First aid given">
                  <Input value={incident.firstAid} onChange={setIncidentField('firstAid')} placeholder="Washed, bandage, ice pack for 5 min" />
                </Field>
                <Field label="Witnessed by">
                  <Input value={incident.witnessedBy} onChange={setIncidentField('witnessedBy')} placeholder="Auntie Melissa" />
                </Field>
                <Field label="Parent notified" error={incidentErrors.parentNotified} hint="How and when.">
                  <Input value={incident.parentNotified} onChange={setIncidentField('parentNotified')} invalid={Boolean(incidentErrors.parentNotified)} placeholder="Called Mom at 2:40 PM" />
                </Field>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => setIncident(emptyIncident())}>
              <AlertTriangle size={16} /> Record an incident or injury
            </Button>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit" disabled={uploading}>
              {uploading ? 'Waiting for the upload…' : editingId ? 'Save changes' : 'Post report'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Delete this report?"
        description={
          confirmDelete
            ? `${children.find((c) => c.id === confirmDelete.childId)?.name ?? 'This child'} · ${fmtDate(confirmDelete.date)}`
            : ''
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={doDelete}>
              <Trash2 size={16} /> Delete report
            </Button>
          </>
        }
      >
        <Card className="bg-rose-50/60 p-4 text-sm text-rose-900">
          The family will no longer see this report in their portal. This cannot be undone.
        </Card>
      </Modal>
    </PageTransition>
  )
}

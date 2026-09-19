import { useMemo, useState } from 'react'
import { addDays, format } from 'date-fns'
import { CalendarDays, Plus, Pencil, Trash2, Lock, Users } from 'lucide-react'
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
  Tabs,
  Textarea,
} from '../../components/ui'
import type { Tone } from '../../components/ui'
import { useStore } from '../../store/useStore'
import { buildCalendar } from '../../lib/calendar'
import type { CalendarEntry, CalendarEntryKind } from '../../lib/calendar'
import { fmtDate, fmtTime, todayISO } from '../../lib/helpers'
import type { CalendarEvent, CalendarEventKind } from '../../types'

const KIND_META: Record<CalendarEntryKind, { label: string; tone: Tone }> = {
  closure: { label: 'Closed', tone: 'rose' },
  early_close: { label: 'Early close', tone: 'amber' },
  activity: { label: 'Activity', tone: 'blue' },
  reminder: { label: 'Reminder', tone: 'neutral' },
  schedule_exception: { label: 'Schedule change', tone: 'amber' },
  birthday: { label: 'Birthday', tone: 'green' },
  payment_due: { label: 'Payment due', tone: 'amber' },
}

/** Only these can be authored; birthdays and due dates are derived. */
const AUTHORABLE: { value: CalendarEventKind; label: string }[] = [
  { value: 'closure', label: 'Closed all day' },
  { value: 'early_close', label: 'Closing early' },
  { value: 'activity', label: 'Activity or theme day' },
  { value: 'reminder', label: 'Reminder for families' },
  { value: 'schedule_exception', label: 'One child not coming' },
]

interface Draft {
  kind: CalendarEventKind
  title: string
  note: string
  startsOn: string
  endsOn: string
  closesAt: string
  childId: string
  visibleToParents: boolean
}

const emptyDraft = (): Draft => ({
  kind: 'closure',
  title: '',
  note: '',
  startsOn: todayISO(),
  endsOn: '',
  closesAt: '',
  childId: '',
  visibleToParents: true,
})

type Errors = Partial<Record<'title' | 'startsOn' | 'endsOn' | 'closesAt' | 'childId', string>>

export default function AdminCalendar() {
  const calendarEvents = useStore((s) => s.calendarEvents)
  const children = useStore((s) => s.children)
  const invoices = useStore((s) => s.invoices)
  const addCalendarEvent = useStore((s) => s.addCalendarEvent)
  const updateCalendarEvent = useStore((s) => s.updateCalendarEvent)
  const deleteCalendarEvent = useStore((s) => s.deleteCalendarEvent)
  const pushToast = useStore((s) => s.pushToast)

  const [tab, setTab] = useState('upcoming')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [errors, setErrors] = useState<Errors>({})
  const [confirmDelete, setConfirmDelete] = useState<CalendarEntry | null>(null)

  const today = todayISO()
  const range = useMemo(
    () =>
      tab === 'upcoming'
        ? { from: today, to: format(addDays(new Date(), 365), 'yyyy-MM-dd') }
        : { from: format(addDays(new Date(), -120), 'yyyy-MM-dd'), to: today },
    [tab, today],
  )

  const entries = useMemo(
    () => buildCalendar({ events: calendarEvents, children, invoices, from: range.from, to: range.to }),
    [calendarEvents, children, invoices, range],
  )

  const byMonth = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>()
    const ordered = tab === 'upcoming' ? entries : [...entries].reverse()
    for (const entry of ordered) {
      const key = entry.date.slice(0, 7)
      const list = map.get(key)
      if (list) list.push(entry)
      else map.set(key, [entry])
    }
    return [...map.entries()]
  }, [entries, tab])

  const childName = (id: string | undefined): string =>
    children.find((c) => c.id === id)?.name ?? 'this child'

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const openAdd = () => {
    setEditing(null)
    setDraft(emptyDraft())
    setErrors({})
    setOpen(true)
  }

  const openEdit = (event: CalendarEvent) => {
    setEditing(event.id)
    setDraft({
      kind: event.kind,
      title: event.title,
      note: event.note,
      startsOn: event.startsOn,
      endsOn: event.endsOn ?? '',
      closesAt: event.closesAt ?? '',
      childId: event.childId ?? '',
      visibleToParents: event.visibleToParents,
    })
    setErrors({})
    setOpen(true)
  }

  const save = () => {
    const next: Errors = {}
    if (draft.title.trim().length < 2) next.title = 'Give it a short name'
    if (!draft.startsOn) next.startsOn = 'Pick a date'
    if (draft.endsOn && draft.endsOn < draft.startsOn) next.endsOn = 'The end date comes before the start'
    if (draft.kind === 'early_close' && !draft.closesAt) next.closesAt = 'What time does care end?'
    if (draft.kind === 'schedule_exception' && !draft.childId) next.childId = 'Choose the child'
    setErrors(next)
    if (Object.keys(next).length) return

    const payload = {
      kind: draft.kind,
      title: draft.title.trim(),
      note: draft.note.trim(),
      startsOn: draft.startsOn,
      endsOn: draft.endsOn || undefined,
      closesAt: draft.kind === 'early_close' ? draft.closesAt : undefined,
      childId: draft.kind === 'schedule_exception' ? draft.childId : undefined,
      visibleToParents: draft.visibleToParents,
    }

    if (editing) {
      updateCalendarEvent(editing, payload)
      pushToast({ title: 'Calendar updated' })
    } else {
      addCalendarEvent(payload)
      pushToast({ title: 'Added to the calendar', description: fmtDate(draft.startsOn) })
    }
    setOpen(false)
  }

  const doDelete = () => {
    if (!confirmDelete) return
    deleteCalendarEvent(confirmDelete.id)
    pushToast({ tone: 'info', title: 'Removed from the calendar' })
    setConfirmDelete(null)
  }

  return (
    <PageTransition>
      <PageHeader
        title="Family Calendar"
        description="Closures, early pickups, activities and reminders. Birthdays and payment dates appear on their own."
        actions={
          <Button onClick={openAdd}>
            <Plus size={16} /> Add to calendar
          </Button>
        }
      />

      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'upcoming', label: 'Upcoming', count: entries.length },
          { value: 'past', label: 'Past' },
        ]}
      />

      {byMonth.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={tab === 'upcoming' ? 'Nothing on the calendar yet' : 'Nothing in the last few months'}
          description={
            tab === 'upcoming'
              ? 'Add a holiday closure, an early pickup day, or a reminder for families.'
              : 'Past closures and activities will collect here.'
          }
          action={
            tab === 'upcoming' ? (
              <Button onClick={openAdd}>
                <Plus size={16} /> Add to calendar
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-8">
          {byMonth.map(([month, list]) => (
            <section key={month}>
              <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-slate-500">
                {fmtDate(`${month}-01`, 'MMMM yyyy')}
              </h2>
              <div className="space-y-2.5">
                {list.map((entry) => {
                  const meta = KIND_META[entry.kind]
                  const source = calendarEvents.find((e) => e.id === entry.id)
                  return (
                    <Card key={entry.id} className="flex items-start gap-4 p-4">
                      <div className="w-14 shrink-0 text-center">
                        <div className="font-display text-xl font-black leading-none text-slate-900">
                          {fmtDate(entry.date, 'd')}
                        </div>
                        <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          {fmtDate(entry.date, 'EEE')}
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          {entry.derived && <Badge tone="neutral">Automatic</Badge>}
                          {!entry.derived &&
                            (entry.visibleToParents ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                                <Users size={12} /> Families can see this
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                                <Lock size={12} /> Only you
                              </span>
                            ))}
                        </div>
                        <p className="mt-1.5 font-semibold text-slate-900">{entry.title}</p>
                        {entry.endsOn && (
                          <p className="text-xs text-slate-500">through {fmtDate(entry.endsOn)}</p>
                        )}
                        {entry.closesAt && (
                          <p className="text-xs text-slate-500">Care ends at {fmtTime(entry.closesAt)}</p>
                        )}
                        {entry.kind === 'schedule_exception' && (
                          <p className="text-xs text-slate-500">{childName(entry.childId)}</p>
                        )}
                        {entry.note && <p className="mt-1 text-sm text-slate-600">{entry.note}</p>}
                      </div>

                      {source && (
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(source)}
                            aria-label={`Edit ${entry.title}`}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[#4F77D9]"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(entry)}
                            aria-label={`Remove ${entry.title}`}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit calendar entry' : 'Add to the calendar'}
        description="Families see anything you mark as shared."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>{editing ? 'Save changes' : 'Add it'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="What is it?">
            <Select value={draft.kind} onChange={(e) => set('kind', e.target.value as CalendarEventKind)}>
              {AUTHORABLE.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>

          {draft.kind === 'schedule_exception' && (
            <Field label="Which child?" error={errors.childId}>
              <Select value={draft.childId} onChange={(e) => set('childId', e.target.value)}>
                <option value="">Choose a child…</option>
                {children
                  .filter((c) => c.status === 'active')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </Field>
          )}

          <Field label="Name" error={errors.title} hint="Short — this is what families see first.">
            <Input
              value={draft.title}
              invalid={Boolean(errors.title)}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Thanksgiving — closed"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" error={errors.startsOn}>
              <Input
                type="date"
                value={draft.startsOn}
                invalid={Boolean(errors.startsOn)}
                onChange={(e) => set('startsOn', e.target.value)}
              />
            </Field>
            <Field label="Through (optional)" error={errors.endsOn} hint="For a closure that spans days.">
              <Input
                type="date"
                value={draft.endsOn}
                invalid={Boolean(errors.endsOn)}
                onChange={(e) => set('endsOn', e.target.value)}
              />
            </Field>
          </div>

          {draft.kind === 'early_close' && (
            <Field label="Care ends at" error={errors.closesAt}>
              <Input
                type="time"
                value={draft.closesAt}
                invalid={Boolean(errors.closesAt)}
                onChange={(e) => set('closesAt', e.target.value)}
              />
            </Field>
          )}

          <Field label="Note (optional)" hint="Anything families should know.">
            <Textarea
              rows={3}
              value={draft.note}
              onChange={(e) => set('note', e.target.value)}
              placeholder="We reopen Monday at the usual time."
            />
          </Field>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-slate-50 p-4">
            <input
              type="checkbox"
              checked={draft.visibleToParents}
              onChange={(e) => set('visibleToParents', e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-[#4F77D9]"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Show this to families</span>
              <span className="block text-xs text-slate-500">
                Turn it off to keep it on your own calendar only.
              </span>
            </span>
          </label>
        </div>
      </Modal>

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Remove this from the calendar?"
        description={confirmDelete?.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={doDelete}>
              Remove
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Families will stop seeing it straight away. This cannot be undone.
        </p>
      </Modal>
    </PageTransition>
  )
}

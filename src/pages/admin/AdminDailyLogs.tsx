import React, { useMemo, useState } from 'react'
import { NotebookPen, Plus, Trash2, Pencil, Search, CalendarDays, X } from 'lucide-react'
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
import { useStore } from '../../store/useStore'
import { todayISO, fmtDate } from '../../lib/helpers'
import type { DailyLog } from '../../types'

const moodOptions = ['Cheerful', 'Sleepy but sweet', 'Busy & curious', 'Snuggly', 'Silly', 'Focused', 'Tender']

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

  const logs = useMemo(() => {
    const q = query.trim().toLowerCase()
    return dailyLogs
      .filter((l) => (childFilter === 'all' ? true : l.childId === childFilter))
      .filter((l) => (dateFilter ? l.date === dateFilter : true))
      .filter((l) => {
        if (!q) return true
        const text = `${l.meals} ${l.naps} ${l.potty} ${l.mood} ${l.notes} ${l.activities.join(' ')}`.toLowerCase()
        return text.includes(q)
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [dailyLogs, childFilter, dateFilter, query])

  const openNew = () => {
    setEditingId(null)
    setForm({ ...emptyForm, childId: active[0]?.id ?? '' })
    setErrors({})
    setOpen(true)
  }

  const openEdit = (log: DailyLog) => {
    setEditingId(log.id)
    setForm({
      childId: log.childId,
      date: log.date,
      meals: log.meals,
      naps: log.naps,
      potty: log.potty,
      mood: log.mood || 'Cheerful',
      activities: log.activities.join('\n'),
      notes: log.notes,
    })
    setErrors({})
    setOpen(true)
  }

  const set =
    (key: keyof LogForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  const validate = () => {
    const next: LogErrors = {}
    if (!form.childId) next.childId = 'Pick a child'
    if (!form.date) next.date = 'Pick a date'
    if (!form.meals.trim()) next.meals = 'What did they eat?'
    if (!form.naps.trim()) next.naps = 'Add nap times (or "no nap")'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!validate()) return
    const payload = {
      childId: form.childId,
      date: form.date,
      meals: form.meals.trim(),
      naps: form.naps.trim(),
      potty: form.potty.trim() || '—',
      mood: form.mood,
      activities: form.activities
        .split('\n')
        .map((a) => a.trim())
        .filter(Boolean),
      notes: form.notes.trim(),
    }
    const childName = children.find((c) => c.id === form.childId)?.name.split(' ')[0] ?? 'Child'
    if (editingId) {
      updateDailyLog(editingId, payload)
      pushToast({ title: 'Report updated', description: `${childName}'s ${fmtDate(form.date)} report was saved.` })
    } else {
      addDailyLog(payload)
      pushToast({ title: 'Report posted', description: `${childName}'s report is now visible to their family.` })
    }
    setOpen(false)
  }

  const doDelete = () => {
    if (!confirmDelete) return
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
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search reports…"
                className="w-full pl-9 sm:w-56"
                aria-label="Search daily logs"
              />
            </div>
            <div className="relative">
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
            <Button onClick={openNew}>
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
              actions={
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(log)}
                    aria-label={`Edit report from ${fmtDate(log.date)}`}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-[#4F77D9]"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(log)}
                    aria-label={`Delete report from ${fmtDate(log.date)}`}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-rose-600"
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
        onClose={() => setOpen(false)}
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
                {moodOptions.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <Field label="Activities" hint="One per line.">
              <Textarea rows={3} value={form.activities} onChange={set('activities')} placeholder={'Morning circle\nSensory bin\nOutdoor bike path'} />
            </Field>
          </div>

          <Field label="Note home" hint="The line the family will actually remember.">
            <Textarea rows={3} value={form.notes} onChange={set('notes')} placeholder="Asked to help set the table today — so proud of that job." />
          </Field>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{editingId ? 'Save changes' : 'Post report'}</Button>
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

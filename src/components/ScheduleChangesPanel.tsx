import { useState } from 'react'
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Field, Input, Modal } from './ui'
import { DayBlocksEditor } from './ScheduleGrid'
import { useStore } from '../store/useStore'
import { cx, fmtDate, todayISO } from '../lib/helpers'
import { dayProblem, formatDayBlocks, sortedBlocks, weekdayOf } from '../lib/schedule'
import type { Child, ScheduleBlock, ScheduleChange } from '../types'

/** The console is English-only (see CLAUDE.md). */
const LOCALE = 'en-US'
const MAX_NOTE = 200

type Mode = 'times' | 'off'

interface Draft {
  /** The change being edited; undefined when adding a new one. */
  editing?: ScheduleChange
  date: string
  mode: Mode
  blocks: ScheduleBlock[]
  note: string
  /** False until she edits the times, so picking a date can fill in the usual ones. */
  touched: boolean
}

type Errors = Partial<Record<'date' | 'blocks', string>>

/** The child's usual times on that date's weekday; empty if not in, or no weekly schedule. */
function usualBlocks(child: Child, date: string): ScheduleBlock[] {
  const weekday = weekdayOf(date)
  if (weekday === null || !child.schedule) return []
  return sortedBlocks(child.schedule[weekday] ?? [])
}

/** "Usually on Fridays: 8 am–5 pm" — the context for a change on that date. */
function usualText(child: Child, date: string): string {
  if (weekdayOf(date) === null) return ''
  const days = `${fmtDate(date, 'EEEE')}s`
  if (!child.schedule) return `${child.name.split(' ')[0]} has no weekly schedule set yet.`
  const blocks = usualBlocks(child, date)
  return blocks.length > 0 ? `Usually on ${days}: ${formatDayBlocks(blocks, LOCALE)}` : `Usually not in on ${days}.`
}

/**
 * One-off schedule changes for one child: a different set of times, or not
 * coming, on a single date. Each overrides the weekly pattern for that date
 * only; the family sees it on their calendar and child page with a "New" marker.
 */
export default function ScheduleChangesPanel({ child }: { child: Child }) {
  const scheduleChanges = useStore((s) => s.scheduleChanges)
  const families = useStore((s) => s.families)
  const saveScheduleChange = useStore((s) => s.saveScheduleChange)
  const removeScheduleChange = useStore((s) => s.removeScheduleChange)
  const pushToast = useStore((s) => s.pushToast)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [confirmRemove, setConfirmRemove] = useState<ScheduleChange | null>(null)

  const today = todayISO()
  const first = child.name.split(' ')[0] ?? child.name
  const familyName = families.find((f) => f.id === child.familyId)?.name ?? 'The family'
  const upcoming = scheduleChanges
    .filter((c) => c.childId === child.id && c.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  const openAdd = () => {
    setErrors({})
    setDraft({ date: '', mode: 'times', blocks: [], note: '', touched: false })
  }

  const openEdit = (change: ScheduleChange) => {
    setErrors({})
    setDraft({
      editing: change,
      date: change.date,
      mode: change.blocks.length > 0 ? 'times' : 'off',
      blocks: change.blocks,
      note: change.note,
      touched: true,
    })
  }

  /** Applies an edit and clears that part's error, so a fixed field stops showing red. */
  const update = (patch: Partial<Draft>, clears: keyof Errors) => {
    if (!draft) return
    setDraft({ ...draft, ...patch })
    setErrors((current) => ({ ...current, [clears]: undefined }))
  }

  // Until she edits the times, start from what the child normally does that day.
  const setDate = (date: string) =>
    update({ date, blocks: draft?.touched ? draft.blocks : usualBlocks(child, date) }, 'date')

  /** Another change already on the chosen date, which saving would replace. */
  const clash =
    draft && draft.date
      ? scheduleChanges.find(
          (c) => c.childId === child.id && c.date === draft.date && c.id !== draft.editing?.id,
        )
      : undefined

  const save = () => {
    if (!draft) return
    const next: Errors = {}
    if (!draft.date || weekdayOf(draft.date) === null) next.date = 'Pick the date'
    else if (draft.date < today) next.date = 'Pick today or a later date'
    if (draft.mode === 'times') {
      if (draft.blocks.length === 0) next.blocks = 'Add at least one time, or choose Not coming.'
      else if (dayProblem(draft.blocks) !== null) next.blocks = 'Fix the times marked in red.'
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return

    // Moving a change to another date: the old date goes back to normal.
    if (draft.editing && draft.editing.date !== draft.date) removeScheduleChange(draft.editing.id)
    saveScheduleChange({
      childId: child.id,
      date: draft.date,
      blocks: draft.mode === 'off' ? [] : draft.blocks,
      note: draft.note.trim().slice(0, MAX_NOTE),
    })
    setDraft(null)
    pushToast({
      title: 'Schedule change saved',
      description: `${familyName} will see it on their calendar.`,
    })
  }

  const remove = () => {
    if (!confirmRemove) return
    removeScheduleChange(confirmRemove.id)
    setConfirmRemove(null)
    pushToast({ tone: 'info', title: 'Change removed', description: `${first} is back on the usual schedule that day.` })
  }

  return (
    <>
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
            <CalendarClock size={18} className="text-slate-400" /> Upcoming schedule changes
          </h2>
          <Button size="sm" variant="outline" onClick={openAdd}>
            <Plus size={14} /> Add a change
          </Button>
        </div>

        {upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No changes coming up. {first} follows the weekly schedule.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {upcoming.map((change) => (
              <li key={change.id} className="flex items-start gap-3 py-3 first:pt-1 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{fmtDate(change.date, 'EEE, MMM d')}</span>
                    {change.blocks.length === 0 && <Badge tone="amber">Not coming</Badge>}
                  </div>
                  {change.blocks.length > 0 && (
                    <p className="mt-0.5 text-sm text-slate-700">{formatDayBlocks(change.blocks, LOCALE)}</p>
                  )}
                  {change.note && <p className="mt-0.5 text-sm text-slate-500">{change.note}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(change)}
                    aria-label={`Edit the change on ${fmtDate(change.date, 'EEE, MMM d')}`}
                    className="inline-flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-brand sm:min-h-0 sm:min-w-0"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(change)}
                    aria-label={`Remove the change on ${fmtDate(change.date, 'EEE, MMM d')}`}
                    className="inline-flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 sm:min-h-0 sm:min-w-0"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.editing ? `Edit ${first}'s change` : `Change ${first}'s schedule for one day`}
        description="Only this date changes. The weekly schedule stays as it is."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={save}>Save change</Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <Field label="Date" error={errors.date} hint={draft.date ? usualText(child, draft.date) : undefined}>
              <Input
                type="date"
                min={today}
                value={draft.date}
                invalid={Boolean(errors.date)}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            {clash && (
              <p className="rounded-xl bg-sunny-tint px-3 py-2 text-xs font-medium text-sunny-ink">
                {first} already has a change on this date. Saving replaces it.
              </p>
            )}

            <fieldset className="min-w-0">
              <legend className="mb-1.5 text-sm font-semibold text-slate-700">That day</legend>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['times', 'Different times'],
                    ['off', 'Not coming'],
                  ] as const
                ).map(([mode, label]) => (
                  <label
                    key={mode}
                    className={cx(
                      // The radio itself is visually hidden; this ring shows keyboard focus.
                      'flex cursor-pointer items-center justify-center rounded-xl border px-3 py-2.5 text-sm font-semibold transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand/20',
                      draft.mode === mode
                        ? 'border-brand bg-brand text-white shadow-control'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-brand hover:text-brand',
                    )}
                  >
                    <input
                      type="radio"
                      name="schedule-change-mode"
                      value={mode}
                      checked={draft.mode === mode}
                      onChange={() => update({ mode }, 'blocks')}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            {draft.mode === 'times' && (
              <div className="min-w-0">
                <DayBlocksEditor
                  blocks={draft.blocks}
                  onChange={(blocks) => update({ blocks, touched: true }, 'blocks')}
                  dayName={draft.date ? fmtDate(draft.date, 'EEEE') : 'That day'}
                  idPrefix="schedule-change"
                  emptyLabel="Add a time"
                />
                {errors.blocks && <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.blocks}</p>}
              </div>
            )}

            <Field label="Note for the family" hint="Optional. The family sees this, e.g. “Camp day” or “Grandma picking up”.">
              <Input
                value={draft.note}
                maxLength={MAX_NOTE}
                onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        title="Remove this change?"
        description={
          confirmRemove
            ? `${first} goes back to the usual schedule on ${fmtDate(confirmRemove.date, 'EEE, MMM d')}.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRemove(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={remove}>
              Remove
            </Button>
          </>
        }
      />
    </>
  )
}

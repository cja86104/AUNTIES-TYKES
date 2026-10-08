import { Plus, X } from 'lucide-react'
import { Input } from './ui'
import { cx } from '../lib/helpers'
import { MAX_BLOCKS_PER_DAY, WEEKDAYS, dayProblem, scheduleProblems } from '../lib/schedule'
import type { DayProblem } from '../lib/schedule'
import type { ScheduleBlock, WeeklySchedule, Weekday } from '../types'

const DAY_NAMES: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

const PROBLEM_TEXT: Record<DayProblem, string> = {
  missing_time: 'Enter both a start and an end time.',
  end_before_start: 'Each end time has to be after its start time.',
  overlap: 'Two of these times overlap.',
  too_many: `Up to ${MAX_BLOCKS_PER_DAY} times a day.`,
}

/** True when every day can be saved. Forms call this before saving. */
export function scheduleIsValid(schedule: WeeklySchedule): boolean {
  return Object.keys(scheduleProblems(schedule)).length === 0
}

/** "HH:mm" plus whole minutes, held at 23:59 so a block never crosses midnight. */
function addMinutes(hhmm: string, minutes: number): string {
  const [hours = 0, mins = 0] = hhmm.split(':').map((piece) => Number(piece))
  const total = Math.min(hours * 60 + mins + minutes, 23 * 60 + 59)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/**
 * The next block to offer: a full day on an empty day, otherwise an hour that
 * starts where the latest block ends. Null when the day has no room left.
 */
function nextBlock(blocks: readonly ScheduleBlock[]): ScheduleBlock | null {
  if (blocks.length >= MAX_BLOCKS_PER_DAY) return null
  if (blocks.length === 0) return { start: '08:00', end: '17:00' }
  const latestEnd = blocks.reduce((latest, block) => (block.end > latest ? block.end : latest), '00:00')
  if (latestEnd >= '23:59') return null
  return { start: latestEnd, end: addMinutes(latestEnd, 60) }
}

export interface ScheduleGridProps {
  value: WeeklySchedule
  onChange: (value: WeeklySchedule) => void
  /** Short label shown above the grid. */
  legend?: string
  hint?: string
  /** Distinguishes the inputs when several grids are on one page (one per child). */
  idPrefix: string
}

/**
 * Weekly schedule editor: every day of the week, each with up to three
 * stretches of care, e.g. 7–9 am and back 3–6 pm.
 *
 * A fieldset, deliberately not wrapped in `Field`: `Field` is a <label>, and a
 * label holding several inputs and buttons forwards stray clicks to the first
 * control.
 */
export default function ScheduleGrid({
  value,
  onChange,
  legend = 'Weekly schedule',
  hint,
  idPrefix,
}: ScheduleGridProps) {
  const setDay = (weekday: Weekday, blocks: ScheduleBlock[]) => onChange({ ...value, [weekday]: blocks })

  const setTime = (weekday: Weekday, index: number, field: keyof ScheduleBlock, time: string) =>
    setDay(
      weekday,
      (value[weekday] ?? []).map((block, at) => (at === index ? { ...block, [field]: time } : block)),
    )

  return (
    // min-w-0: a fieldset defaults to min-width: min-content, which lets the
    // time inputs push it wider than a phone screen.
    <fieldset className="min-w-0 rounded-card border border-slate-200 p-4 sm:p-5">
      <legend className="px-1 text-sm font-semibold text-slate-700">{legend}</legend>
      {hint && <p className="mb-2 text-xs text-slate-500">{hint}</p>}

      <ul className="divide-y divide-slate-100">
        {WEEKDAYS.map((weekday) => {
          const blocks = value[weekday] ?? []
          const problem = dayProblem(blocks)
          const offer = nextBlock(blocks)
          const name = DAY_NAMES[weekday]
          const errorId = `${idPrefix}-${weekday}-error`

          return (
            <li key={weekday} className="py-3 first:pt-1 last:pb-1 sm:flex sm:items-start sm:gap-4">
              <div className="flex items-baseline justify-between sm:block sm:w-28 sm:shrink-0 sm:pt-2">
                <span className="text-sm font-semibold text-slate-800">{name}</span>
                {blocks.length === 0 && <span className="text-xs text-slate-400 sm:block">Not in</span>}
              </div>

              {/* A query container: each block goes side by side only when THIS
                  column has room for two uncut time inputs, however deeply the
                  form nests the grid. */}
              <div className="mt-2 min-w-0 flex-1 space-y-2 [container-type:inline-size] sm:mt-0">
                {blocks.map((block, index) => (
                  // Narrow screens stack From over Until at full width, with the
                  // remove control in a header row above them: two time inputs
                  // side by side get cut off ("07:(") once a form nests the grid
                  // inside padded cards. Side by side, × on the right, once the
                  // column is 22rem wide.
                  <div
                    key={index}
                    className="border-l-2 border-brand/30 pl-3 [@container(min-width:22rem)]:flex [@container(min-width:22rem)]:items-end [@container(min-width:22rem)]:gap-2 [@container(min-width:22rem)]:border-0 [@container(min-width:22rem)]:pl-0"
                  >
                    <div className="mb-1 flex items-center justify-between [@container(min-width:22rem)]:hidden">
                      <span className="text-xs font-semibold text-slate-600">Time {index + 1}</span>
                      <button
                        type="button"
                        onClick={() => setDay(weekday, blocks.filter((_, at) => at !== index))}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
                        aria-label={`Remove ${name} time ${index + 1}`}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 [@container(min-width:22rem)]:grid-cols-2">
                      {(['start', 'end'] as const).map((field) => (
                        <label key={field} className="block min-w-0">
                          <span className="mb-1 block text-xs font-medium text-slate-500">
                            {field === 'start' ? 'From' : 'Until'}
                          </span>
                          <Input
                            type="time"
                            value={block[field]}
                            invalid={problem !== null}
                            aria-label={`${name}, time ${index + 1}, ${field === 'start' ? 'from' : 'until'}`}
                            aria-describedby={problem !== null ? errorId : undefined}
                            onChange={(event) => setTime(weekday, index, field, event.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setDay(weekday, blocks.filter((_, at) => at !== index))}
                      className="mb-1 hidden shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 [@container(min-width:22rem)]:block"
                      aria-label={`Remove ${name} time ${index + 1}`}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}

                {problem !== null && (
                  <p id={errorId} className="text-xs font-medium text-rose-600">
                    {PROBLEM_TEXT[problem]}
                  </p>
                )}

                <button
                  type="button"
                  disabled={offer === null}
                  onClick={() => {
                    if (offer !== null) setDay(weekday, [...blocks, offer])
                  }}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold transition',
                    // Lines the button up with the day name when it is the only thing on the row.
                    blocks.length === 0 && 'sm:mt-1',
                    offer === null ? 'cursor-not-allowed text-slate-300' : 'text-brand hover:bg-brand-tint',
                  )}
                >
                  <Plus size={15} />
                  {blocks.length === 0 ? `Add ${name}` : 'Add another time'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}

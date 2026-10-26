import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, Select } from './ui'
import { weekLabel, weekRange } from '../lib/helpers'
import { shiftWeek, type WeekCount } from '../lib/weeks'

export interface WeekPickerProps {
  /** Monday of the week on screen. */
  week: string
  /** Monday of the current week at the daycare. */
  thisWeek: string
  /** Weeks that have something in them, newest first (from `weeksWithItems`). */
  weeks: WeekCount[]
  onChange: (week: string) => void
  /** What is being counted, singular and plural — "post", "posts". */
  noun: [string, string]
}

/**
 * Steps the admin console between weeks: arrows for the week before or after,
 * and a list of every week that has something in it. Admin side only — the
 * family portal keeps its full history on one page.
 */
export default function WeekPicker({ week, thisWeek, weeks, onChange, noun }: WeekPickerProps) {
  const oldest = weeks.length ? weeks[weeks.length - 1].start : thisWeek
  // Stepping with the arrows can land on an empty week; it still needs an option.
  const options = weeks.some((w) => w.start === week) ? weeks : [...weeks, { start: week, count: 0 }].sort((a, b) => (a.start < b.start ? 1 : -1))
  const countText = (n: number) => `${n} ${n === 1 ? noun[0] : noun[1]}`

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange(shiftWeek(week, -1))}
        disabled={week <= oldest}
        aria-label="Previous week"
      >
        <ChevronLeft size={16} />
      </Button>
      <Select
        value={week}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Choose a week"
        className="min-w-0 flex-1 sm:w-auto sm:flex-none sm:min-w-[15rem]"
      >
        {options.map((w) => (
          <option key={w.start} value={w.start}>
            {weekLabel(w.start, thisWeek)} · {weekRange(w.start)} ({countText(w.count)})
          </option>
        ))}
      </Select>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange(shiftWeek(week, 1))}
        disabled={week >= thisWeek}
        aria-label="Next week"
      >
        <ChevronRight size={16} />
      </Button>
      {week !== thisWeek && (
        <Button size="sm" variant="ghost" onClick={() => onChange(thisWeek)}>
          Back to this week
        </Button>
      )}
    </div>
  )
}

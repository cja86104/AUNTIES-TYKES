import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, Select } from './ui'
import { weekLabel, weekRange } from '../lib/helpers'
import { shiftWeek, type WeekCount } from '../lib/weeks'

/**
 * Every word the picker shows. Admin pages get the English default built from
 * `noun`; family-portal pages pass their own, translated, so the picker reads
 * in the parent's language.
 */
export interface WeekPickerText {
  /** "This week", "Last week", "Week of Oct 19". */
  label: (weekStart: string) => string
  /** "Oct 26 – Nov 1". */
  range: (weekStart: string) => string
  /** "3 reports". */
  count: (n: number) => string
  /** Marks a week holding something unread. */
  newMark: string
  previous: string
  next: string
  choose: string
  backToThisWeek: string
}

interface WeekPickerBaseProps {
  /** Monday of the week on screen. */
  week: string
  /** Monday of the current week at the daycare. */
  thisWeek: string
  /** Weeks that have something in them, newest first (from `weeksWithItems`). */
  weeks: WeekCount[]
  onChange: (week: string) => void
  /**
   * Weeks holding something unread. Their option is marked New, so an unread
   * item in an earlier week is not hidden behind the arrow while the nav badge
   * says something is waiting.
   */
  newWeeks?: ReadonlySet<string>
}

export type WeekPickerProps = WeekPickerBaseProps &
  (
    | {
        /** What is being counted, singular and plural — "post", "posts". English wording. */
        noun: [string, string]
        text?: never
      }
    | {
        /** Translated wording for the family portal. */
        text: WeekPickerText
        noun?: never
      }
  )

function englishText(thisWeek: string, noun: [string, string]): WeekPickerText {
  return {
    label: (weekStart) => weekLabel(weekStart, thisWeek),
    range: weekRange,
    count: (n) => `${n} ${n === 1 ? noun[0] : noun[1]}`,
    newMark: 'New',
    previous: 'Previous week',
    next: 'Next week',
    choose: 'Choose a week',
    backToThisWeek: 'Back to this week',
  }
}

/**
 * Steps between weeks: arrows for the week before or after, and a list of
 * every week that has something in it.
 */
export default function WeekPicker({ week, thisWeek, weeks, onChange, newWeeks, noun, text }: WeekPickerProps) {
  const words = text ?? englishText(thisWeek, noun)
  const oldest = weeks.length ? weeks[weeks.length - 1].start : thisWeek
  // Stepping with the arrows can land on an empty week; it still needs an option.
  const options = weeks.some((w) => w.start === week) ? weeks : [...weeks, { start: week, count: 0 }].sort((a, b) => (a.start < b.start ? 1 : -1))

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange(shiftWeek(week, -1))}
        disabled={week <= oldest}
        aria-label={words.previous}
      >
        <ChevronLeft size={16} />
      </Button>
      <Select
        value={week}
        onChange={(e) => onChange(e.target.value)}
        aria-label={words.choose}
        className="min-w-0 flex-1 sm:w-auto sm:flex-none sm:min-w-[15rem]"
      >
        {options.map((w) => (
          <option key={w.start} value={w.start}>
            {words.label(w.start)} · {words.range(w.start)} ({words.count(w.count)}){newWeeks?.has(w.start) ? ` · ${words.newMark}` : ''}
          </option>
        ))}
      </Select>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange(shiftWeek(week, 1))}
        disabled={week >= thisWeek}
        aria-label={words.next}
      >
        <ChevronRight size={16} />
      </Button>
      {week !== thisWeek && (
        <Button size="sm" variant="ghost" onClick={() => onChange(thisWeek)}>
          {words.backToThisWeek}
        </Button>
      )}
    </div>
  )
}

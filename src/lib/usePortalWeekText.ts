import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { WeekPickerText } from '../components/WeekPicker'
import { formatDayShort, formatWeekRange, shiftWeek } from './weeks'

/**
 * The week picker's wording in the parent's language, for the family portal's
 * weekly pages. `countKey` is the plural i18n key for what each week counts —
 * "dailyReports.reportCount", "messages.conversationCount" and so on.
 */
export function usePortalWeekText(thisWeek: string, countKey: string): WeekPickerText {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  return useMemo<WeekPickerText>(
    () => ({
      label: (start) => {
        if (start === thisWeek) return t('weeks.thisWeek')
        if (start === shiftWeek(thisWeek, -1)) return t('weeks.lastWeek')
        return t('weeks.weekOf', { date: formatDayShort(start, lang, start.slice(0, 4) !== thisWeek.slice(0, 4)) })
      },
      range: (start) => formatWeekRange(start, lang),
      count: (n) => t(countKey, { count: n }),
      newMark: t('common.new'),
      previous: t('weeks.previous'),
      next: t('weeks.next'),
      choose: t('weeks.choose'),
      backToThisWeek: t('weeks.backToThisWeek'),
    }),
    [t, lang, thisWeek, countKey],
  )
}

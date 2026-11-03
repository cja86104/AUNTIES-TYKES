import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { NotebookPen, CalendarDays, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import PageTransition from '../../components/PageTransition'
import { Badge, Button, EmptyState, Input, PageHeader, Tabs } from '../../components/ui'
import DailyLogCard from '../../components/DailyLogCard'
import WeekPicker, { type WeekPickerText } from '../../components/WeekPicker'
import { useStore } from '../../store/useStore'
import { useFamilyScope } from '../../lib/useFamilyScope'
import { todayISO } from '../../lib/helpers'
import { formatDayLong, formatDayShort, formatWeekRange, shiftWeek, weekStartOf, weeksWithItems } from '../../lib/weeks'
import { incidentsAwaitingAck, useSectionSeen } from '../../lib/unread'
import IncidentAckStrip from '../../components/IncidentAckStrip'
import type { DailyLog } from '../../types'

export default function ParentDailyReports() {
  const { t, i18n } = useTranslation()
  const { childId } = useParams<{ childId: string }>()
  const { user, kids } = useFamilyScope()
  const dailyLogs = useStore((s) => s.dailyLogs)
  const incidentAcks = useStore((s) => s.incidentAcks)
  const seen = useSectionSeen('daily_reports')
  const lang = i18n.language

  const [childFilter, setChildFilter] = useState(childId ?? 'all')
  const [dateFilter, setDateFilter] = useState('')
  const [query, setQuery] = useState('')

  // Keep the tab in step when arriving from a child's "Reports" button.
  useEffect(() => {
    setChildFilter(childId ?? 'all')
  }, [childId])

  /**
   * The page starts fresh every Monday: it opens on this week (Mon–Sun,
   * Eastern) and shows every report from it — the whole week so far, not just
   * today. Earlier weeks are one step back, and search or a picked date looks
   * across every week. Nothing is hidden for good or deleted.
   * `daily_logs.date` is already a daycare day, so its week is read straight
   * from it.
   */
  const today = todayISO()
  const thisWeek = weekStartOf(today) ?? today
  const [week, setWeek] = useState(thisWeek)
  const searching = query.trim() !== ''

  const kidIds = useMemo(() => kids.map((k) => k.id), [kids])
  const ourLogs = useMemo(() => dailyLogs.filter((l) => kidIds.includes(l.childId)), [dailyLogs, kidIds])

  /**
   * Reports with an incident this parent has not confirmed yet. The dashboard
   * alert sends them here, so such a report stays on this week until it is
   * confirmed, however old it is.
   */
  const awaitingIds = useMemo(
    () => new Set(incidentsAwaitingAck(ourLogs, incidentAcks, user?.id).map((l) => l.id)),
    [ourLogs, incidentAcks, user?.id],
  )

  /**
   * Reports in the current scope before the child tabs narrow it: every week
   * when searching, the picked date if there is one, else the chosen week.
   */
  const inScope = useMemo((): DailyLog[] => {
    const q = query.trim().toLowerCase()
    if (q) {
      return ourLogs.filter((l) => {
        const text = `${l.meals} ${l.naps} ${l.potty} ${l.mood} ${l.notes} ${l.activities.join(' ')}`.toLowerCase()
        return text.includes(q) && (dateFilter ? l.date === dateFilter : true)
      })
    }
    if (dateFilter) return ourLogs.filter((l) => l.date === dateFilter)
    return ourLogs.filter((l) => weekStartOf(l.date) === week || (week === thisWeek && awaitingIds.has(l.id)))
  }, [ourLogs, query, dateFilter, week, thisWeek, awaitingIds])

  const logs = useMemo(
    () =>
      inScope
        .filter((l) => (childFilter === 'all' ? true : l.childId === childFilter))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [inScope, childFilter],
  )

  const weeks = useMemo(() => weeksWithItems(ourLogs.map((l) => weekStartOf(l.date)), thisWeek), [ourLogs, thisWeek])

  /** Weeks holding a report this parent has not seen yet — marked New in the week list. */
  const newWeeks = new Set(
    ourLogs.flatMap((l) => {
      const start = weekStartOf(l.date)
      return start !== null && seen.isNew(l.postedAt) ? [start] : []
    }),
  )

  const weekText = useMemo<WeekPickerText>(
    () => ({
      label: (start) => {
        if (start === thisWeek) return t('weeks.thisWeek')
        if (start === shiftWeek(thisWeek, -1)) return t('weeks.lastWeek')
        return t('weeks.weekOf', { date: formatDayShort(start, lang, start.slice(0, 4) !== thisWeek.slice(0, 4)) })
      },
      range: (start) => formatWeekRange(start, lang),
      count: (n) => t('dailyReports.reportCount', { count: n }),
      newMark: t('common.new'),
      previous: t('weeks.previous'),
      next: t('weeks.next'),
      choose: t('weeks.choose'),
      backToThisWeek: t('weeks.backToThisWeek'),
    }),
    [t, lang, thisWeek],
  )

  const tabs = useMemo(
    () => [
      { value: 'all', label: t('dailyReports.allChildren'), count: inScope.length },
      ...kids.map((k) => ({
        value: k.id,
        label: k.name.split(' ')[0] ?? k.name,
        count: inScope.filter((l) => l.childId === k.id).length,
      })),
    ],
    [kids, inScope, t],
  )

  const filtersActive = Boolean(query || dateFilter || childFilter !== 'all')

  const clearAll = () => {
    setQuery('')
    setDateFilter('')
    setChildFilter('all')
  }

  /** Picking a date also moves the week, so clearing the date lands on that week. */
  const pickDate = (value: string) => {
    setDateFilter(value)
    const start = value ? weekStartOf(value) : null
    if (start) setWeek(start)
  }

  return (
    <PageTransition>
      <PageHeader
        title={t('dailyReports.title')}
        description={t('dailyReports.description')}
        actions={
          <>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('dailyReports.searchPlaceholder')}
                className="w-full pl-9 sm:w-56"
                aria-label={t('dailyReports.searchAria')}
              />
            </div>
            <div className="relative">
              <CalendarDays size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="date"
                value={dateFilter}
                max={today}
                onChange={(e) => pickDate(e.target.value)}
                className="w-full pl-9 sm:w-44"
                aria-label={t('dailyReports.filterByDate')}
              />
            </div>
          </>
        }
      />

      {ourLogs.length > 0 && (
        <div className="mb-4">
          {searching ? (
            <p className="text-sm text-slate-500">{t('dailyReports.searchingAll', { count: inScope.length })}</p>
          ) : dateFilter ? (
            <p className="text-sm text-slate-500">
              {t('dailyReports.showingDate', { date: formatDayLong(dateFilter, lang) })}
            </p>
          ) : (
            <WeekPicker week={week} thisWeek={thisWeek} weeks={weeks} onChange={setWeek} text={weekText} newWeeks={newWeeks} />
          )}
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Tabs tabs={tabs} value={childFilter} onChange={setChildFilter} />
        {filtersActive && (
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            <X size={13} /> {t('dailyReports.clearFilters')}
          </button>
        )}
        <Badge tone="neutral">
          {t('dailyReports.reportCount', { count: logs.length })}
        </Badge>
      </div>

      {logs.length === 0 ? (
        ourLogs.length === 0 ? (
          <EmptyState icon={NotebookPen} title={t('dailyReports.noReportsTitle')} description={t('dailyReports.noReportsDesc')} />
        ) : searching || dateFilter ? (
          <EmptyState
            icon={NotebookPen}
            title={t('dailyReports.noMatchTitle')}
            description={t('dailyReports.noMatchDesc')}
            action={
              <Button variant="outline" onClick={clearAll}>
                {t('dailyReports.clearFilters')}
              </Button>
            }
          />
        ) : week === thisWeek ? (
          <EmptyState icon={CalendarDays} title={t('dailyReports.freshWeekTitle')} description={t('dailyReports.freshWeekDesc')} />
        ) : (
          <EmptyState
            icon={CalendarDays}
            title={t('dailyReports.emptyWeekTitle')}
            description={t('dailyReports.emptyWeekDesc')}
            action={
              <Button variant="outline" onClick={() => setWeek(thisWeek)}>
                {t('weeks.backToThisWeek')}
              </Button>
            }
          />
        )
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {logs.map((log, i) => (
            <DailyLogCard
              key={log.id}
              log={log}
              child={kids.find((k) => k.id === log.childId)}
              index={i}
              incidentFooter={<IncidentAckStrip log={log} />}
              isNew={seen.isNew(log.postedAt)}
            />
          ))}
        </div>
      )}
    </PageTransition>
  )
}

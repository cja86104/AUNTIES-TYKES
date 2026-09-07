import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { NotebookPen, CalendarDays, Search, X } from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import { Badge, Button, EmptyState, Input, PageHeader, Tabs } from '../../components/ui'
import DailyLogCard from '../../components/DailyLogCard'
import { useStore } from '../../store/useStore'
import { useFamilyScope } from '../../lib/useFamilyScope'
import { todayISO } from '../../lib/helpers'

export default function ParentDailyReports() {
  const { childId } = useParams<{ childId: string }>()
  const { kids } = useFamilyScope()
  const dailyLogs = useStore((s) => s.dailyLogs)

  const [childFilter, setChildFilter] = useState(childId ?? 'all')
  const [dateFilter, setDateFilter] = useState('')
  const [query, setQuery] = useState('')

  // Keep the tab in step when arriving from a child's "Reports" button.
  useEffect(() => {
    setChildFilter(childId ?? 'all')
  }, [childId])

  const kidIds = useMemo(() => kids.map((k) => k.id), [kids])

  const logs = useMemo(() => {
    const q = query.trim().toLowerCase()
    return dailyLogs
      .filter((l) => kidIds.includes(l.childId))
      .filter((l) => (childFilter === 'all' ? true : l.childId === childFilter))
      .filter((l) => (dateFilter ? l.date === dateFilter : true))
      .filter((l) => {
        if (!q) return true
        return `${l.meals} ${l.naps} ${l.potty} ${l.mood} ${l.notes} ${l.activities.join(' ')}`
          .toLowerCase()
          .includes(q)
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [dailyLogs, kidIds, childFilter, dateFilter, query])

  const tabs = useMemo(
    () => [
      { value: 'all', label: 'All children', count: dailyLogs.filter((l) => kidIds.includes(l.childId)).length },
      ...kids.map((k) => ({
        value: k.id,
        label: k.name.split(' ')[0] ?? k.name,
        count: dailyLogs.filter((l) => l.childId === k.id).length,
      })),
    ],
    [kids, kidIds, dailyLogs],
  )

  const filtersActive = Boolean(query || dateFilter || childFilter !== 'all')
  const clearAll = () => {
    setQuery('')
    setDateFilter('')
    setChildFilter('all')
  }

  return (
    <PageTransition>
      <PageHeader
        title="Daily reports"
        description="Meals, naps, diapers, mood, and a note from the day — posted before pickup."
        actions={
          <>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search reports…"
                className="w-full pl-9 sm:w-56"
                aria-label="Search daily reports"
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
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Tabs tabs={tabs} value={childFilter} onChange={setChildFilter} />
        {filtersActive && (
          <button
            onClick={clearAll}
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
          title={filtersActive ? 'No reports match those filters' : 'No reports yet'}
          description={
            filtersActive
              ? 'Try a different child or clear the date to see everything.'
              : 'A full report is posted before pickup each day — check back this afternoon.'
          }
          action={
            filtersActive ? (
              <Button variant="outline" onClick={clearAll}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {logs.map((log, i) => (
            <DailyLogCard key={log.id} log={log} child={kids.find((k) => k.id === log.childId)} index={i} />
          ))}
        </div>
      )}
    </PageTransition>
  )
}

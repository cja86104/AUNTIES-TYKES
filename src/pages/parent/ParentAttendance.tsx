import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, ClipboardCheck, UserX, Clock, Download } from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  StatCard,
  Tabs,
  statusTone,
} from '../../components/ui'
import { useStore } from '../../store/useStore'
import { useFamilyScope } from '../../lib/useFamilyScope'
import { fmtDate, fmtTime } from '../../lib/helpers'

/** Minutes between an HH:mm check-in and check-out, or null when incomplete. */
function minutesBetween(inTime: string | null, outTime: string | null): number | null {
  if (!inTime || !outTime) return null
  const [ih, im] = inTime.split(':').map(Number)
  const [oh, om] = outTime.split(':').map(Number)
  if (ih === undefined || im === undefined || oh === undefined || om === undefined) return null
  return oh * 60 + om - (ih * 60 + im)
}

function hoursLabel(mins: number | null): string {
  if (mins === null || mins <= 0) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export default function ParentAttendance() {
  const { kids } = useFamilyScope()
  const attendance = useStore((s) => s.attendance)
  const pushToast = useStore((s) => s.pushToast)

  const [childFilter, setChildFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const kidIds = useMemo(() => kids.map((k) => k.id), [kids])
  const childName = (id: string) => kids.find((k) => k.id === id)?.name ?? 'Child'

  const rows = useMemo(
    () =>
      attendance
        .filter((a) => kidIds.includes(a.childId))
        .filter((a) => (childFilter === 'all' ? true : a.childId === childFilter))
        .filter((a) => (fromDate ? a.date >= fromDate : true))
        .filter((a) => (toDate ? a.date <= toDate : true))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [attendance, kidIds, childFilter, fromDate, toDate],
  )

  const presentDays = rows.filter((r) => r.status !== 'absent' && r.status !== 'expected').length
  const absentDays = rows.filter((r) => r.status === 'absent').length
  const totalMinutes = rows.reduce((s, r) => s + (minutesBetween(r.checkIn, r.checkOut) ?? 0), 0)
  const avgMinutes = presentDays > 0 ? Math.round(totalMinutes / presentDays) : 0

  const tabs = useMemo(
    () => [
      { value: 'all', label: 'All children', count: attendance.filter((a) => kidIds.includes(a.childId)).length },
      ...kids.map((k) => ({
        value: k.id,
        label: k.name.split(' ')[0] ?? k.name,
        count: attendance.filter((a) => a.childId === k.id).length,
      })),
    ],
    [kids, kidIds, attendance],
  )

  const exportCsv = () => {
    try {
      const header = 'Child,Date,Check in,Check out,Hours,Status'
      const lines = rows.map(
        (r) =>
          `"${childName(r.childId)}",${r.date},${r.checkIn ?? ''},${r.checkOut ?? ''},"${hoursLabel(
            minutesBetween(r.checkIn, r.checkOut),
          )}",${r.status}`,
      )
      const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'my-attendance.csv'
      a.click()
      URL.revokeObjectURL(url)
      pushToast({ title: 'Attendance exported', description: 'my-attendance.csv downloaded.' })
    } catch {
      pushToast({ tone: 'error', title: 'Export failed', description: 'Your browser blocked the download.' })
    }
  }

  const filtersActive = Boolean(fromDate || toDate || childFilter !== 'all')

  return (
    <PageTransition>
      <PageHeader
        title="Attendance"
        description="Every check-in and check-out we have recorded for your children."
        actions={
          <>
            <div className="relative">
              <CalendarDays size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full pl-9 sm:w-40"
                aria-label="From date"
              />
            </div>
            <div className="relative">
              <CalendarDays size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full pl-9 sm:w-40"
                aria-label="To date"
              />
            </div>
            <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
              <Download size={16} /> Export
            </Button>
          </>
        }
      />

      <div className="grid gap-5 sm:grid-cols-3">
        <StatCard icon={ClipboardCheck} label="Days attended" value={presentDays} sub="In the selected range" tone="green" />
        <StatCard icon={UserX} label="Days absent" value={absentDays} sub="Called out or no-show" tone="rose" />
        <StatCard icon={Clock} label="Average day" value={hoursLabel(avgMinutes)} sub="Drop-off to pickup" tone="blue" />
      </div>

      <div className="mb-6 mt-6 flex flex-wrap items-center gap-3">
        <Tabs tabs={tabs} value={childFilter} onChange={setChildFilter} />
        {filtersActive && (
          <button
            onClick={() => {
              setChildFilter('all')
              setFromDate('')
              setToDate('')
            }}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            Clear filters
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={filtersActive ? 'No days match those filters' : 'No attendance recorded yet'}
          description={
            filtersActive
              ? 'Try widening the date range or switching children.'
              : 'Check-ins will appear here from your first day with us.'
          }
          action={
            filtersActive ? (
              <Button
                variant="outline"
                onClick={() => {
                  setChildFilter('all')
                  setFromDate('')
                  setToDate('')
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Child</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Dropped off</th>
                  <th className="px-5 py-3">Picked up</th>
                  <th className="px-5 py-3">Hours</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => {
                  const kid = kids.find((k) => k.id === r.childId)
                  return (
                    <motion.tr
                      key={r.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.25) }}
                      className="transition hover:bg-slate-50/70"
                    >
                      <td className="px-5 py-3.5">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={kid?.name ?? 'Child'} hue={kid?.hue} size="sm" />
                          <span className="font-semibold text-slate-800">{childName(r.childId)}</span>
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{fmtDate(r.date, 'EEE, MMM d')}</td>
                      <td className="px-5 py-3.5 text-slate-600">{r.checkIn ? fmtTime(r.checkIn) : '—'}</td>
                      <td className="px-5 py-3.5 text-slate-600">{r.checkOut ? fmtTime(r.checkOut) : '—'}</td>
                      <td className="px-5 py-3.5 font-semibold text-slate-800">
                        {hoursLabel(minutesBetween(r.checkIn, r.checkOut))}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                        {r.note && <p className="mt-0.5 text-xs italic text-slate-400">{r.note}</p>}
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PageTransition>
  )
}

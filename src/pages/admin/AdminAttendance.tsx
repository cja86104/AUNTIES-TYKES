import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogIn, LogOut, UserX, ClipboardCheck, CalendarDays, Info, Download } from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import {
  Card,
  Button,
  Badge,
  Avatar,
  Input,
  PageHeader,
  StatCard,
  EmptyState,
  statusTone,
} from '../../components/ui'
import { useStore } from '../../store/useStore'
import { fmtDate, fmtTime, todayISO, ageLabel } from '../../lib/helpers'

export default function AdminAttendance() {
  const children = useStore((s) => s.children)
  const attendance = useStore((s) => s.attendance)
  const checkIn = useStore((s) => s.checkIn)
  const checkOut = useStore((s) => s.checkOut)
  const markAbsent = useStore((s) => s.markAbsent)
  const pushToast = useStore((s) => s.pushToast)

  const today = todayISO()
  const [date, setDate] = useState(today)
  const isToday = date === today

  const active = useMemo(() => children.filter((c) => c.status === 'active'), [children])
  const rows = useMemo(
    () =>
      active.map((c) => ({
        child: c,
        record: attendance.find((a) => a.childId === c.id && a.date === date) || null,
      })),
    [active, attendance, date],
  )

  const present = rows.filter((r) => r.record?.status === 'present').length
  const out = rows.filter((r) => r.record?.status === 'checked-out').length
  const absent = rows.filter((r) => r.record?.status === 'absent').length
  const expected = rows.length - present - out - absent

  const exportCsv = () => {
    try {
      const header = 'Child,Date,Check in,Check out,Status,Note'
      const lines = rows.map(
        ({ child, record }) =>
          `"${child.name}",${date},${record?.checkIn || ''},${record?.checkOut || ''},${record?.status || 'expected'},"${
            record?.note || ''
          }"`,
      )
      const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `attendance-${date}.csv`
      a.click()
      URL.revokeObjectURL(url)
      pushToast({ title: 'Attendance exported', description: `attendance-${date}.csv downloaded.` })
    } catch {
      pushToast({ tone: 'error', title: 'Export failed', description: 'Your browser blocked the download.' })
    }
  }

  return (
    <PageTransition>
      <PageHeader
        title="Attendance"
        description="Check children in and out, mark absences, and review any day in the log."
        actions={
          <>
            <div className="relative">
              <CalendarDays size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value || today)}
                className="w-full pl-9 sm:w-48"
                aria-label="Attendance date"
              />
            </div>
            <Button variant="outline" onClick={exportCsv}>
              <Download size={16} /> Export CSV
            </Button>
          </>
        }
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ClipboardCheck} label="Present now" value={present} sub={fmtDate(date, 'EEEE, MMM d')} tone="green" />
        <StatCard icon={LogOut} label="Checked out" value={out} sub="Left for the day" tone="blue" />
        <StatCard icon={UserX} label="Absent" value={absent} sub="Called out or no-show" tone="rose" />
        <StatCard icon={LogIn} label="Still expected" value={expected} sub="Not arrived yet" tone="amber" />
      </div>

      {!isToday && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#4F77D9]/30 bg-[#4F77D9]/5 p-4 text-sm text-[#39569f]">
          <Info size={18} className="mt-0.5 shrink-0" />
          <p>
            You are viewing <strong className="font-semibold">{fmtDate(date, 'EEEE, MMMM d')}</strong>. Check-in and
            check-out only apply to today — switch back to {fmtDate(today, 'MMM d')} to make changes.
          </p>
        </div>
      )}

      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 className="font-display text-lg font-bold text-slate-900">{fmtDate(date, 'EEEE, MMMM d')}</h2>
          <Badge tone="neutral">{rows.length} active children</Badge>
        </div>

        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={ClipboardCheck}
              title="No active children"
              description="Enroll a child to begin tracking attendance."
              action={
                <Button as={Link} to="/admin/children">
                  Go to children
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map(({ child, record }, i) => {
              const status = record?.status || 'expected'
              return (
                <motion.li
                  key={child.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3) }}
                  className="flex flex-wrap items-center gap-3 px-5 py-4"
                >
                  <Avatar name={child.name} hue={child.hue} size="md" />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/admin/children/${child.id}`}
                      className="truncate font-display text-sm font-bold text-slate-900 transition hover:text-[#4F77D9]"
                    >
                      {child.name}
                    </Link>
                    <p className="truncate text-xs text-slate-500">
                      {child.ageGroup} · {ageLabel(child.dob)} · {child.plan}
                    </p>
                    {record?.note && <p className="mt-0.5 truncate text-xs italic text-slate-400">{record.note}</p>}
                  </div>

                  <div className="flex w-40 shrink-0 items-center justify-between gap-2 text-xs text-slate-600">
                    <span>
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">In</span>
                      {record?.checkIn ? fmtTime(record.checkIn) : '—'}
                    </span>
                    <span>
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Out</span>
                      {record?.checkOut ? fmtTime(record.checkOut) : '—'}
                    </span>
                  </div>

                  <Badge tone={statusTone(status)}>{status}</Badge>

                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!isToday || status === 'present'}
                      onClick={() => {
                        checkIn(child.id)
                        pushToast({ title: `${child.name.split(' ')[0]} checked in` })
                      }}
                    >
                      <LogIn size={14} /> In
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!isToday || status !== 'present'}
                      onClick={() => {
                        checkOut(child.id)
                        pushToast({ title: `${child.name.split(' ')[0]} checked out` })
                      }}
                    >
                      <LogOut size={14} /> Out
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!isToday || status === 'absent'}
                      onClick={() => {
                        markAbsent(child.id)
                        pushToast({ tone: 'info', title: `${child.name.split(' ')[0]} marked absent` })
                      }}
                    >
                      <UserX size={14} />
                    </Button>
                  </div>
                </motion.li>
              )
            })}
          </ul>
        )}
      </Card>
    </PageTransition>
  )
}
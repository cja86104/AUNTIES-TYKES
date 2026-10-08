import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LogIn,
  LogOut,
  UserX,
  ClipboardCheck,
  CalendarDays,
  Info,
  Download,
  ChevronDown,
  CalendarX2,
  Clock,
  HelpCircle,
} from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import { Card, Button, Badge, Avatar, Input, PageHeader, StatCard, EmptyState } from '../../components/ui'
import { useStore } from '../../store/useStore'
import { cx, fmtDate, fmtTime, todayISO, ageLabel } from '../../lib/helpers'
import { buildDayRoster } from '../../lib/schedule'
import { visitsOn } from '../../lib/visits'
import { ConsoleRosterBadge, consoleDayText } from '../../components/ScheduleSummary'
import type { ConsoleRosterRow } from '../../components/ScheduleSummary'

type Group = 'main' | 'unscheduled' | 'notToday'

export default function AdminAttendance() {
  const children = useStore((s) => s.children)
  const attendance = useStore((s) => s.attendance)
  const attendanceVisits = useStore((s) => s.attendanceVisits)
  const scheduleChanges = useStore((s) => s.scheduleChanges)
  const calendarEvents = useStore((s) => s.calendarEvents)
  const checkIn = useStore((s) => s.checkIn)
  const checkOut = useStore((s) => s.checkOut)
  const markAbsent = useStore((s) => s.markAbsent)
  const pushToast = useStore((s) => s.pushToast)

  const today = todayISO()
  const [date, setDate] = useState(today)
  const [showNotToday, setShowNotToday] = useState(false)
  const isToday = date === today

  // Who is expected comes from the real schedules (src/lib/schedule.ts), the
  // same grouping the dashboard and Ro use, so the three can never disagree.
  const roster = useMemo(
    () => buildDayRoster(children, attendance, scheduleChanges, calendarEvents, date),
    [children, attendance, scheduleChanges, calendarEvents, date],
  )
  const { counts } = roster

  const exportCsv = () => {
    try {
      const quote = (value: string) => `"${value.replace(/"/g, '""')}"`
      const header = 'Child,Date,Scheduled,Check in,Check out,Status,Note'
      const groups: [Group, ConsoleRosterRow[]][] = [
        ['main', roster.main],
        ['unscheduled', roster.unscheduled],
        ['notToday', roster.notToday],
      ]
      const lines = groups.flatMap(([group, rows]) =>
        rows.map((row) => {
          const status =
            row.record?.status ?? (group === 'main' ? 'expected' : group === 'unscheduled' ? 'no schedule' : 'not scheduled')
          return [
            quote(row.child.name),
            date,
            quote(consoleDayText(row)),
            row.record?.checkIn ?? '',
            row.record?.checkOut ?? '',
            status,
            quote(row.record?.note ?? ''),
          ].join(',')
        }),
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

  const renderRow = (row: ConsoleRosterRow, group: Group, i: number) => {
    const { child, record } = row
    const status = record?.status ?? 'expected'
    const first = child.name.split(' ')[0]
    const visits = visitsOn(attendanceVisits, child.id, date)
    return (
      <motion.li
        key={child.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(i * 0.04, 0.3) }}
        className="flex flex-wrap items-center gap-3 px-5 py-4"
      >
        <div className="flex min-w-[10rem] flex-1 items-center gap-3 sm:min-w-0">
          <Avatar name={child.name} hue={child.hue} size="md" />
          <div className="min-w-0 flex-1">
            <Link
              to={`/admin/children/${child.id}`}
              className="block truncate font-display text-sm font-bold text-slate-900 transition hover:text-[#3F8570]"
            >
              {child.name}
            </Link>
            <p className="truncate text-xs text-slate-500">
              {child.ageGroup} · {ageLabel(child.dob)} · {consoleDayText(row)}
              {/* The labelled In/Out block below is hidden on phones, where a rigid
                  160px column starved this name to zero width, so the times ride
                  along here instead. */}
              {group === 'main' && (
                <span className="sm:hidden">
                  {record?.checkIn ? ` · in ${fmtTime(record.checkIn)}` : ' · not in yet'}
                  {record?.checkOut ? ` · out ${fmtTime(record.checkOut)}` : ''}
                </span>
              )}
            </p>
            {/* A split day: every visit, since In/Out alone show only the first and the latest. */}
            {visits.length > 1 && (
              <p className="mt-0.5 text-xs font-medium text-slate-600">
                Visits:{' '}
                {visits
                  .map((v) => `${fmtTime(v.checkIn)}–${v.checkOut ? fmtTime(v.checkOut) : isToday ? 'now' : 'no check-out'}`)
                  .join(', ')}
              </p>
            )}
            {record?.note && <p className="mt-0.5 truncate text-xs italic text-slate-400">{record.note}</p>}
          </div>

          {group === 'main' && (
            <div className="hidden w-40 shrink-0 items-center justify-between gap-2 text-xs text-slate-600 sm:flex">
              <span>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">In</span>
                {record?.checkIn ? fmtTime(record.checkIn) : '—'}
              </span>
              <span>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Out</span>
                {record?.checkOut ? fmtTime(record.checkOut) : '—'}
              </span>
            </div>
          )}

          <ConsoleRosterBadge row={row} group={group} />
        </div>

        <div className="flex shrink-0 gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={!isToday || status === 'present'}
            onClick={() => {
              checkIn(child.id)
              pushToast({ title: `${first} checked in` })
            }}
          >
            <LogIn size={14} /> In
          </Button>
          {group === 'main' && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={!isToday || status !== 'present'}
                onClick={() => {
                  checkOut(child.id)
                  pushToast({ title: `${first} checked out` })
                }}
              >
                <LogOut size={14} /> Out
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Mark ${first} absent`}
                // Recorded times are never erased, so absent is off once they have checked in.
                title={record?.checkIn ? `${first} already checked in today` : undefined}
                disabled={!isToday || status === 'absent' || Boolean(record?.checkIn)}
                onClick={() => {
                  if (markAbsent(child.id)) pushToast({ tone: 'info', title: `${first} marked absent` })
                }}
              >
                <UserX size={14} />
              </Button>
            </>
          )}
        </div>
      </motion.li>
    )
  }

  const nobodyActive = roster.main.length + roster.unscheduled.length + roster.notToday.length === 0

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
        <StatCard icon={ClipboardCheck} label="Present now" value={counts.here} sub={fmtDate(date, 'EEEE, MMM d')} tone="green" />
        <StatCard icon={LogOut} label="Checked out" value={counts.gone} sub="Left for the day" tone="blue" />
        <StatCard icon={UserX} label="Absent" value={counts.absent} sub="Called out or no-show" tone="rose" />
        <StatCard
          icon={LogIn}
          label="Still expected"
          value={counts.due}
          sub={counts.returning > 0 ? `Includes ${counts.returning} coming back later` : 'Not arrived yet'}
          tone="amber"
        />
      </div>

      {!isToday && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#3F8570]/30 bg-[#3F8570]/5 p-4 text-sm text-[#1F4A3D]">
          <Info size={18} className="mt-0.5 shrink-0" />
          <p>
            You are viewing <strong className="font-semibold">{fmtDate(date, 'EEEE, MMMM d')}</strong>. Check-in and
            check-out only apply to today — switch back to {fmtDate(today, 'MMM d')} to make changes.
          </p>
        </div>
      )}

      {roster.closure && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="status">
          <CalendarX2 size={18} className="mt-0.5 shrink-0" />
          <p>
            <strong className="font-semibold">Closed — {roster.closure.title}.</strong> Nobody is expected this day.
          </p>
        </div>
      )}
      {!roster.closure && roster.earlyClose && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-sunny/40 bg-sunny-tint p-4 text-sm text-sunny-ink" role="status">
          <Clock size={18} className="mt-0.5 shrink-0" />
          <p>
            <strong className="font-semibold">
              Closing at {fmtTime(roster.earlyClose.closesAt)} — {roster.earlyClose.title}.
            </strong>{' '}
            The times below already end then.
          </p>
        </div>
      )}

      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 className="font-display text-lg font-bold text-slate-900">{fmtDate(date, 'EEEE, MMMM d')}</h2>
          <Badge tone="neutral">{roster.main.length} on today's list</Badge>
        </div>

        {nobodyActive ? (
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
        ) : roster.main.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={CalendarDays}
              title={roster.closure ? 'Closed — nobody expected' : 'Nobody is scheduled this day'}
              description="Anyone who comes in anyway can be checked in from the lists below."
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">{roster.main.map((row, i) => renderRow(row, 'main', i))}</ul>
        )}
      </Card>

      {roster.unscheduled.length > 0 && (
        <Card className="mt-6 overflow-hidden border-sunny/40">
          <div className="border-b border-slate-100 bg-sunny-tint/60 px-5 py-4">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
              <HelpCircle size={18} className="text-sunny-ink" /> No schedule set
              <Badge tone="amber">{roster.unscheduled.length}</Badge>
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Nobody has entered these children's weekly schedule, so they are not counted as expected or absent. Open
              a child and edit their profile to set it.
            </p>
          </div>
          <ul className="divide-y divide-slate-100">
            {roster.unscheduled.map((row, i) => renderRow(row, 'unscheduled', i))}
          </ul>
        </Card>
      )}

      {roster.notToday.length > 0 && (
        <Card className="mt-6 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowNotToday((open) => !open)}
            aria-expanded={showNotToday}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-slate-50"
          >
            <span>
              <span className="flex items-center gap-2 font-display text-base font-bold text-slate-900">
                Not scheduled today <Badge tone="neutral">{roster.notToday.length}</Badge>
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Drop-in or a swap? Check them in here and they move to the list above.
              </span>
            </span>
            <ChevronDown size={18} className={cx('shrink-0 text-slate-400 transition', showNotToday && 'rotate-180')} />
          </button>
          {showNotToday && (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {roster.notToday.map((row, i) => renderRow(row, 'notToday', i))}
            </ul>
          )}
        </Card>
      )}
    </PageTransition>
  )
}

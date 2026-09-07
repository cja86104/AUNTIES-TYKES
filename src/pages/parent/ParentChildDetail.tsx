import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Baby,
  AlertTriangle,
  Pill,
  NotebookPen,
  CalendarDays,
  Sparkles,
  Clock,
} from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import { Avatar, Badge, Button, Card, EmptyState, statusTone } from '../../components/ui'
import DailyLogCard from '../../components/DailyLogCard'
import { useStore } from '../../store/useStore'
import { useFamilyScope } from '../../lib/useFamilyScope'
import { ageLabel, fmtDate, fmtTime, todayISO } from '../../lib/helpers'

export default function ParentChildDetail() {
  const { id } = useParams<{ id: string }>()
  const { kids } = useFamilyScope()
  const attendance = useStore((s) => s.attendance)
  const dailyLogs = useStore((s) => s.dailyLogs)
  const settings = useStore((s) => s.settings)

  // Scoped to this family, so the route cannot be used to view another child.
  const child = kids.find((c) => c.id === id)

  if (!child) {
    return (
      <PageTransition>
        <EmptyState
          icon={Baby}
          title="We couldn't find that child"
          description="This link may belong to a different account."
          action={
            <Button as={Link} to="/parent/children">
              Back to my children
            </Button>
          }
        />
      </PageTransition>
    )
  }

  const today = todayISO()
  const todayRecord = attendance.find((a) => a.childId === child.id && a.date === today)
  const recentAttendance = attendance
    .filter((a) => a.childId === child.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 6)
  const logs = dailyLogs
    .filter((l) => l.childId === child.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 3)

  const daysHere = recentAttendance.filter((a) => a.status !== 'absent').length

  return (
    <PageTransition>
      <Link
        to="/parent/children"
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-[#4F77D9]"
      >
        <ArrowLeft size={15} /> Back to my children
      </Link>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-5 bg-gradient-to-br from-[#EAF0FC] to-white px-6 py-6">
          <Avatar name={child.name} hue={child.hue} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              {child.name}
            </h1>
            <p className="mt-1 text-slate-600">
              {child.ageGroup} · {ageLabel(child.dob)} · with {child.teacher}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone={statusTone(child.status)}>{child.status}</Badge>
              <Badge tone="neutral">{child.plan}</Badge>
              {todayRecord && <Badge tone={statusTone(todayRecord.status)}>Today: {todayRecord.status}</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button as={Link} to={`/parent/daily-reports/${child.id}`}>
              <NotebookPen size={16} /> Daily reports
            </Button>
            <Button as={Link} to="/parent/attendance" variant="outline">
              <CalendarDays size={16} /> Attendance
            </Button>
          </div>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-display text-lg font-bold text-slate-900">On file</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Date of birth</dt>
                <dd className="font-semibold text-slate-800">{fmtDate(child.dob)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Started with us</dt>
                <dd className="font-semibold text-slate-800">{fmtDate(child.startDate)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Enrollment plan</dt>
                <dd className="font-semibold text-slate-800">{child.plan}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Group ratio</dt>
                <dd className="text-right font-semibold text-slate-800">{settings.ratios}</dd>
              </div>
            </dl>

            <div className="mt-5 space-y-3">
              <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 p-3.5 text-rose-900">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider">Allergies</p>
                  <p className="mt-0.5 text-sm">
                    {child.allergies.length > 0 ? child.allergies.join(' · ') : 'None on file'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl bg-[#FDF1DC] p-3.5 text-[#7a5510]">
                <Pill size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider">Medications</p>
                  <p className="mt-0.5 text-sm">
                    {child.medications.length > 0 ? child.medications.join(' · ') : 'None on file'}
                  </p>
                </div>
              </div>
              {child.notes && (
                <div className="flex items-start gap-2.5 rounded-xl bg-[#E6F6F0] p-3.5 text-[#1f6152]">
                  <Sparkles size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider">What we've noticed</p>
                    <p className="mt-0.5 text-sm">{child.notes}</p>
                  </div>
                </div>
              )}
            </div>

            <p className="mt-5 text-xs text-slate-500">
              Something out of date?{' '}
              <Link to="/parent/messages" className="font-semibold text-[#4F77D9] hover:underline">
                Send us a note
              </Link>{' '}
              and we'll update it.
            </p>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <h2 className="font-display text-lg font-bold text-slate-900">Recent days</h2>
              <Badge tone="green">
                <Clock size={12} /> {daysHere} of last {recentAttendance.length}
              </Badge>
            </div>
            {recentAttendance.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={CalendarDays} title="No attendance yet" description="Check-ins appear here from the first day." />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentAttendance.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="text-slate-700">{fmtDate(a.date, 'EEE, MMM d')}</span>
                    <span className="text-xs text-slate-500">
                      {a.checkIn ? `${fmtTime(a.checkIn)} – ${a.checkOut ? fmtTime(a.checkOut) : 'still here'}` : '—'}
                    </span>
                    <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-slate-900">Recent reports</h2>
            <Button as={Link} to={`/parent/daily-reports/${child.id}`} size="sm" variant="ghost">
              See all
            </Button>
          </div>
          {logs.length === 0 ? (
            <EmptyState
              icon={NotebookPen}
              title={`No reports for ${child.name.split(' ')[0]} yet`}
              description="A full report is posted before pickup each day."
            />
          ) : (
            <div className="space-y-5">
              {logs.map((log, i) => (
                <DailyLogCard key={log.id} log={log} child={child} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  )
}

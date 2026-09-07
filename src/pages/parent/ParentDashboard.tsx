import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import {
  Baby,
  Wallet,
  CalendarClock,
  Megaphone,
  NotebookPen,
  ArrowRight,
  CreditCard,
  LogIn,
  LogOut,
  Clock,
} from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  SkeletonCard,
  StatCard,
  statusTone,
} from '../../components/ui'
import DailyLogCard from '../../components/DailyLogCard'
import { useStore } from '../../store/useStore'
import { useFamilyScope } from '../../lib/useFamilyScope'
import { useBootstrap } from '../../lib/hooks'
import { ageLabel, fmtDate, fmtTime, money, todayISO } from '../../lib/helpers'

export default function ParentDashboard() {
  const { user, activeKids, kids, outstanding, nextInvoice, announcements } = useFamilyScope()
  const attendance = useStore((s) => s.attendance)
  const dailyLogs = useStore((s) => s.dailyLogs)
  const { isLoading } = useBootstrap('parent-dashboard')

  const firstName = user?.name.split(' ')[0] ?? 'there'
  const today = todayISO()
  const kidIds = kids.map((k) => k.id)

  const todayRows = activeKids.map((child) => ({
    child,
    record: attendance.find((a) => a.childId === child.id && a.date === today),
  }))

  const latestLog = dailyLogs
    .filter((l) => kidIds.includes(l.childId))
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0]

  const latestAnnouncement = announcements[0]

  return (
    <PageTransition>
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#4F77D9]">
          {fmtDate(today, 'EEEE, MMMM d')}
        </p>
        <h1 className="mt-1.5 font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Hi {firstName} 👋
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          {activeKids.length > 0
            ? `Here's how ${activeKids.length === 1 ? `${activeKids[0]?.name.split(' ')[0]}'s` : 'everyone’s'} day is going.`
            : 'Your family account is set up and ready.'}
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Baby}
            label="Children"
            value={activeKids.length}
            sub={kids.length > activeKids.length ? `${kids.length - activeKids.length} on the waitlist` : 'Enrolled with us'}
            tone="blue"
            to="/parent/children"
          />
          <StatCard
            icon={Wallet}
            label="Balance due"
            value={money(outstanding)}
            sub={outstanding > 0 ? 'Across your open statements' : 'You are all paid up — thank you!'}
            tone={outstanding > 0 ? 'amber' : 'green'}
            to="/parent/billing"
          />
          <StatCard
            icon={CalendarClock}
            label="Next invoice due"
            value={nextInvoice ? fmtDate(nextInvoice.dueDate, 'MMM d') : '—'}
            sub={nextInvoice ? `${nextInvoice.id} · ${money(nextInvoice.amount)}` : 'Nothing scheduled'}
            tone="violet"
            to={nextInvoice ? `/parent/invoices/${nextInvoice.id}` : '/parent/billing'}
          />
          <StatCard
            icon={Megaphone}
            label="Announcements"
            value={announcements.length}
            sub={latestAnnouncement ? `Latest ${fmtDate(latestAnnouncement.date, 'MMM d')}` : 'Nothing posted yet'}
            tone="green"
            to="/parent/messages"
          />
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <h2 className="font-display text-lg font-bold text-slate-900">Today at a glance</h2>
              <Button as={Link} to="/parent/attendance" size="sm" variant="ghost">
                Attendance history <ArrowRight size={14} />
              </Button>
            </div>

            {todayRows.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={Baby}
                  title="No enrolled children yet"
                  description="Once enrollment starts, check-ins show up here each morning."
                />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {todayRows.map(({ child, record }, i) => {
                  const status = record?.status ?? 'expected'
                  return (
                    <motion.li
                      key={child.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.06, 0.3) }}
                      className="flex flex-wrap items-center gap-3 px-5 py-4"
                    >
                      <Avatar name={child.name} hue={child.hue} size="md" />
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/parent/children/${child.id}`}
                          className="font-display text-sm font-bold text-slate-900 transition hover:text-[#4F77D9]"
                        >
                          {child.name}
                        </Link>
                        <p className="truncate text-xs text-slate-500">
                          {child.ageGroup} · {ageLabel(child.dob)} · with {child.teacher}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-600">
                        <span className="flex items-center gap-1.5">
                          <LogIn size={13} className="text-slate-400" />
                          {record?.checkIn ? fmtTime(record.checkIn) : '—'}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <LogOut size={13} className="text-slate-400" />
                          {record?.checkOut ? fmtTime(record.checkOut) : '—'}
                        </span>
                      </div>
                      <Badge tone={statusTone(status)}>{status}</Badge>
                    </motion.li>
                  )
                })}
              </ul>
            )}
          </Card>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-slate-900">Latest daily report</h2>
              <Button as={Link} to="/parent/daily-reports" size="sm" variant="ghost">
                See all <ArrowRight size={14} />
              </Button>
            </div>
            {latestLog ? (
              <DailyLogCard log={latestLog} child={kids.find((k) => k.id === latestLog.childId)} />
            ) : (
              <EmptyState
                icon={NotebookPen}
                title="No reports yet"
                description="Auntie Roz posts meals, naps, and a note before pickup each day."
              />
            )}
          </div>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-display text-lg font-bold text-slate-900">Quick actions</h2>
            <div className="mt-4 space-y-2.5">
              <Button as={Link} to="/parent/daily-reports" variant="outline" className="w-full justify-start">
                <NotebookPen size={16} /> View daily reports
              </Button>
              <Button
                as={Link}
                to={nextInvoice ? `/parent/invoices/${nextInvoice.id}` : '/parent/billing'}
                variant="outline"
                className="w-full justify-start"
              >
                <CreditCard size={16} /> {outstanding > 0 ? `Pay ${money(outstanding)}` : 'View billing'}
              </Button>
              <Button as={Link} to="/parent/messages" variant="outline" className="w-full justify-start">
                <Megaphone size={16} /> Read announcements
              </Button>
              <Button as={Link} to="/parent/documents" variant="outline" className="w-full justify-start">
                <Clock size={16} /> Forms &amp; documents
              </Button>
            </div>
          </Card>

          {latestAnnouncement && (
            <Card className="overflow-hidden">
              <div className="border-b border-slate-100 bg-gradient-to-br from-[#FDF1DC] to-white px-5 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8a6112]">Latest announcement</p>
                <h3 className="mt-1 font-display text-base font-bold text-slate-900">{latestAnnouncement.title}</h3>
                <p className="text-xs text-slate-500">{fmtDate(latestAnnouncement.date, 'EEEE, MMMM d')}</p>
              </div>
              <div className="md px-5 py-4 text-sm">
                <ReactMarkdown>{latestAnnouncement.body}</ReactMarkdown>
              </div>
              <div className="border-t border-slate-100 px-5 py-3">
                <Link
                  to="/parent/messages"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[#4F77D9] hover:underline"
                >
                  All announcements <ArrowRight size={14} />
                </Link>
              </div>
            </Card>
          )}
        </div>
      </div>
    </PageTransition>
  )
}

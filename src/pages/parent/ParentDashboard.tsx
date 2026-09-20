import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import {
  UserRound,
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
import { useTranslation } from 'react-i18next'
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
import { ageLabel, fmtDate, fmtTime, money, todayISO } from '../../lib/helpers'

export default function ParentDashboard() {
  const { t } = useTranslation()
  const { user, activeKids, kids, outstanding, nextInvoice, announcements } = useFamilyScope()
  const attendance = useStore((s) => s.attendance)
  const dailyLogs = useStore((s) => s.dailyLogs)
  // Real readiness, not a timer: the store flips `ready` once bootstrap has
  // restored the session and hydrated the cache from Supabase.
  const isLoading = !useStore((s) => s.ready)

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
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#3F8570]">
          {fmtDate(today, 'EEEE, MMMM d')}
        </p>
        <h1 className="mt-1.5 font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          {t('dashboard.greeting', { name: firstName })}
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          {activeKids.length > 0
            ? activeKids.length === 1
              ? t('dashboard.subtitleOne', { name: activeKids[0]?.name.split(' ')[0] })
              : t('dashboard.subtitleMany')
            : t('dashboard.subtitleNone')}
        </p>
      </div>

      {/*
        Mobile shows these top to bottom in source order: Quick actions,
        Latest announcement, Today's glance, Latest daily report, Billing
        info. Desktop (xl+) keeps the original two-column arrangement via
        explicit grid placement, unaffected by the mobile source order.
      */}
      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[1.4fr_1fr]">
        {/* Quick actions — mobile #1, desktop right column / row 2 */}
        <Card className="p-5 xl:col-start-2 xl:row-start-2">
          <h2 className="font-display text-lg font-bold text-slate-900">{t('dashboard.quickActions')}</h2>
          <div className="mt-4 space-y-2.5">
            <Button as={Link} to="/parent/daily-reports" variant="outline" className="w-full justify-start">
              <NotebookPen size={16} /> {t('dashboard.viewDailyReports')}
            </Button>
            <Button
              as={Link}
              to={nextInvoice ? `/parent/invoices/${nextInvoice.id}` : '/parent/billing'}
              variant="outline"
              className="w-full justify-start"
            >
              <CreditCard size={16} /> {outstanding > 0 ? t('dashboard.balanceAmount', { amount: money(outstanding) }) : t('dashboard.viewBilling')}
            </Button>
            <Button as={Link} to="/parent/messages" variant="outline" className="w-full justify-start">
              <Megaphone size={16} /> {t('dashboard.readAnnouncements')}
            </Button>
            <Button as={Link} to="/parent/documents" variant="outline" className="w-full justify-start">
              <Clock size={16} /> {t('dashboard.formsDocuments')}
            </Button>
          </div>
        </Card>

        {/* Latest announcement — mobile #2, desktop right column / row 3 */}
        {latestAnnouncement && (
          <Card className="overflow-hidden xl:col-start-2 xl:row-start-3">
            <div className="border-b border-slate-100 bg-[#FDF1DC] px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8a6112]">{t('dashboard.latestAnnouncement')}</p>
              <h3 className="mt-1 font-display text-base font-bold text-slate-900">{latestAnnouncement.title}</h3>
              <p className="text-xs text-slate-500">{fmtDate(latestAnnouncement.date, 'EEEE, MMMM d')}</p>
            </div>
            <div className="md px-5 py-4 text-sm">
              <ReactMarkdown>{latestAnnouncement.body}</ReactMarkdown>
            </div>
            <div className="border-t border-slate-100 px-5 py-3">
              <Link
                to="/parent/messages"
                className="inline-flex items-center gap-1 text-sm font-semibold text-[#3F8570] hover:underline"
              >
                {t('dashboard.allAnnouncements')} <ArrowRight size={14} />
              </Link>
            </div>
          </Card>
        )}

        {/* Today's glance (attendance) — mobile #3, desktop left column / row 2 */}
        <Card className="overflow-hidden xl:col-start-1 xl:row-start-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <h2 className="font-display text-lg font-bold text-slate-900">{t('dashboard.todayGlance')}</h2>
            <Button as={Link} to="/parent/attendance" size="sm" variant="ghost">
              {t('dashboard.attendanceHistory')} <ArrowRight size={14} />
            </Button>
          </div>

          {todayRows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={UserRound}
                title={t('dashboard.noChildrenTitle')}
                description={t('dashboard.noChildrenDesc')}
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
                    {/* A minimum width rather than min-w-0: this row already wraps, so the
                        times and status move to a second line instead of starving the child's
                        name down to a few characters at phone width. */}
                    <div className="min-w-[10rem] flex-1">
                      <Link
                        to={`/parent/children/${child.id}`}
                        className="font-display text-sm font-bold text-slate-900 transition hover:text-[#3F8570]"
                      >
                        {child.name}
                      </Link>
                      <p className="truncate text-xs text-slate-500">
                        {t('dashboard.childMeta', { ageGroup: t(`ageGroup.${child.ageGroup}`), age: ageLabel(child.dob), teacher: child.teacher })}
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
                    <Badge tone={statusTone(status)}>{t(`status.${status}`)}</Badge>
                  </motion.li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Latest daily report — mobile #4, desktop left column / row 3 */}
        <div className="xl:col-start-1 xl:row-start-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-slate-900">{t('dashboard.latestReport')}</h2>
            <Button as={Link} to="/parent/daily-reports" size="sm" variant="ghost">
              {t('dashboard.seeAll')} <ArrowRight size={14} />
            </Button>
          </div>
          {latestLog ? (
            <DailyLogCard log={latestLog} child={kids.find((k) => k.id === latestLog.childId)} />
          ) : (
            <EmptyState
              icon={NotebookPen}
              title={t('dashboard.noReportsTitle')}
              description={t('dashboard.noReportsDesc')}
            />
          )}
        </div>

        {/* Billing info — mobile #5, desktop full-width row 1 */}
        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:col-start-1 xl:col-span-2 xl:row-start-1">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:col-start-1 xl:col-span-2 xl:row-start-1">
            <StatCard
              icon={Wallet}
              label={t('dashboard.statBalance')}
              value={money(outstanding)}
              sub={outstanding > 0 ? t('dashboard.statBalanceSubOwed') : t('dashboard.statBalanceSubClear')}
              tone={outstanding > 0 ? 'amber' : 'green'}
              to="/parent/billing"
            />
            <StatCard
              icon={CalendarClock}
              label={t('dashboard.statNextInvoice')}
              value={nextInvoice ? fmtDate(nextInvoice.dueDate, 'MMM d') : '—'}
              sub={nextInvoice ? t('dashboard.statNextInvoiceSub', { id: nextInvoice.id, amount: money(nextInvoice.amount) }) : t('dashboard.statNextInvoiceSubNone')}
              tone="violet"
              to={nextInvoice ? `/parent/invoices/${nextInvoice.id}` : '/parent/billing'}
            />
          </div>
        )}

      </div>
    </PageTransition>
  )
}

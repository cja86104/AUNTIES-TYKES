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
import { useTranslation } from 'react-i18next'
import PageTransition from '../../components/PageTransition'
import { Avatar, Badge, Button, Card, EmptyState, statusTone } from '../../components/ui'
import DailyLogCard from '../../components/DailyLogCard'
import { useStore } from '../../store/useStore'
import { useFamilyScope } from '../../lib/useFamilyScope'
import { ageLabel, fmtDate, fmtTime, todayISO } from '../../lib/helpers'

export default function ParentChildDetail() {
  const { t } = useTranslation()
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
          title={t('childDetail.notFoundTitle')}
          description={t('childDetail.notFoundDesc')}
          action={
            <Button as={Link} to="/parent/children">
              {t('childDetail.backToChildren')}
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
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-[#3F8570]"
      >
        <ArrowLeft size={15} /> {t('childDetail.backToChildren')}
      </Link>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-5 bg-gradient-to-br from-[#E8F3EE] to-white px-6 py-6">
          <Avatar name={child.name} hue={child.hue} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              {child.name}
            </h1>
            <p className="mt-1 text-slate-600">
              {t('dashboard.childMeta', { ageGroup: t(`ageGroup.${child.ageGroup}`), age: ageLabel(child.dob), teacher: child.teacher })}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone={statusTone(child.status)}>{t(`status.${child.status}`)}</Badge>
              <Badge tone="neutral">{child.plan}</Badge>
              {todayRecord && <Badge tone={statusTone(todayRecord.status)}>{t('childDetail.todayLabel', { status: t(`status.${todayRecord.status}`) })}</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button as={Link} to={`/parent/daily-reports/${child.id}`}>
              <NotebookPen size={16} /> {t('childDetail.dailyReports')}
            </Button>
            <Button as={Link} to="/parent/attendance" variant="outline">
              <CalendarDays size={16} /> {t('childDetail.attendance')}
            </Button>
          </div>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-display text-lg font-bold text-slate-900">{t('childDetail.onFile')}</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t('childDetail.dob')}</dt>
                <dd className="font-semibold text-slate-800">{fmtDate(child.dob)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t('childDetail.started')}</dt>
                <dd className="font-semibold text-slate-800">{fmtDate(child.startDate)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t('childDetail.plan')}</dt>
                <dd className="font-semibold text-slate-800">{child.plan}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t('childDetail.groupRatio')}</dt>
                <dd className="text-right font-semibold text-slate-800">{settings.ratios}</dd>
              </div>
            </dl>

            <div className="mt-5 space-y-3">
              <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 p-3.5 text-rose-900">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider">{t('childDetail.allergies')}</p>
                  <p className="mt-0.5 text-sm">
                    {child.allergies.length > 0 ? child.allergies.join(' · ') : t('childDetail.allergiesNone')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl bg-[#FDF1DC] p-3.5 text-[#7a5510]">
                <Pill size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider">{t('childDetail.medications')}</p>
                  <p className="mt-0.5 text-sm">
                    {child.medications.length > 0 ? child.medications.join(' · ') : t('childDetail.medicationsNone')}
                  </p>
                </div>
              </div>
              {child.notes && (
                <div className="flex items-start gap-2.5 rounded-xl bg-[#FBEEF1] p-3.5 text-[#1f6152]">
                  <Sparkles size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider">{t('childDetail.notesLabel')}</p>
                    <p className="mt-0.5 text-sm">{child.notes}</p>
                  </div>
                </div>
              )}
            </div>

            <p className="mt-5 text-xs text-slate-500">
              {t('childDetail.outOfDate')}{' '}
              <Link to="/parent/messages" className="font-semibold text-[#3F8570] hover:underline">
                {t('childDetail.sendNote')}
              </Link>{' '}
              {t('childDetail.andWeUpdate')}
            </p>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <h2 className="font-display text-lg font-bold text-slate-900">{t('childDetail.recentDays')}</h2>
              <Badge tone="green">
                <Clock size={12} /> {t('childDetail.daysOfLast', { days: daysHere, total: recentAttendance.length })}
              </Badge>
            </div>
            {recentAttendance.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={CalendarDays} title={t('childDetail.noAttendanceTitle')} description={t('childDetail.noAttendanceDesc')} />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentAttendance.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="text-slate-700">{fmtDate(a.date, 'EEE, MMM d')}</span>
                    <span className="text-xs text-slate-500">
                      {a.checkIn ? `${fmtTime(a.checkIn)} – ${a.checkOut ? fmtTime(a.checkOut) : t('childDetail.stillHere')}` : '—'}
                    </span>
                    <Badge tone={statusTone(a.status)}>{t(`status.${a.status}`)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-slate-900">{t('childDetail.recentReports')}</h2>
            <Button as={Link} to={`/parent/daily-reports/${child.id}`} size="sm" variant="ghost">
              {t('childDetail.seeAll')}
            </Button>
          </div>
          {logs.length === 0 ? (
            <EmptyState
              icon={NotebookPen}
              title={t('childDetail.noReportsTitle', { name: child.name.split(' ')[0] })}
              description={t('childDetail.noReportsDesc')}
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

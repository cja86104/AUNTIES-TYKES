import { useMemo } from 'react'
import { addDays, format } from 'date-fns'
import { CalendarDays, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import PageTransition from '../../components/PageTransition'
import { Badge, Card, EmptyState, PageHeader } from '../../components/ui'
import type { Tone } from '../../components/ui'
import { useStore } from '../../store/useStore'
import { useFamilyScope } from '../../lib/useFamilyScope'
import { buildCalendar } from '../../lib/calendar'
import type { CalendarEntry, CalendarEntryKind } from '../../lib/calendar'
import { fmtDate, fmtTime, todayISO } from '../../lib/helpers'

/** payment_due never reaches the parent view, so it has no tone here. */
const TONES: Partial<Record<CalendarEntryKind, Tone>> = {
  closure: 'rose',
  early_close: 'amber',
  activity: 'blue',
  reminder: 'neutral',
  schedule_exception: 'amber',
  birthday: 'green',
}

export default function ParentCalendar() {
  const { t } = useTranslation()
  const calendarEvents = useStore((s) => s.calendarEvents)
  const { kids } = useFamilyScope()

  const entries = useMemo(
    () =>
      buildCalendar({
        events: calendarEvents,
        children: kids,
        // Payment dates are excluded from the parent view by buildCalendar —
        // families see what they owe on the billing page instead.
        invoices: [],
        from: todayISO(),
        to: format(addDays(new Date(), 365), 'yyyy-MM-dd'),
        parentView: true,
        familyChildIds: kids.map((c) => c.id),
      }),
    [calendarEvents, kids],
  )

  const byMonth = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>()
    for (const entry of entries) {
      const key = entry.date.slice(0, 7)
      const list = map.get(key)
      if (list) list.push(entry)
      else map.set(key, [entry])
    }
    return [...map.entries()]
  }, [entries])

  return (
    <PageTransition>
      <PageHeader title={t('calendar.title')} description={t('calendar.description')} />

      {byMonth.length === 0 ? (
        <EmptyState icon={CalendarDays} title={t('calendar.emptyTitle')} description={t('calendar.emptyDesc')} />
      ) : (
        <div className="space-y-8">
          {byMonth.map(([month, list]) => (
            <section key={month}>
              <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-slate-500">
                {fmtDate(`${month}-01`, 'MMMM yyyy')}
              </h2>
              <div className="space-y-2.5">
                {list.map((entry) => {
                  const closed = entry.kind === 'closure'
                  return (
                    <Card
                      key={entry.id}
                      className={`flex items-start gap-4 p-4 ${closed ? 'border-[#E86A6A]/40 bg-[#E86A6A]/5' : ''}`}
                    >
                      <div className="w-14 shrink-0 text-center">
                        <div className="font-display text-xl font-black leading-none text-slate-900">
                          {fmtDate(entry.date, 'd')}
                        </div>
                        <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          {fmtDate(entry.date, 'EEE')}
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <Badge tone={TONES[entry.kind] ?? 'neutral'}>{t(`calendar.kind.${entry.kind}`)}</Badge>
                        <p className="mt-1.5 font-semibold text-slate-900">{entry.title}</p>
                        {entry.endsOn && (
                          <p className="text-xs text-slate-500">
                            {t('calendar.through', { date: fmtDate(entry.endsOn) })}
                          </p>
                        )}
                        {entry.closesAt && (
                          <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-[#39569f]">
                            <Clock size={13} /> {t('calendar.careEndsAt', { time: fmtTime(entry.closesAt) })}
                          </p>
                        )}
                        {entry.note && <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{entry.note}</p>}
                      </div>
                    </Card>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageTransition>
  )
}

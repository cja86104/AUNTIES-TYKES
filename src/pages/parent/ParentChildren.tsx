import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { UserRound, AlertTriangle, Pill, ArrowRight, CalendarDays, NotebookPen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import PageTransition from '../../components/PageTransition'
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, statusTone } from '../../components/ui'
import { useFamilyScope } from '../../lib/useFamilyScope'
import { ageLabel, fmtDate } from '../../lib/helpers'

export default function ParentChildren() {
  const { t } = useTranslation()
  const { kids } = useFamilyScope()

  return (
    <PageTransition>
      <PageHeader
        title={t('children.title')}
        description={t('children.description')}
      />

      {kids.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title={t('children.noChildrenTitle')}
          description={t('children.noChildrenDesc')}
          action={
            <Button as={Link} to="/parent/messages">
              {t('children.messageAuntieRoz')}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {kids.map((child, i) => (
            <motion.div
              key={child.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.07, 0.35), duration: 0.4 }}
            >
              <Card hover className="flex h-full flex-col overflow-hidden">
                <div className="flex items-start gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-5">
                  <Avatar name={child.name} hue={child.hue} size="lg" />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg font-extrabold text-slate-900">{child.name}</h2>
                    <p className="text-sm text-slate-600">
                      {t(`ageGroup.${child.ageGroup}`)} · {ageLabel(child.dob)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone={statusTone(child.status)}>{t(`status.${child.status}`)}</Badge>
                      <Badge tone="neutral">{child.plan}</Badge>
                    </div>
                  </div>
                </div>

                <div className="flex-1 space-y-3 px-5 py-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">{t('children.teacher')}</span>
                    <span className="font-semibold text-slate-800">{child.teacher}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">{t('children.started')}</span>
                    <span className="font-semibold text-slate-800">{fmtDate(child.startDate)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">{t('children.birthday')}</span>
                    <span className="font-semibold text-slate-800">{fmtDate(child.dob)}</span>
                  </div>

                  {child.allergies.length > 0 && (
                    <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 p-3 text-rose-900">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider">{t('children.allergies')}</p>
                        <p className="mt-0.5 text-sm">{child.allergies.join(' · ')}</p>
                      </div>
                    </div>
                  )}

                  {child.medications.length > 0 && (
                    <div className="flex items-start gap-2.5 rounded-xl bg-[#FDF1DC] p-3 text-[#7a5510]">
                      <Pill size={16} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider">{t('children.medications')}</p>
                        <p className="mt-0.5 text-sm">{child.medications.join(' · ')}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-4">
                  <Button as={Link} to={`/parent/children/${child.id}`} size="sm">
                    {t('children.fullProfile')} <ArrowRight size={14} />
                  </Button>
                  <Button as={Link} to={`/parent/daily-reports/${child.id}`} size="sm" variant="outline">
                    <NotebookPen size={14} /> {t('children.reports')}
                  </Button>
                  <Button as={Link} to="/parent/attendance" size="sm" variant="ghost">
                    <CalendarDays size={14} /> {t('children.attendance')}
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </PageTransition>
  )
}

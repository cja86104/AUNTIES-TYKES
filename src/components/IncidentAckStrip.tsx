import { CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui'
import { useStore } from '../store/useStore'
import { fmtDate } from '../lib/helpers'
import type { DailyLog } from '../types'

/**
 * The parent's acknowledge strip under an incident report: a button until
 * they confirm the current version, then the date they did. Renders nothing
 * for a report without an incident.
 */
export default function IncidentAckStrip({ log }: { log: DailyLog }) {
  const { t } = useTranslation()
  const userId = useStore((s) => s.user?.id)
  const incidentAcks = useStore((s) => s.incidentAcks)
  const acknowledgeIncident = useStore((s) => s.acknowledgeIncident)
  const pushToast = useStore((s) => s.pushToast)

  if (!log.incident) return null
  const version = log.incident.recordedAt
  const ack = incidentAcks.find((a) => a.logId === log.id && a.profileId === userId && a.version === version)

  if (ack) {
    return (
      <p className="flex items-center gap-2 text-sm font-semibold text-[#2E8C72]">
        <CheckCircle2 size={16} /> {t('dailyLogCard.incidentAcked', { date: fmtDate(ack.acknowledgedAt, 'MMM d, yyyy h:mm a') })}
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-rose-900">{t('dailyLogCard.incidentAckPrompt')}</p>
      <Button
        size="sm"
        variant="accent"
        onClick={() => {
          acknowledgeIncident(log.id)
          pushToast({ title: t('dailyLogCard.incidentAckToast') })
        }}
      >
        <CheckCircle2 size={15} /> {t('dailyLogCard.incidentAckButton')}
      </Button>
    </div>
  )
}

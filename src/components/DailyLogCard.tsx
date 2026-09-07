import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Utensils, Moon, Baby, Smile, Sparkles, NotebookPen } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card, Badge, Avatar } from './ui'
import { fmtDay } from '../lib/helpers'
import type { Child, DailyLog } from '../types'

interface RowProps {
  icon: LucideIcon
  label: string
  children: ReactNode
}

const Row = ({ icon: Icon, label, children }: RowProps) => (
  <div className="flex gap-3">
    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
      <Icon size={15} />
    </span>
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-slate-700">{children}</p>
    </div>
  </div>
)

export interface DailyLogCardProps {
  log: DailyLog
  child?: Child | undefined
  index?: number
  actions?: ReactNode
}

export default function DailyLogCard({ log, child, index = 0, actions }: DailyLogCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.4), duration: 0.4 }}
    >
      <Card hover className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4">
          <div className="flex items-center gap-3">
            <Avatar name={child?.name ?? 'Child'} hue={child?.hue} size="md" />
            <div>
              <p className="font-display text-base font-bold text-slate-900">{child?.name ?? 'Child'}</p>
              <p className="text-xs text-slate-500">{fmtDay(log.date)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="amber">
              <Smile size={12} /> {log.mood}
            </Badge>
            {actions}
          </div>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Row icon={Utensils} label="Meals">{log.meals}</Row>
          <Row icon={Moon} label="Naps">{log.naps}</Row>
          <Row icon={Baby} label="Diapers / potty">{log.potty}</Row>
          <Row icon={Sparkles} label="Activities">{log.activities.join(' · ')}</Row>
          <div className="sm:col-span-2">
            <Row icon={NotebookPen} label={`Note from ${log.author || 'Auntie Roz'}`}>{log.notes || '—'}</Row>
          </div>
        </div>

        {log.photos.length > 0 && (
          <div className="flex gap-3 overflow-x-auto border-t border-slate-100 px-5 py-4">
            {log.photos.map((p) => (
              <figure key={p.slot} className="w-52 shrink-0">
                <div className="h-32 w-full overflow-hidden rounded-xl bg-slate-100">
                  <img
                    data-aiwp-slot={p.slot}
                    src={p.url}
                    alt={p.caption || 'Daily report photo'}
                    className="h-full w-full object-cover transition duration-500 hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <figcaption className="mt-1.5 text-xs text-slate-500">{p.caption}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  )
}

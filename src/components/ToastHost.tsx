import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { useStore } from '../store/useStore'

const icons = { success: CheckCircle2, error: AlertTriangle, info: Info }
const rings = {
  success: 'border-[#D98B9B]/50 text-[#2E8C72]',
  error: 'border-rose-300 text-rose-600',
  info: 'border-[#3F8570]/40 text-[#1F4A3D]',
}

export default function ToastHost() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)

  return (
    <div className="pointer-events-none fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-[120] flex w-[min(92vw,22rem)] flex-col gap-3">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = icons[t.tone] || CheckCircle2
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 60, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              className={`pointer-events-auto flex items-start gap-3 rounded-2xl border bg-white/95 p-4 shadow-[0_20px_40px_-20px_rgba(16,24,40,0.4)] backdrop-blur ${rings[t.tone] || rings.success}`}
              role="status"
            >
              <Icon size={20} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold text-slate-900">{t.title}</p>
                {t.description && <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{t.description}</p>}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="shrink-0 inline-flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center sm:min-h-0 sm:min-w-0 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={14} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
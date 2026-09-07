import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Inbox, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cx, initials } from '../lib/helpers'

/* -------------------------------- Button --------------------------------- */

const variants = {
  primary:
    'bg-[#4F77D9] text-white shadow-[0_10px_24px_-12px_rgba(79,119,217,0.9)] hover:bg-[#4169c9] hover:-translate-y-0.5',
  sunny: 'bg-[#F5B942] text-[#4a3a12] shadow-[0_10px_24px_-12px_rgba(245,185,66,0.9)] hover:bg-[#efad2b] hover:-translate-y-0.5',
  accent: 'bg-[#5DC4A6] text-[#0f3f33] shadow-[0_10px_24px_-12px_rgba(93,196,166,0.9)] hover:bg-[#4bb797] hover:-translate-y-0.5',
  outline: 'border border-slate-300 bg-white text-slate-700 hover:border-[#4F77D9] hover:text-[#4F77D9] hover:-translate-y-0.5',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 hover:-translate-y-0.5',
  dark: 'bg-slate-900 text-white hover:bg-slate-800 hover:-translate-y-0.5',
} as const

const sizes = {
  sm: 'text-sm px-3 py-1.5 gap-1.5 rounded-lg',
  md: 'text-sm px-4 py-2.5 gap-2 rounded-xl',
  lg: 'text-base px-6 py-3.5 gap-2.5 rounded-2xl',
} as const

export type ButtonVariant = keyof typeof variants
export type ButtonSize = keyof typeof sizes

interface ButtonOwnProps {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  children?: React.ReactNode
}

type ButtonProps<T extends React.ElementType> = ButtonOwnProps & {
  as?: T
} & Omit<React.ComponentPropsWithoutRef<T>, keyof ButtonOwnProps | 'as'>

export function Button<T extends React.ElementType = 'button'>({
  as,
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps<T>) {
  const As: React.ElementType = as ?? 'button'
  return (
    <As
      className={cx(
        'inline-flex items-center justify-center font-semibold transition-all duration-200 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  )
}

/* --------------------------------- Card ---------------------------------- */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean
}

export function Card({ className = '', hover = false, children, ...rest }: CardProps) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]',
        hover && 'transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_rgba(16,24,40,0.28)] hover:border-slate-300',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

/* -------------------------------- Badge ---------------------------------- */

const tones = {
  neutral: 'bg-slate-100 text-slate-700',
  blue: 'bg-[#4F77D9]/10 text-[#39569f]',
  green: 'bg-[#5DC4A6]/15 text-[#25705c]',
  amber: 'bg-[#F5B942]/20 text-[#8a6112]',
  rose: 'bg-rose-100 text-rose-700',
  violet: 'bg-violet-100 text-violet-700',
} as const

export type Tone = keyof typeof tones

export interface BadgeProps {
  tone?: Tone
  className?: string
  children?: React.ReactNode
}

export function Badge({ tone = 'neutral', className = '', children }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tracking-tight',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function statusTone(status: string | null | undefined): Tone {
  const s = String(status ?? '').toLowerCase()
  if (['paid', 'present', 'active'].includes(s)) return 'green'
  if (['overdue', 'absent'].includes(s)) return 'rose'
  if (['unpaid', 'expected', 'waitlist', 'partial'].includes(s)) return 'amber'
  if (s === 'checked-out') return 'blue'
  return 'neutral'
}

/* ------------------------------ Field inputs ------------------------------ */

const fieldBase =
  'w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 transition-all duration-200 focus:outline-none focus:ring-4'

const normalRing = 'border-slate-300 focus:border-[#4F77D9] focus:ring-[#4F77D9]/15'
const invalidRing = 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'

export interface FieldProps {
  label?: React.ReactNode
  error?: string
  hint?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function Field({ label, error, hint, children, className = '' }: FieldProps) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-rose-600">{error}</span>}
    </label>
  )
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = '', invalid, ...rest },
  ref,
) {
  return <input ref={ref} className={cx(fieldBase, invalid ? invalidRing : normalRing, className)} {...rest} />
})

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className = '', invalid, rows = 4, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cx(fieldBase, 'resize-y leading-relaxed', invalid ? invalidRing : normalRing, className)}
      {...rest}
    />
  )
})

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className = '', invalid, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cx(fieldBase, 'appearance-none bg-[length:16px] pr-9', invalid ? invalidRing : normalRing, className)}
      {...rest}
    >
      {children}
    </select>
  )
})

/* -------------------------------- Modal ---------------------------------- */

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}

export function Modal({ open, onClose, title, description, children, footer, wide = false }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className={cx(
              'relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl',
              wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
            )}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-extrabold text-slate-900">{title}</h3>
                {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
              </div>
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            {children}
            {footer && <div className="mt-6 flex flex-wrap justify-end gap-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------- Skeletons -------------------------------- */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cx('at-skeleton rounded-lg', className)} />
}

export function SkeletonCard() {
  return (
    <Card className="p-5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-4 h-8 w-32" />
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-3/4" />
    </Card>
  )
}

/* ------------------------------ Empty state ------------------------------- */

export interface EmptyStateProps {
  icon?: LucideIcon
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
      <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#EAF0FC] to-[#FDF1DC] text-[#4F77D9]">
        <Icon size={26} />
      </div>
      <h4 className="font-display text-lg font-bold text-slate-800">{title}</h4>
      {description && <p className="mt-1.5 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* -------------------------------- StatCard -------------------------------- */

const statTones = {
  blue: 'from-[#EAF0FC] to-white text-[#4F77D9]',
  amber: 'from-[#FDF1DC] to-white text-[#C98A18]',
  green: 'from-[#E6F6F0] to-white text-[#2E8C72]',
  rose: 'from-[#FDECEC] to-white text-[#C25252]',
  violet: 'from-[#F4EEFD] to-white text-[#6F4CB8]',
} as const

export interface StatCardProps {
  icon?: LucideIcon
  label: React.ReactNode
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: keyof typeof statTones
  /** When set the whole card becomes a link to this route. */
  to?: string
  onClick?: () => void
}

export function StatCard({ icon: Icon, label, value, sub, tone = 'blue', to, onClick }: StatCardProps) {
  const interactive = Boolean(to || onClick)
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-2 font-display text-3xl font-extrabold tracking-tight text-slate-900">{value}</p>
          {sub && <p className="mt-1.5 text-xs text-slate-500">{sub}</p>}
        </div>
        {Icon && (
          <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br', statTones[tone])}>
            <Icon size={20} />
          </span>
        )}
      </div>
      {interactive && (
        <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#4F77D9] opacity-0 transition group-hover:opacity-100">
          Open <ChevronRight size={13} />
        </span>
      )}
    </>
  )

  const shell = cx(
    'group block w-full rounded-2xl border border-slate-200/80 bg-white p-5 text-left transition-all duration-300',
    interactive && 'hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_rgba(16,24,40,0.3)]',
  )

  if (to) {
    return (
      <Link to={to} className={shell}>
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={shell}>
        {body}
      </button>
    )
  }
  return <div className={shell}>{body}</div>
}

/* ------------------------------- Avatar ----------------------------------- */

const avatarSizes = { sm: 'h-8 w-8 text-xs', md: 'h-11 w-11 text-sm', lg: 'h-16 w-16 text-lg', xl: 'h-24 w-24 text-2xl' } as const

export interface AvatarProps {
  name?: string
  hue?: string
  size?: keyof typeof avatarSizes
  className?: string
}

export function Avatar({ name = '', hue = 'from-[#4F77D9] to-[#7DA0F0]', size = 'md', className = '' }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br font-display font-extrabold text-white shadow-inner',
        hue,
        avatarSizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}

/* ---------------------------- Section heading ----------------------------- */

export interface SectionHeadingProps {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  align?: 'left' | 'center'
  className?: string
}

export function SectionHeading({ eyebrow, title, description, align = 'left', className = '' }: SectionHeadingProps) {
  return (
    <div className={cx(align === 'center' && 'mx-auto max-w-2xl text-center', className)}>
      {eyebrow && (
        <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#4F77D9]/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[#39569f]">
          {eyebrow}
        </span>
      )}
      <h2 className="font-display text-3xl font-extrabold leading-tight text-slate-900 sm:text-4xl">{title}</h2>
      {description && <p className="mt-4 text-lg leading-relaxed text-slate-600">{description}</p>}
    </div>
  )
}

/* --------------------------------- Tabs ----------------------------------- */

export interface TabItem {
  value: string
  label: React.ReactNode
  count?: number
}

export interface TabsProps {
  tabs: TabItem[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function Tabs({ tabs, value, onChange, className = '' }: TabsProps) {
  return (
    <div className={cx('flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1.5', className)} role="tablist">
      {tabs.map((t) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cx(
              'relative rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-all',
              active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1.5 text-xs font-bold text-slate-400">{t.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------ Page header ------------------------------- */

export interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
}

export function PageHeader({ title, description, actions, children }: PageHeaderProps) {
  return (
    <div className="mb-7 flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </div>
  )
}

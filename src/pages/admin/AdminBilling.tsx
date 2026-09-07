import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Wallet,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ReceiptText,
  CalendarClock,
} from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import { Badge, Button, Card, EmptyState, PageHeader, StatCard } from '../../components/ui'
import { useStore } from '../../store/useStore'
import { fmtDate, invoiceBalance, invoiceStatus, money, daysUntil } from '../../lib/helpers'
import type { Payment } from '../../types'

interface PaymentRow extends Payment {
  invoiceId: string
  familyId: string
}

export default function AdminBilling() {
  const invoices = useStore((s) => s.invoices)
  const families = useStore((s) => s.families)

  const familyName = (id: string) => families.find((f) => f.id === id)?.name ?? 'Unknown family'

  const totals = useMemo(() => {
    const billed = invoices.reduce((s, i) => s + i.amount, 0)
    const collected = invoices.reduce((s, i) => s + i.payments.reduce((p, x) => p + x.amount, 0), 0)
    const outstanding = invoices.reduce((s, i) => s + invoiceBalance(i), 0)
    const overdue = invoices.filter((i) => invoiceStatus(i) === 'overdue')
    const overdueTotal = overdue.reduce((s, i) => s + invoiceBalance(i), 0)
    return { billed, collected, outstanding, overdueCount: overdue.length, overdueTotal }
  }, [invoices])

  /** Outstanding balance per family, largest first. */
  const byFamily = useMemo(
    () =>
      families
        .map((f) => {
          const own = invoices.filter((i) => i.familyId === f.id)
          const balance = own.reduce((s, i) => s + invoiceBalance(i), 0)
          const openInvoices = own.filter((i) => invoiceBalance(i) > 0)
          const dueDates = openInvoices.map((i) => i.dueDate).sort()
          const nextDue: string | undefined = dueDates.length > 0 ? dueDates[0] : undefined
          return { family: f, balance, open: openInvoices.length, nextDue }
        })
        .sort((a, b) => b.balance - a.balance),
    [families, invoices],
  )

  const recentPayments = useMemo(() => {
    const rows: PaymentRow[] = []
    invoices.forEach((i) => i.payments.forEach((p) => rows.push({ ...p, invoiceId: i.id, familyId: i.familyId })))
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8)
  }, [invoices])

  /** Aging buckets for anything still owed. */
  const aging = useMemo(() => {
    const buckets = { current: 0, late30: 0, late60: 0, late60plus: 0 }
    invoices.forEach((i) => {
      const bal = invoiceBalance(i)
      if (bal <= 0) return
      const d = daysUntil(i.dueDate)
      const overdueBy = d === null ? 0 : -d
      if (overdueBy <= 0) buckets.current += bal
      else if (overdueBy <= 30) buckets.late30 += bal
      else if (overdueBy <= 60) buckets.late60 += bal
      else buckets.late60plus += bal
    })
    return buckets
  }, [invoices])

  const agingRows = [
    { label: 'Not yet due', value: aging.current, tone: 'bg-[#5DC4A6]' },
    { label: '1–30 days late', value: aging.late30, tone: 'bg-[#F5B942]' },
    { label: '31–60 days late', value: aging.late60, tone: 'bg-[#E8994A]' },
    { label: '60+ days late', value: aging.late60plus, tone: 'bg-rose-500' },
  ]
  const agingMax = Math.max(...agingRows.map((r) => r.value), 1)
  const collectionRate = totals.billed > 0 ? Math.round((totals.collected / totals.billed) * 100) : 0

  return (
    <PageTransition>
      <PageHeader
        title="Billing"
        description="Where the money stands across every family — what you have billed, collected, and are still owed."
        actions={
          <Button as={Link} to="/admin/invoices">
            <ReceiptText size={16} /> All invoices
          </Button>
        }
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={TrendingUp} label="Total billed" value={money(totals.billed)} sub={`${invoices.length} statements issued`} tone="blue" />
        <StatCard icon={CheckCircle2} label="Collected" value={money(totals.collected)} sub={`${collectionRate}% of everything billed`} tone="green" />
        <StatCard icon={Wallet} label="Outstanding" value={money(totals.outstanding)} sub="Across all open statements" tone="amber" />
        <StatCard
          icon={AlertTriangle}
          label="Overdue"
          value={money(totals.overdueTotal)}
          sub={`${totals.overdueCount} ${totals.overdueCount === 1 ? 'invoice past due' : 'invoices past due'}`}
          tone="rose"
          to="/admin/invoices"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <h2 className="font-display text-lg font-bold text-slate-900">Balance by family</h2>
            <Badge tone="neutral">{byFamily.filter((r) => r.balance > 0).length} with a balance</Badge>
          </div>

          {byFamily.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={Wallet} title="No families yet" description="Enroll a family to start billing." />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {byFamily.map(({ family, balance, open, nextDue }, i) => (
                <motion.li
                  key={family.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.05, 0.3) }}
                  className="flex flex-wrap items-center gap-3 px-5 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/admin/families/${family.id}`}
                      className="font-display text-sm font-bold text-slate-900 transition hover:text-[#4F77D9]"
                    >
                      {family.name}
                    </Link>
                    <p className="truncate text-xs text-slate-500">
                      {family.primaryContact} ·{' '}
                      {open > 0 ? `${open} open ${open === 1 ? 'invoice' : 'invoices'}` : 'All settled'}
                      {nextDue ? ` · next due ${fmtDate(nextDue)}` : ''}
                    </p>
                  </div>
                  <p className={`font-display text-lg font-extrabold ${balance > 0 ? 'text-slate-900' : 'text-[#2E8C72]'}`}>
                    {balance > 0 ? money(balance) : 'Paid up'}
                  </p>
                </motion.li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-display text-lg font-bold text-slate-900">Aging</h2>
            <p className="mt-1 text-sm text-slate-500">How overdue the outstanding money is.</p>
            <ul className="mt-5 space-y-4">
              {agingRows.map((r) => (
                <li key={r.label}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{r.label}</span>
                    <span className="font-semibold text-slate-900">{money(r.value)}</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                      className={`h-full rounded-full ${r.tone}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${(r.value / agingMax) * 100}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-lg font-bold text-slate-900">Recent payments</h2>
            {recentPayments.length === 0 ? (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                <CalendarClock size={18} /> No payments recorded yet.
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {recentPayments.map((p) => (
                  <li key={p.id} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
                    <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-[#2E8C72]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900">{money(p.amount)}</p>
                      <p className="truncate text-xs text-slate-500">
                        {familyName(p.familyId)} · {fmtDate(p.date)}
                      </p>
                      <p className="text-xs text-slate-400">{p.method}</p>
                    </div>
                    <Link
                      to={`/admin/invoices/${p.invoiceId}`}
                      className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#4F77D9] hover:underline"
                    >
                      {p.invoiceId} <ArrowRight size={12} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </PageTransition>
  )
}

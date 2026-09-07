import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Wallet, CheckCircle2, AlertTriangle, ArrowRight, ReceiptText, CalendarClock } from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import { Badge, Button, Card, EmptyState, PageHeader, StatCard, Tabs, statusTone } from '../../components/ui'
import { useFamilyScope } from '../../lib/useFamilyScope'
import { fmtDate, invoiceBalance, invoiceStatus, money, daysUntil } from '../../lib/helpers'
import type { InvoiceStatus, Payment } from '../../types'

interface PaymentRow extends Payment {
  invoiceId: string
}

export default function ParentBilling() {
  const { invoices, outstanding, nextInvoice, overdueCount } = useFamilyScope()
  const [tab, setTab] = useState<'all' | InvoiceStatus>('all')

  const decorated = useMemo(
    () => invoices.map((inv) => ({ inv, status: invoiceStatus(inv), balance: invoiceBalance(inv) })),
    [invoices],
  )

  const rows = useMemo(
    () => decorated.filter((r) => (tab === 'all' ? true : r.status === tab)),
    [decorated, tab],
  )

  const lastPayment = useMemo(() => {
    const all: PaymentRow[] = []
    invoices.forEach((i) => i.payments.forEach((p) => all.push({ ...p, invoiceId: i.id })))
    return all.sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  }, [invoices])

  const totalPaid = invoices.reduce((s, i) => s + i.payments.reduce((p, x) => p + x.amount, 0), 0)
  const dueInDays = nextInvoice ? daysUntil(nextInvoice.dueDate) : null

  const tabs = useMemo(
    () => [
      { value: 'all', label: 'All', count: decorated.length },
      { value: 'unpaid', label: 'Open', count: decorated.filter((r) => r.status === 'unpaid').length },
      { value: 'overdue', label: 'Overdue', count: decorated.filter((r) => r.status === 'overdue').length },
      { value: 'paid', label: 'Paid', count: decorated.filter((r) => r.status === 'paid').length },
    ],
    [decorated],
  )

  return (
    <PageTransition>
      <PageHeader
        title="Billing"
        description="Your statements, what is still owed, and every payment we have recorded."
        actions={
          nextInvoice ? (
            <Button as={Link} to={`/parent/invoices/${nextInvoice.id}`}>
              <Wallet size={16} /> Pay {money(invoiceBalance(nextInvoice))}
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Wallet}
          label="Balance due"
          value={money(outstanding)}
          sub={outstanding > 0 ? 'Across your open statements' : 'Nothing owed — thank you!'}
          tone={outstanding > 0 ? 'amber' : 'green'}
        />
        <StatCard
          icon={CalendarClock}
          label="Next due"
          value={nextInvoice ? fmtDate(nextInvoice.dueDate, 'MMM d') : '—'}
          sub={
            dueInDays === null
              ? 'Nothing scheduled'
              : dueInDays < 0
                ? `${Math.abs(dueInDays)} days past due`
                : dueInDays === 0
                  ? 'Due today'
                  : `In ${dueInDays} days`
          }
          tone={dueInDays !== null && dueInDays < 0 ? 'rose' : 'violet'}
        />
        <StatCard icon={CheckCircle2} label="Paid to date" value={money(totalPaid)} sub={`${invoices.length} statements total`} tone="green" />
        <StatCard
          icon={AlertTriangle}
          label="Overdue"
          value={overdueCount}
          sub={overdueCount === 0 ? 'All current' : 'Please settle when you can'}
          tone={overdueCount > 0 ? 'rose' : 'blue'}
        />
      </div>

      {lastPayment && (
        <Card className="mt-6 flex flex-wrap items-center gap-4 border-[#5DC4A6]/40 bg-[#E6F6F0]/50 p-5">
          <CheckCircle2 size={22} className="shrink-0 text-[#2E8C72]" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold text-slate-900">
              Last payment: {money(lastPayment.amount)} on {fmtDate(lastPayment.date)}
            </p>
            <p className="text-xs text-slate-600">
              {lastPayment.method} · applied to {lastPayment.invoiceId}
            </p>
          </div>
          <Button as={Link} to={`/parent/invoices/${lastPayment.invoiceId}`} size="sm" variant="outline">
            View receipt <ArrowRight size={14} />
          </Button>
        </Card>
      )}

      <div className="mb-6 mt-6">
        <Tabs tabs={tabs} value={tab} onChange={(v) => setTab(v as 'all' | InvoiceStatus)} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={tab === 'all' ? 'No invoices yet' : 'Nothing in this view'}
          description={
            tab === 'all'
              ? 'Statements post to your portal on the 1st of each month.'
              : 'Switch tabs to see your other statements.'
          }
          action={
            tab !== 'all' ? (
              <Button variant="outline" onClick={() => setTab('all')}>
                Show all invoices
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {rows.map(({ inv, status, balance }, i) => (
            <motion.div
              key={inv.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.06, 0.35) }}
            >
              <Card hover className="flex h-full flex-col overflow-hidden">
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-4">
                  <div className="min-w-0">
                    <p className="font-display text-base font-extrabold text-slate-900">{inv.id}</p>
                    <p className="truncate text-xs text-slate-500">{inv.period}</p>
                  </div>
                  <Badge tone={statusTone(status)}>{status}</Badge>
                </div>

                <div className="flex-1 space-y-2.5 px-5 py-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Amount</span>
                    <span className="font-semibold text-slate-900">{money(inv.amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Balance</span>
                    <span className={`font-semibold ${balance > 0 ? 'text-slate-900' : 'text-[#2E8C72]'}`}>
                      {balance > 0 ? money(balance) : 'Paid in full'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Due</span>
                    <span className="font-semibold text-slate-900">{fmtDate(inv.dueDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Line items</span>
                    <span className="text-slate-700">{inv.lineItems.length}</span>
                  </div>
                </div>

                <div className="border-t border-slate-100 px-5 py-4">
                  <Button
                    as={Link}
                    to={`/parent/invoices/${inv.id}`}
                    variant={balance > 0 ? 'primary' : 'outline'}
                    className="w-full"
                  >
                    {balance > 0 ? `Pay ${money(balance)}` : 'View statement'}
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

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Wallet, CheckCircle2, AlertTriangle, ArrowRight, ReceiptText, CalendarClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import PageTransition from '../../components/PageTransition'
import { Badge, Button, Card, EmptyState, PageHeader, StatCard, Tabs, statusTone } from '../../components/ui'
import { useFamilyScope } from '../../lib/useFamilyScope'
import { fmtDate, invoiceBalance, invoiceStatus, money, daysUntil } from '../../lib/helpers'
import type { InvoiceStatus, Payment } from '../../types'

interface PaymentRow extends Payment {
  invoiceId: string
}

export default function ParentBilling() {
  const { t } = useTranslation()
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
      { value: 'all', label: t('billing.tabAll'), count: decorated.length },
      { value: 'unpaid', label: t('billing.tabOpen'), count: decorated.filter((r) => r.status === 'unpaid').length },
      { value: 'overdue', label: t('billing.tabOverdue'), count: decorated.filter((r) => r.status === 'overdue').length },
      { value: 'paid', label: t('billing.tabPaid'), count: decorated.filter((r) => r.status === 'paid').length },
    ],
    [decorated],
  )

  return (
    <PageTransition>
      <PageHeader
        title={t('billing.title')}
        description={t('billing.description')}
        actions={
          nextInvoice ? (
            <Button as={Link} to={`/parent/invoices/${nextInvoice.id}`}>
              <Wallet size={16} /> {t('billing.payAmount', { amount: money(invoiceBalance(nextInvoice)) })}
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Wallet}
          label={t('billing.statBalance')}
          value={money(outstanding)}
          sub={outstanding > 0 ? t('billing.statBalanceSubOwed') : t('billing.statBalanceSubClear')}
          tone={outstanding > 0 ? 'amber' : 'green'}
        />
        <StatCard
          icon={CalendarClock}
          label={t('billing.statNextDue')}
          value={nextInvoice ? fmtDate(nextInvoice.dueDate, 'MMM d') : '—'}
          sub={
            dueInDays === null
              ? t('billing.statNextDueSubNone')
              : dueInDays < 0
                ? t('billing.statNextDueSubPastDue', { days: Math.abs(dueInDays) })
                : dueInDays === 0
                  ? t('billing.statNextDueSubToday')
                  : t('billing.statNextDueSubIn', { days: dueInDays })
          }
          tone={dueInDays !== null && dueInDays < 0 ? 'rose' : 'violet'}
        />
        <StatCard icon={CheckCircle2} label={t('billing.statPaidToDate')} value={money(totalPaid)} sub={t('billing.statPaidToDateSub', { count: invoices.length })} tone="green" />
        <StatCard
          icon={AlertTriangle}
          label={t('billing.statOverdue')}
          value={overdueCount}
          sub={overdueCount === 0 ? t('billing.statOverdueSubClear') : t('billing.statOverdueSubSome')}
          tone={overdueCount > 0 ? 'rose' : 'blue'}
        />
      </div>

      {lastPayment && (
        <Card className="mt-6 flex flex-wrap items-center gap-4 border-[#5DC4A6]/40 bg-[#E6F6F0]/50 p-5">
          <CheckCircle2 size={22} className="shrink-0 text-[#2E8C72]" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold text-slate-900">
              {t('billing.lastPayment', { amount: money(lastPayment.amount), date: fmtDate(lastPayment.date) })}
            </p>
            <p className="text-xs text-slate-600">
              {t('billing.lastPaymentSub', { method: lastPayment.method, invoiceId: lastPayment.invoiceId })}
            </p>
          </div>
          <Button as={Link} to={`/parent/invoices/${lastPayment.invoiceId}`} size="sm" variant="outline">
            {t('billing.viewReceipt')} <ArrowRight size={14} />
          </Button>
        </Card>
      )}

      <div className="mb-6 mt-6">
        <Tabs tabs={tabs} value={tab} onChange={(v) => setTab(v as 'all' | InvoiceStatus)} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={tab === 'all' ? t('billing.noInvoicesTitle') : t('billing.noViewTitle')}
          description={
            tab === 'all'
              ? t('billing.noInvoicesDesc')
              : t('billing.noViewDesc')
          }
          action={
            tab !== 'all' ? (
              <Button variant="outline" onClick={() => setTab('all')}>
                {t('billing.showAllInvoices')}
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
                  <Badge tone={statusTone(status)}>{t(`status.${status}`)}</Badge>
                </div>

                <div className="flex-1 space-y-2.5 px-5 py-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t('billing.amount')}</span>
                    <span className="font-semibold text-slate-900">{money(inv.amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t('billing.balance')}</span>
                    <span className={`font-semibold ${balance > 0 ? 'text-slate-900' : 'text-[#2E8C72]'}`}>
                      {balance > 0 ? money(balance) : t('billing.paidInFull')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t('billing.due')}</span>
                    <span className="font-semibold text-slate-900">{fmtDate(inv.dueDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t('billing.lineItems')}</span>
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
                    {balance > 0 ? t('billing.payAmount', { amount: money(balance) }) : t('billing.viewStatement')}
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

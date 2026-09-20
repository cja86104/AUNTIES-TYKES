import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, CreditCard, Receipt, CheckCircle2, Printer, Info } from 'lucide-react'
import { Card, Badge, Button, Modal, Field, Input, Select, statusTone } from './ui'
import { useTranslation } from 'react-i18next'
import { money, fmtDate, invoiceBalance, invoiceStatus } from '../lib/helpers'
import { useStore } from '../store/useStore'
import type { Family, Invoice } from '../types'

export interface InvoiceViewProps {
  invoice: Invoice
  family: Family | undefined
  backTo: string
  mode?: 'admin' | 'parent'
}

/**
 * Payment methods the owner can record.
 *
 * These strings are persisted to `payments.method`, so they are deliberately
 * NOT run through i18n — translating them would write a different value into
 * the database depending on the admin's language and make the ledger
 * unreadable. Every option here is a payment taken outside the app: there is
 * no processor connected, so nothing in this component ever charges anyone.
 */
const PAYMENT_METHODS = ['Check', 'Cash', 'Bank transfer', 'Zelle', 'Card (in person)', 'Other'] as const

export default function InvoiceView({ invoice, family, backTo, mode = 'admin' }: InvoiceViewProps) {
  const { t } = useTranslation()
  const [payOpen, setPayOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0])
  const [reference, setReference] = useState('')
  const recordPayment = useStore((s) => s.recordPayment)
  const pushToast = useStore((s) => s.pushToast)

  const balance = invoiceBalance(invoice)
  const status = invoiceStatus(invoice)
  const paid = (invoice.payments || []).reduce((s, p) => s + p.amount, 0)

  // Recording a payment is an owner action only. A parent pressing a button
  // here would write a payment row against an invoice with no money behind it,
  // so the parent view reports the balance and stops there.
  const canRecord = mode === 'admin'

  const openPay = () => {
    setAmount(String(balance.toFixed(2)))
    setMethod(PAYMENT_METHODS[0])
    setReference('')
    setPayOpen(true)
  }

  const submitPayment = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const value = Math.min(Number(amount) || 0, balance)
    if (value <= 0) {
      pushToast({ tone: 'error', title: t('invoiceView.toastErrorTitle'), description: t('invoiceView.toastErrorDesc') })
      return
    }
    recordPayment(invoice.id, { amount: value, method, ref: reference.trim() })
    setPayOpen(false)
    pushToast({
      title: t('invoiceView.toastRecordedTitle'),
      description: `${t('invoiceView.toastPaymentDesc', { amount: money(value), id: invoice.id, partial: value < balance ? t('invoiceView.partialSuffix') : '' })}.`,
    })
  }

  return (
    <div>
      <Link
        to={backTo}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-[#3F8570]"
      >
        <ArrowLeft size={15} /> {t('invoiceView.backToInvoices')}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 bg-[#E8F3EE] px-6 py-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1F4A3D]">{t('invoiceView.invoice')}</p>
              <h1 className="font-display text-2xl font-extrabold text-slate-900">{invoice.id}</h1>
              <p className="mt-1 text-sm text-slate-600">{invoice.period}</p>
            </div>
            <div className="text-right">
              <Badge tone={statusTone(status)}>{status.toUpperCase()}</Badge>
              <p className="mt-2 font-display text-3xl font-extrabold text-slate-900">{money(invoice.amount)}</p>
              <p className="text-xs text-slate-500">{t('invoiceView.due', { date: fmtDate(invoice.dueDate) })}</p>
            </div>
          </div>

          <div className="px-6 py-5">
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('invoiceView.billedTo')}</p>
                <p className="mt-1 font-semibold text-slate-800">{family?.name}</p>
                <p className="text-slate-600">{family?.primaryContact}</p>
                <p className="text-slate-600">{family?.address}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('invoiceView.issued')}</p>
                <p className="mt-1 text-slate-700">{fmtDate(invoice.issuedAt)}</p>
                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-500">{t('invoiceView.balanceDue')}</p>
                <p className="font-display text-lg font-extrabold text-slate-900">{money(balance)}</p>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                    <th className="pb-2">{t('invoiceView.colDescription')}</th>
                    <th className="pb-2 text-center">{t('invoiceView.colQty')}</th>
                    <th className="pb-2 text-right">{t('invoiceView.colRate')}</th>
                    <th className="pb-2 text-right">{t('invoiceView.colAmount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lineItems.map((li, i) => (
                    <motion.tr
                      key={`${li.label}-${i}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="py-3 pr-3 text-slate-700">{li.label}</td>
                      <td className="py-3 text-center text-slate-600">{li.qty}</td>
                      <td className="py-3 text-right text-slate-600">{money(li.unit)}</td>
                      <td className="py-3 text-right font-semibold text-slate-900">{money(li.amount)}</td>
                    </motion.tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="pt-4 text-right text-sm font-semibold text-slate-600">{t('invoiceView.total')}</td>
                    <td className="pt-4 text-right font-display text-lg font-extrabold text-slate-900">{money(invoice.amount)}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="pt-1 text-right text-sm text-slate-600">{t('invoiceView.paymentsApplied')}</td>
                    <td className="pt-1 text-right font-semibold text-[#2E8C72]">−{money(paid)}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="pt-1 text-right text-sm font-semibold text-slate-700">{t('invoiceView.balance')}</td>
                    <td className="pt-1 text-right font-display text-lg font-extrabold text-slate-900">{money(balance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {invoice.memo && (
              <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                <strong className="font-semibold">{t('invoiceView.memo')}</strong>
                {invoice.memo}
              </p>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="font-display text-lg font-bold text-slate-900">
              {balance > 0 ? t('invoiceView.settleInvoice') : t('invoiceView.paidInFull')}
            </h3>
            <p className="mt-1.5 text-sm text-slate-600">
              {balance > 0
                ? canRecord
                  ? t('invoiceView.payDescAdmin')
                  : t('invoiceView.payDescParent')
                : t('invoiceView.paidThanks')}
            </p>
            {balance > 0 && canRecord && (
              <Button onClick={openPay} className="mt-4 w-full" variant="accent">
                <CreditCard size={16} /> {t('invoiceView.recordPayment')}
              </Button>
            )}
            <Button variant="outline" className="mt-2.5 w-full" onClick={() => window.print()}>
              <Printer size={16} /> {t('invoiceView.printSave')}
            </Button>
          </Card>

          <Card className="p-5">
            <h3 className="font-display text-lg font-bold text-slate-900">{t('invoiceView.paymentHistory')}</h3>
            {invoice.payments?.length ? (
              <ul className="mt-4 space-y-3">
                {invoice.payments.map((p) => (
                  <li key={p.id} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
                    <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-[#2E8C72]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900">{money(p.amount)}</p>
                      <p className="text-xs text-slate-500">
                        {fmtDate(p.date)} · {p.method}
                      </p>
                      {p.ref && <p className="text-xs text-slate-400">{t('invoiceView.ref', { ref: p.ref })}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                <Receipt size={18} /> {t('invoiceView.noPayments')}
              </div>
            )}
          </Card>
        </div>
      </div>

      {canRecord && (
        <Modal
          open={payOpen}
          onClose={() => setPayOpen(false)}
          title={t('invoiceView.recordPaymentTitle')}
          description={t('invoiceView.modalDesc', { id: invoice.id, amount: money(balance) })}
        >
          <form onSubmit={submitPayment} className="space-y-4">
            <Field label={t('invoiceView.amountUsd')}>
              <Input type="number" step="0.01" min="0" max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </Field>
            <Field label={t('invoiceView.method')}>
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('invoiceView.reference')} hint={t('invoiceView.referenceHint')}>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
            <p className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
              <Info size={15} className="mt-0.5 shrink-0" />
              {t('invoiceView.recordNote')}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setPayOpen(false)}>
                {t('invoiceView.cancel')}
              </Button>
              <Button type="submit">{t('invoiceView.apply', { amount: money(Number(amount) || 0) })}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, CreditCard, Receipt, CheckCircle2, Printer } from 'lucide-react'
import { Card, Badge, Button, Modal, Field, Input, Select, statusTone } from './ui'
import { money, fmtDate, invoiceBalance, invoiceStatus } from '../lib/helpers'
import { useStore } from '../store/useStore'
import type { Family, Invoice } from '../types'

export interface InvoiceViewProps {
  invoice: Invoice
  family: Family | undefined
  backTo: string
  mode?: 'admin' | 'parent'
}

export default function InvoiceView({ invoice, family, backTo, mode = 'admin' }: InvoiceViewProps) {
  const [payOpen, setPayOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('Card •••• 4242')
  const recordPayment = useStore((s) => s.recordPayment)
  const pushToast = useStore((s) => s.pushToast)

  const balance = invoiceBalance(invoice)
  const status = invoiceStatus(invoice)
  const paid = (invoice.payments || []).reduce((s, p) => s + p.amount, 0)

  const openPay = () => {
    setAmount(String(balance.toFixed(2)))
    setPayOpen(true)
  }

  const submitPayment = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const value = Math.min(Number(amount) || 0, balance)
    if (value <= 0) {
      pushToast({ tone: 'error', title: 'Enter a payment amount', description: 'The amount must be greater than zero.' })
      return
    }
    recordPayment(invoice.id, { amount: value, method, ref: `DEMO-${Math.floor(Math.random() * 90000 + 10000)}` })
    setPayOpen(false)
    pushToast({
      title: mode === 'parent' ? 'Payment submitted' : 'Payment recorded',
      description: `${money(value)} applied to ${invoice.id}${value < balance ? ' (partial)' : ''}.`,
    })
  }

  return (
    <div>
      <Link
        to={backTo}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-[#4F77D9]"
      >
        <ArrowLeft size={15} /> Back to invoices
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-br from-[#EAF0FC] to-white px-6 py-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#39569f]">Invoice</p>
              <h1 className="font-display text-2xl font-extrabold text-slate-900">{invoice.id}</h1>
              <p className="mt-1 text-sm text-slate-600">{invoice.period}</p>
            </div>
            <div className="text-right">
              <Badge tone={statusTone(status)}>{status.toUpperCase()}</Badge>
              <p className="mt-2 font-display text-3xl font-extrabold text-slate-900">{money(invoice.amount)}</p>
              <p className="text-xs text-slate-500">Due {fmtDate(invoice.dueDate)}</p>
            </div>
          </div>

          <div className="px-6 py-5">
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Billed to</p>
                <p className="mt-1 font-semibold text-slate-800">{family?.name}</p>
                <p className="text-slate-600">{family?.primaryContact}</p>
                <p className="text-slate-600">{family?.address}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Issued</p>
                <p className="mt-1 text-slate-700">{fmtDate(invoice.issuedAt)}</p>
                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-500">Balance due</p>
                <p className="font-display text-lg font-extrabold text-slate-900">{money(balance)}</p>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                    <th className="pb-2">Description</th>
                    <th className="pb-2 text-center">Qty</th>
                    <th className="pb-2 text-right">Rate</th>
                    <th className="pb-2 text-right">Amount</th>
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
                    <td colSpan={3} className="pt-4 text-right text-sm font-semibold text-slate-600">Total</td>
                    <td className="pt-4 text-right font-display text-lg font-extrabold text-slate-900">{money(invoice.amount)}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="pt-1 text-right text-sm text-slate-600">Payments applied</td>
                    <td className="pt-1 text-right font-semibold text-[#2E8C72]">−{money(paid)}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="pt-1 text-right text-sm font-semibold text-slate-700">Balance</td>
                    <td className="pt-1 text-right font-display text-lg font-extrabold text-slate-900">{money(balance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {invoice.memo && (
              <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                <strong className="font-semibold">Memo: </strong>
                {invoice.memo}
              </p>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="font-display text-lg font-bold text-slate-900">
              {balance > 0 ? 'Settle this invoice' : 'Paid in full'}
            </h3>
            <p className="mt-1.5 text-sm text-slate-600">
              {balance > 0
                ? mode === 'parent'
                  ? 'Payments are demo-only in this preview — no card is charged and nothing leaves your browser.'
                  : 'Record a check, cash, or transfer you received outside the portal.'
                : 'Thank you! Nothing is owed on this statement.'}
            </p>
            {balance > 0 && (
              <Button onClick={openPay} className="mt-4 w-full" variant={mode === 'parent' ? 'primary' : 'accent'}>
                <CreditCard size={16} /> {mode === 'parent' ? `Pay ${money(balance)}` : 'Record a payment'}
              </Button>
            )}
            <Button variant="outline" className="mt-2.5 w-full" onClick={() => window.print()}>
              <Printer size={16} /> Print / save PDF
            </Button>
          </Card>

          <Card className="p-5">
            <h3 className="font-display text-lg font-bold text-slate-900">Payment history</h3>
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
                      <p className="text-xs text-slate-400">Ref {p.ref}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                <Receipt size={18} /> No payments recorded yet.
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={mode === 'parent' ? 'Pay invoice' : 'Record payment'}
        description={`${invoice.id} · balance ${money(balance)}`}
      >
        <form onSubmit={submitPayment} className="space-y-4">
          <Field label="Amount (USD)">
            <Input type="number" step="0.01" min="0" max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </Field>
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option>Card •••• 4242</option>
              <option>ACH transfer</option>
              <option>Check</option>
              <option>Cash</option>
              <option>Zelle</option>
            </Select>
          </Field>
          <p className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
            This preview build has no payment processor connected, so nothing is actually charged. The amount is applied
            to the demo ledger so you can see how the flow feels.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Apply {money(Number(amount) || 0)}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
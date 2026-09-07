import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ReceiptText, Plus, Search, Trash2, Wand2, ArrowRight } from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Tabs,
  statusTone,
} from '../../components/ui'
import { useStore } from '../../store/useStore'
import { fmtDate, invoiceBalance, invoiceStatus, money, todayISO, uid } from '../../lib/helpers'
import type { InvoiceStatus, LineItem } from '../../types'

interface DraftLine {
  id: string
  label: string
  qty: string
  unit: string
}

interface InvoiceErrors {
  familyId?: string
  dueDate?: string
  lines?: string
}

const blankLine = (): DraftLine => ({ id: uid('line'), label: '', qty: '1', unit: '0' })

const lineTotal = (l: DraftLine): number => (Number(l.qty) || 0) * (Number(l.unit) || 0)

export default function AdminInvoices() {
  const invoices = useStore((s) => s.invoices)
  const families = useStore((s) => s.families)
  const children = useStore((s) => s.children)
  const settings = useStore((s) => s.settings)
  const createInvoice = useStore((s) => s.createInvoice)
  const pushToast = useStore((s) => s.pushToast)

  const [tab, setTab] = useState<'all' | InvoiceStatus>('all')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [familyId, setFamilyId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([blankLine()])
  const [errors, setErrors] = useState<InvoiceErrors>({})

  const familyName = (id: string) => families.find((f) => f.id === id)?.name ?? 'Unknown family'

  const decorated = useMemo(
    () => invoices.map((inv) => ({ inv, status: invoiceStatus(inv), balance: invoiceBalance(inv) })),
    [invoices],
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const nameOf = (id: string) => families.find((f) => f.id === id)?.name ?? ''
    return decorated
      .filter((r) => (tab === 'all' ? true : r.status === tab))
      .filter((r) => {
        if (!q) return true
        return `${r.inv.id} ${r.inv.period} ${nameOf(r.inv.familyId)}`.toLowerCase().includes(q)
      })
      .sort((a, b) => (a.inv.dueDate < b.inv.dueDate ? 1 : -1))
  }, [decorated, tab, query, families])

  const tabs = useMemo(
    () => [
      { value: 'all', label: 'All', count: decorated.length },
      { value: 'overdue', label: 'Overdue', count: decorated.filter((r) => r.status === 'overdue').length },
      { value: 'unpaid', label: 'Open', count: decorated.filter((r) => r.status === 'unpaid').length },
      { value: 'paid', label: 'Paid', count: decorated.filter((r) => r.status === 'paid').length },
    ],
    [decorated],
  )

  const draftTotal = lines.reduce((s, l) => s + lineTotal(l), 0)

  const resetForm = () => {
    setFamilyId('')
    setDueDate('')
    setMemo('')
    setLines([blankLine()])
    setErrors({})
  }

  const openNew = () => {
    resetForm()
    setOpen(true)
  }

  const setLine = (id: string, key: keyof Omit<DraftLine, 'id'>, value: string) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, [key]: value } : l)))

  /** Build tuition lines from the family's enrolled children and the current rate card. */
  const prefillFromEnrollment = () => {
    if (!familyId) {
      setErrors((e) => ({ ...e, familyId: 'Choose a family first' }))
      return
    }
    const kids = children.filter((c) => c.familyId === familyId && c.status === 'active')
    if (!kids.length) {
      pushToast({ tone: 'info', title: 'No enrolled children', description: 'This family has no active enrollments to bill.' })
      return
    }
    const rate = settings.rates
    const next: DraftLine[] = kids.map((c) => {
      const partTime = c.plan.toLowerCase().includes('part')
      return {
        id: uid('line'),
        label: `${c.name} — ${partTime ? 'Part-time' : 'Full-time'} tuition (4 weeks)`,
        qty: '4',
        unit: String(partTime ? rate.partTime : rate.fullTime),
      }
    })

    if (kids.length > 1 && rate.siblingDiscountPct > 0) {
      const weekly = next.map((l) => Number(l.unit) || 0).sort((a, b) => a - b)
      const cheapest = weekly[0] ?? 0
      const discount = Math.round(cheapest * 4 * (rate.siblingDiscountPct / 100))
      if (discount > 0) {
        next.push({
          id: uid('line'),
          label: `Sibling discount (${rate.siblingDiscountPct}% on second child)`,
          qty: '1',
          unit: String(-discount),
        })
      }
    }

    setLines(next)
    setErrors((e) => ({ ...e, lines: undefined }))
    pushToast({ title: 'Lines prefilled', description: `${kids.length} enrolled ${kids.length === 1 ? 'child' : 'children'} added from the rate card.` })
  }

  const submit = () => {
    const next: InvoiceErrors = {}
    if (!familyId) next.familyId = 'Choose a family'
    if (!dueDate) next.dueDate = 'Set a due date'
    const usable = lines.filter((l) => l.label.trim() && lineTotal(l) !== 0)
    if (!usable.length) next.lines = 'Add at least one line item with an amount'
    setErrors(next)
    if (Object.keys(next).length) return

    const lineItems: LineItem[] = usable.map((l) => ({
      label: l.label.trim(),
      qty: Number(l.qty) || 0,
      unit: Number(l.unit) || 0,
      amount: lineTotal(l),
    }))
    const amount = lineItems.reduce((s, l) => s + l.amount, 0)
    const shortName = familyName(familyId).replace(/\s*Family$/, '')

    createInvoice({
      familyId,
      period: `${fmtDate(todayISO(), 'MMMM yyyy')} · ${shortName}`,
      dueDate,
      amount,
      lineItems,
      memo: memo.trim(),
    })
    setOpen(false)
    pushToast({ title: 'Invoice created', description: `${money(amount)} billed to ${familyName(familyId)}.` })
  }

  return (
    <PageTransition>
      <PageHeader
        title="Invoices"
        description="Every statement you have issued, with what is still owed on each."
        actions={
          <>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search invoices…"
                className="w-full pl-9 sm:w-56"
                aria-label="Search invoices"
              />
            </div>
            <Button onClick={openNew}>
              <Plus size={16} /> New invoice
            </Button>
          </>
        }
      />

      <div className="mb-6">
        <Tabs tabs={tabs} value={tab} onChange={(v) => setTab(v as 'all' | InvoiceStatus)} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={query || tab !== 'all' ? 'Nothing matches that view' : 'No invoices yet'}
          description={
            query || tab !== 'all'
              ? 'Try another tab, or clear the search to see every statement.'
              : 'Create the first statement and it will appear in the family’s portal immediately.'
          }
          action={
            query || tab !== 'all' ? (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery('')
                  setTab('all')
                }}
              >
                Show all invoices
              </Button>
            ) : (
              <Button onClick={openNew}>
                <Plus size={16} /> Create an invoice
              </Button>
            )
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Invoice</th>
                  <th className="px-5 py-3">Family</th>
                  <th className="px-5 py-3">Due</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3 text-right">Balance</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ inv, status, balance }, i) => (
                  <motion.tr
                    key={inv.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    className="transition hover:bg-slate-50/70"
                  >
                    <td className="px-5 py-3.5">
                      <Link to={`/admin/invoices/${inv.id}`} className="font-display font-bold text-slate-900 transition hover:text-[#4F77D9]">
                        {inv.id}
                      </Link>
                      <p className="text-xs text-slate-500">{inv.period}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <Link to={`/admin/families/${inv.familyId}`} className="text-slate-700 transition hover:text-[#4F77D9]">
                        {familyName(inv.familyId)}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{fmtDate(inv.dueDate)}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-slate-900">{money(inv.amount)}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-slate-900">
                      {balance > 0 ? money(balance) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={statusTone(status)}>{status}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        to={`/admin/invoices/${inv.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#4F77D9] hover:underline"
                      >
                        Open <ArrowRight size={13} />
                      </Link>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        wide
        title="Create an invoice"
        description="Bill a family for tuition, fees, or extras. Nothing is charged — this posts to the demo ledger."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit}>Create invoice · {money(draftTotal)}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Family" error={errors.familyId}>
              <Select
                value={familyId}
                invalid={Boolean(errors.familyId)}
                onChange={(e) => {
                  setFamilyId(e.target.value)
                  setErrors((x) => ({ ...x, familyId: undefined }))
                }}
              >
                <option value="">Select a family…</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due date" error={errors.dueDate}>
              <Input type="date" value={dueDate} invalid={Boolean(errors.dueDate)} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-700">Line items</span>
              <Button size="sm" variant="outline" onClick={prefillFromEnrollment}>
                <Wand2 size={14} /> Prefill from enrollment
              </Button>
            </div>

            <div className="space-y-2.5">
              {lines.map((l) => (
                <div key={l.id} className="grid grid-cols-[1fr_4rem_5.5rem_5.5rem_2rem] items-center gap-2">
                  <Input
                    value={l.label}
                    onChange={(e) => setLine(l.id, 'label', e.target.value)}
                    placeholder="Description"
                    aria-label="Line item description"
                  />
                  <Input
                    type="number"
                    value={l.qty}
                    onChange={(e) => setLine(l.id, 'qty', e.target.value)}
                    aria-label="Quantity"
                    className="text-center"
                  />
                  <Input
                    type="number"
                    value={l.unit}
                    onChange={(e) => setLine(l.id, 'unit', e.target.value)}
                    aria-label="Unit rate"
                    className="text-right"
                  />
                  <span className="text-right text-sm font-semibold text-slate-900">{money(lineTotal(l))}</span>
                  <button
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.id !== l.id) : ls))}
                    disabled={lines.length === 1}
                    aria-label="Remove line item"
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            {errors.lines && <p className="mt-2 text-xs font-medium text-rose-600">{errors.lines}</p>}

            <div className="mt-3 flex items-center justify-between">
              <Button size="sm" variant="ghost" onClick={() => setLines((ls) => [...ls, blankLine()])}>
                <Plus size={14} /> Add line
              </Button>
              <p className="text-sm font-semibold text-slate-700">
                Total <span className="font-display text-lg font-extrabold text-slate-900">{money(draftTotal)}</span>
              </p>
            </div>
          </div>

          <Field label="Memo" hint="Optional note printed on the statement.">
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Autopay is not enabled on this account yet." />
          </Field>
        </div>
      </Modal>
    </PageTransition>
  )
}

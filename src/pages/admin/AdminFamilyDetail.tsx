import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Users,
  UserRound,
  ReceiptText,
  MessageSquare,
  ArrowRight,
  ShieldAlert,
  StickyNote,
  Pencil,
  KeyRound,
  UserCheck,
  UserMinus,
} from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import { Card, Button, Badge, Avatar, EmptyState, PageHeader, statusTone, Modal } from '../../components/ui'
import FamilyForm, { validateFamilyForm } from '../../components/FamilyForm'
import ParentAccountDialog from '../../components/ParentAccountDialog'
import type { FamilyFormValue } from '../../components/FamilyForm'
import { useStore } from '../../store/useStore'
import { money, fmtDate, ageLabel, invoiceBalance, invoiceStatus, sum } from '../../lib/helpers'
import { consoleScheduleText } from '../../components/ScheduleSummary'
import { CHILD_STATUS_LABELS, isFamilyUnenrolled } from '../../lib/childStatus'

export default function AdminFamilyDetail() {
  const { id } = useParams()
  const families = useStore((s) => s.families)
  const children = useStore((s) => s.children)
  const invoices = useStore((s) => s.invoices)
  const updateFamily = useStore((s) => s.updateFamily)
  const updateChild = useStore((s) => s.updateChild)
  const pushToast = useStore((s) => s.pushToast)

  const users = useStore((s) => s.users)
  const [acctOpen, setAcctOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [draft, setDraft] = useState<FamilyFormValue | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [unenrollOpen, setUnenrollOpen] = useState(false)
  const threads = useStore((s) => s.threads)

  const family = families.find((f) => f.id === id)

  const kids = useMemo(() => children.filter((c) => c.familyId === id), [children, id])
  const unenrolled = isFamilyUnenrolled(kids)
  /** The children "Unenroll family" changes: everyone not already unenrolled. */
  const stillEnrolled = useMemo(() => kids.filter((k) => k.status !== 'unenrolled'), [kids])
  const famInvoices = useMemo(
    () => invoices.filter((i) => i.familyId === id).sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1)),
    [invoices, id],
  )
  const famThreads = useMemo(() => threads.filter((t) => t.familyId === id), [threads, id])
  const balance = useMemo(() => sum(famInvoices, (i) => invoiceBalance(i)), [famInvoices])

  const parentAccounts = useMemo(
    () => users.filter((u) => u.role === 'parent' && u.familyId === id),
    [users, id],
  )

  const openEdit = () => {
    if (!family) return
    setDraft({
      name: family.name,
      primaryContact: family.primaryContact,
      relation: family.relation,
      email: family.email,
      phone: family.phone,
      address: family.address,
      secondary: family.secondary,
      emergency: family.emergency.length > 0 ? family.emergency : [{ name: '', relation: '', phone: '' }],
      notes: family.notes,
      customWeeklyRate: family.customWeeklyRate,
    })
    setErrors({})
    setEditOpen(true)
  }

  const saveEdit = () => {
    if (!draft || !family) return
    const e = validateFamilyForm(draft)
    setErrors(e)
    if (Object.keys(e).length) return
    updateFamily(family.id, draft)
    setEditOpen(false)
    pushToast({ title: 'Family updated', description: `${draft.name.trim()} was saved.` })
  }

  /**
   * Sets every child in the family to Unenrolled. Each child is written through
   * on its own, the same as changing their status on their page; a failed
   * write raises its own toast. Nothing is deleted and parent logins stay.
   */
  const unenrollFamily = () => {
    if (!family) return
    stillEnrolled.forEach((k) => updateChild(k.id, { status: 'unenrolled' }))
    setUnenrollOpen(false)
    pushToast({
      title: 'Family unenrolled',
      description: `${family.name}: ${stillEnrolled.length} ${stillEnrolled.length === 1 ? 'child' : 'children'} set to Unenrolled.`,
    })
  }

  if (!family) {
    return (
      <PageTransition>
        <EmptyState
          icon={Users}
          title="Family not found"
          description="This record may have been removed or the link is out of date."
          action={
            <Button as={Link} to="/admin/families">
              Back to families
            </Button>
          }
        />
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <Link
        to="/admin/families"
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-[#3F8570]"
      >
        <ArrowLeft size={15} /> Back to families
      </Link>

      <PageHeader
        title={family.name}
        description={`${family.primaryContact} · ${family.relation} · ${unenrolled ? 'unenrolled · joined' : 'enrolled since'} ${fmtDate(family.joinedAt)}`}
        actions={
          <>
            <Button as="a" href={`tel:${family.phone.replace(/[^0-9]/g, '')}`} variant="outline">
              <Phone size={16} /> Call
            </Button>
            <Button variant="outline" onClick={openEdit}>
              <Pencil size={16} /> Edit details
            </Button>
            <Button as={Link} to="/admin/messages">
              <MessageSquare size={16} /> Message family
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {/* Children */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-slate-900">Children</h2>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {unenrolled && <Badge tone={statusTone('unenrolled')}>Unenrolled</Badge>}
                <Badge tone="blue">
                  <UserRound size={12} /> {kids.length}
                </Badge>
                {stillEnrolled.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => setUnenrollOpen(true)}>
                    <UserMinus size={14} /> Unenroll family
                  </Button>
                )}
              </div>
            </div>
            {unenrolled && (
              <p className="mt-3 text-sm text-slate-500">
                This family is unenrolled. To re-enroll a child, open their page, choose Edit details and set their
                status back to Active or Summer Camp.
              </p>
            )}
            {kids.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No children linked to this family yet.</p>
            ) : (
              <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {kids.map((k) => (
                  <li key={k.id}>
                    <Link
                      to={`/admin/children/${k.id}`}
                      className="flex h-full items-start gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-[#3F8570] hover:bg-[#3F8570]/5"
                    >
                      <Avatar name={k.name} hue={k.hue} size="md" />
                      <div className="min-w-0">
                        <p className="truncate font-display text-sm font-bold text-slate-900">{k.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {k.ageGroup} · {ageLabel(k.dob)} · {consoleScheduleText(k)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge tone={statusTone(k.status)}>{CHILD_STATUS_LABELS[k.status]}</Badge>
                          {k.allergies.length > 0 && (
                            <Badge tone="rose">
                              <ShieldAlert size={11} /> Allergy
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Invoices */}
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">Billing history</h2>
                <p className="text-xs text-slate-500">
                  {family.customWeeklyRate != null
                    ? `Custom rate: ${money(family.customWeeklyRate)}/week per child`
                    : 'No weekly rate set — invoice prefill needs one'}
                </p>
              </div>
              <Badge tone={balance > 0 ? 'amber' : 'green'}>
                {balance > 0 ? `${money(balance)} due` : 'Paid up'}
              </Badge>
            </div>
            {famInvoices.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={ReceiptText} title="No invoices yet" description="Create one from the billing page." />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {famInvoices.map((inv) => {
                  const st = invoiceStatus(inv)
                  return (
                    <li key={inv.id}>
                      <Link
                        to={`/admin/invoices/${inv.id}`}
                        className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-display text-sm font-bold text-slate-900">{inv.id}</p>
                          <p className="truncate text-xs text-slate-500">
                            {inv.period} · due {fmtDate(inv.dueDate)}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-slate-900">{money(inv.amount)}</span>
                        <Badge tone={statusTone(st)}>{st}</Badge>
                        <ArrowRight size={15} className="text-slate-400" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {/* Threads */}
          <Card className="p-5">
            <h2 className="font-display text-lg font-bold text-slate-900">Conversations</h2>
            {famThreads.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No message threads with this family yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {famThreads.map((t) => {
                  const last = t.messages[t.messages.length - 1]
                  return (
                    <li key={t.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-bold text-slate-900">{t.subject}</p>
                        <span className="shrink-0 text-xs text-slate-500">{fmtDate(t.updatedAt)}</span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-600">{last?.body}</p>
                    </li>
                  )
                })}
              </ul>
            )}
            <Button as={Link} to="/admin/messages" variant="ghost" className="mt-4 w-full">
              Open messages <ArrowRight size={15} />
            </Button>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-display text-lg font-bold text-slate-900">Contact</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              <li className="flex gap-2.5 break-all">
                <Mail size={16} className="mt-0.5 shrink-0 text-[#3F8570]" />
                <a href={`mailto:${family.email}`} className="transition hover:text-[#3F8570]">
                  {family.email}
                </a>
              </li>
              <li className="flex gap-2.5">
                <Phone size={16} className="mt-0.5 shrink-0 text-[#3F8570]" />
                {family.phone}
              </li>
              <li className="flex gap-2.5">
                <MapPin size={16} className="mt-0.5 shrink-0 text-[#3F8570]" />
                {family.address}
              </li>
            </ul>

            {family.secondary && (
              <div className="mt-5 rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Secondary contact</p>
                <p className="mt-1.5 text-sm font-semibold text-slate-900">{family.secondary.name}</p>
                <p className="text-xs text-slate-500">
                  {family.secondary.relation} · {family.secondary.phone}
                </p>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-slate-900">Portal access</h2>
              <Button size="sm" variant="outline" onClick={() => setAcctOpen(true)}>
                <KeyRound size={14} /> Add account
              </Button>
            </div>

            {parentAccounts.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-4">
                <p className="text-sm font-semibold text-slate-700">No login yet</p>
                <p className="mt-1 text-xs text-slate-500">
                  This family cannot sign in. Create an account and share the password with them.
                </p>
              </div>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {parentAccounts.map((u) => (
                  <li key={u.id} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
                    <UserCheck size={16} className="mt-0.5 shrink-0 text-[#2E8C72]" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{u.name}</p>
                      <p className="truncate text-xs text-slate-500">{u.email}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Families cannot sign themselves up — every account is one you created.
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-lg font-bold text-slate-900">Emergency contacts</h2>
            <ul className="mt-4 space-y-3">
              {(family.emergency || []).map((e) => (
                <li key={e.name} className="rounded-xl border border-slate-200 p-3.5">
                  <p className="text-sm font-bold text-slate-900">{e.name}</p>
                  <p className="text-xs text-slate-500">
                    {e.relation} · {e.phone}
                  </p>
                </li>
              ))}
              {(family.emergency || []).length === 0 && (
                <p className="text-sm text-slate-500">None on file — request at next pickup.</p>
              )}
            </ul>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <StickyNote size={17} className="text-[#F5B942]" />
              <h2 className="font-display text-lg font-bold text-slate-900">Internal notes</h2>
            </div>
            <p className="mt-3 rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
              {family.notes || 'No notes recorded.'}
            </p>
          </Card>
        </div>
      </div>

      <Modal
        open={unenrollOpen}
        onClose={() => setUnenrollOpen(false)}
        title="Unenroll this family?"
        description={family.name}
        footer={
          <>
            <Button variant="ghost" onClick={() => setUnenrollOpen(false)}>
              Keep them enrolled
            </Button>
            <Button variant="danger" onClick={unenrollFamily}>
              <UserMinus size={16} /> Unenroll family
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            {stillEnrolled.map((k) => k.name).join(', ')} will be set to <strong>Unenrolled</strong>.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>They will no longer be expected on the attendance page or the dashboards.</li>
            <li>They drop out of new daily reports and invoice prefill.</li>
            <li>Past reports, attendance, invoices and any balance stay on file.</li>
            <li>The family can still sign in to their portal. Nothing is sent to them.</li>
          </ul>
          <p className="text-slate-500">
            You can re-enroll a child any time by setting their status back to Active or Summer Camp.
          </p>
        </div>
      </Modal>

      <ParentAccountDialog open={acctOpen} onClose={() => setAcctOpen(false)} fixedFamilyId={family.id} />

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        wide
        title="Edit family details"
        description={family.name}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveEdit}>Save changes</Button>
          </>
        }
      >
        {draft && <FamilyForm value={draft} onChange={setDraft} errors={errors} />}
      </Modal>
    </PageTransition>
  )
}
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, Users, ArrowRight, Phone, Mail, CalendarCheck, Inbox, UserPlus, KeyRound, Copy } from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import {
  Card,
  Button,
  Badge,
  PageHeader,
  Input,
  Select,
  Tabs,
  EmptyState,
  Avatar,
  SkeletonCard,
  Modal,
} from '../../components/ui'
import FamilyForm, { emptyFamilyForm, validateFamilyForm } from '../../components/FamilyForm'
import type { FamilyFormValue } from '../../components/FamilyForm'
import ChildForm, { emptyChildForm, formToChild, validateChildForm } from '../../components/ChildForm'
import type { ChildFormValue } from '../../components/ChildForm'
import { todayISO } from '../../lib/helpers'
import type { PortalCredentials } from '../../types'
import { useStore } from '../../store/useStore'
import { useBootstrap } from '../../lib/hooks'
import { money, fmtDate, invoiceBalance, sum } from '../../lib/helpers'

const leadStatuses = ['New inquiry', 'Tour scheduled', 'Waitlisted', 'Enrolled', 'Not a fit']

export default function AdminFamilies() {
  const { isLoading } = useBootstrap('admin-families', 400)
  const families = useStore((s) => s.families)
  const children = useStore((s) => s.children)
  const invoices = useStore((s) => s.invoices)
  const leads = useStore((s) => s.leads)
  const updateLead = useStore((s) => s.updateLead)
  const addFamily = useStore((s) => s.addFamily)
  const addChild = useStore((s) => s.addChild)
  const createParentLogin = useStore((s) => s.createParentLogin)

  const [addOpen, setAddOpen] = useState(false)
  const [famDraft, setFamDraft] = useState<FamilyFormValue>(emptyFamilyForm())
  const [kidDraft, setKidDraft] = useState<ChildFormValue>(emptyChildForm())
  const [withChild, setWithChild] = useState(true)
  const [makeLogin, setMakeLogin] = useState(true)
  const [famErrors, setFamErrors] = useState<Record<string, string>>({})
  const [kidErrors, setKidErrors] = useState<Record<string, string>>({})
  const [newLogin, setNewLogin] = useState<PortalCredentials | null>(null)

  const openAdd = () => {
    setFamDraft(emptyFamilyForm())
    setKidDraft(emptyChildForm())
    setWithChild(true)
    setMakeLogin(true)
    setFamErrors({})
    setKidErrors({})
    setAddOpen(true)
  }

  const saveNewFamily = () => {
    const fe = validateFamilyForm(famDraft)
    const ke = withChild ? validateChildForm({ ...kidDraft, familyId: 'pending' }) : {}
    delete ke.familyId
    setFamErrors(fe)
    setKidErrors(ke)
    if (Object.keys(fe).length || Object.keys(ke).length) return

    const familyId = addFamily({ ...famDraft, joinedAt: todayISO() })
    if (withChild) addChild(formToChild({ ...kidDraft, familyId }))
    const credentials = makeLogin
      ? createParentLogin(familyId, famDraft.primaryContact.trim(), famDraft.email)
      : null

    setAddOpen(false)
    pushToast({
      title: 'Family added',
      description: `${famDraft.name.trim()} is on file${withChild ? ` with ${kidDraft.name.trim()}` : ''}.`,
    })
    if (makeLogin) {
      if (credentials) setNewLogin(credentials)
      else
        pushToast({
          tone: 'error',
          title: 'Login not created',
          description: 'That email is already used by another account.',
        })
    }
  }

  const copyLogin = () => {
    if (!newLogin) return
    navigator.clipboard
      .writeText(`Aunties Tykes parent portal\nEmail: ${newLogin.email}\nTemporary password: ${newLogin.password}`)
      .then(
        () => pushToast({ title: 'Login details copied' }),
        () => pushToast({ tone: 'error', title: 'Could not copy' }),
      )
  }
  const pushToast = useStore((s) => s.pushToast)

  const [tab, setTab] = useState('families')
  const [query, setQuery] = useState('')

  const enriched = useMemo(
    () =>
      families.map((f) => {
        const kids = children.filter((c) => c.familyId === f.id)
        const fInvoices = invoices.filter((i) => i.familyId === f.id)
        return {
          ...f,
          kids,
          balance: sum(fInvoices, (i) => invoiceBalance(i)),
          invoiceCount: fInvoices.length,
        }
      }),
    [families, children, invoices],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return enriched
    return enriched.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.primaryContact.toLowerCase().includes(q) ||
        f.email.toLowerCase().includes(q) ||
        f.kids.some((k) => k.name.toLowerCase().includes(q)),
    )
  }, [enriched, query])

  const filteredLeads = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return leads
    return leads.filter(
      (l) => l.parentName.toLowerCase().includes(q) || l.email.toLowerCase().includes(q) || l.message.toLowerCase().includes(q),
    )
  }, [leads, query])

  return (
    <PageTransition>
      <PageHeader
        title="Families"
        description="Every enrolled household, their children, and their current balance — plus the inquiry inbox."
        actions={
          <>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search families, children, email…"
                className="w-full pl-9 sm:w-72"
                aria-label="Search families"
              />
            </div>
            <Button onClick={openAdd}>
              <UserPlus size={16} /> Add family
            </Button>
          </>
        }
      >
        <div className="mt-5">
          <Tabs
            tabs={[
              { value: 'families', label: 'Enrolled families', count: families.length },
              { value: 'leads', label: 'Inquiry inbox', count: leads.length },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </PageHeader>

      {isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : tab === 'families' ? (
        filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No families matched"
            description="Try a different name, or clear the search to see everyone."
            action={<Button variant="outline" onClick={() => setQuery('')}>Clear search</Button>}
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((f, i) => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.06, 0.4) }}
              >
                <Card hover className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-lg font-extrabold text-slate-900">{f.name}</h2>
                      <p className="truncate text-sm text-slate-500">
                        {f.primaryContact} · {f.relation}
                      </p>
                    </div>
                    <Badge tone={f.balance > 0 ? 'amber' : 'green'}>
                      {f.balance > 0 ? money(f.balance) : 'Paid up'}
                    </Badge>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {f.kids.map((k) => (
                      <span
                        key={k.id}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 py-1 pl-1 pr-2.5 text-xs font-semibold text-slate-700"
                      >
                        <Avatar name={k.name} hue={k.hue} size="sm" />
                        {k.name.split(' ')[0]}
                      </span>
                    ))}
                    {f.kids.length === 0 && <span className="text-xs text-slate-500">No children on file</span>}
                  </div>

                  <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-600">
                    <li className="flex items-center gap-2 truncate">
                      <Mail size={14} className="shrink-0 text-[#4F77D9]" /> {f.email}
                    </li>
                    <li className="flex items-center gap-2">
                      <Phone size={14} className="shrink-0 text-[#4F77D9]" /> {f.phone}
                    </li>
                    <li className="flex items-center gap-2">
                      <CalendarCheck size={14} className="shrink-0 text-[#4F77D9]" /> Joined {fmtDate(f.joinedAt)}
                    </li>
                  </ul>

                  <Button as={Link} to={`/admin/families/${f.id}`} variant="outline" className="mt-5 w-full">
                    Open family record <ArrowRight size={15} />
                  </Button>
                </Card>
              </motion.div>
            ))}
          </div>
        )
      ) : filteredLeads.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Inquiry inbox is empty"
          description="Messages sent from the public contact form land here."
        />
      ) : (
        <div className="space-y-4">
          {filteredLeads.map((l, i) => (
            <motion.div
              key={l.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.05, 0.3) }}
            >
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-bold text-slate-900">{l.parentName}</h2>
                    <p className="text-sm text-slate-500">
                      {l.email} · {l.phone}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Child age: {l.childAges} · received {fmtDate(l.createdAt)}
                      {l.tourDate ? ` · tour ${fmtDate(l.tourDate)}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={l.status}
                      onChange={(e) => {
                        updateLead(l.id, { status: e.target.value })
                        pushToast({ title: 'Inquiry updated', description: `${l.parentName} → ${e.target.value}` })
                      }}
                      className="w-44"
                      aria-label={`Status for ${l.parentName}`}
                    >
                      {leadStatuses.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </Select>
                    <Button as="a" href={`mailto:${l.email}`} size="sm" variant="outline">
                      <Mail size={14} /> Reply
                    </Button>
                  </div>
                </div>
                <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">{l.message}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        wide
        title="Add a family"
        description="For walk-ins and phone enrollments. Families can also fill this out themselves from the enrollment link."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveNewFamily}>
              <UserPlus size={16} /> Add family
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <FamilyForm value={famDraft} onChange={setFamDraft} errors={famErrors} />

          <div className="rounded-2xl border border-slate-200 p-5">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={withChild}
                onChange={(e) => setWithChild(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-[#4F77D9]"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800">Add their first child now</span>
                <span className="block text-xs text-slate-500">You can add more children later from the Children page.</span>
              </span>
            </label>
            {withChild && (
              <div className="mt-5">
                <ChildForm value={kidDraft} onChange={setKidDraft} errors={kidErrors} />
              </div>
            )}
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-slate-50 p-4">
            <input
              type="checkbox"
              checked={makeLogin}
              onChange={(e) => setMakeLogin(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-[#4F77D9]"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Create a parent portal login</span>
              <span className="block text-xs text-slate-500">
                Uses the email above. You will get a temporary password to pass along.
              </span>
            </span>
          </label>
        </div>
      </Modal>

      <Modal
        open={Boolean(newLogin)}
        onClose={() => setNewLogin(null)}
        title="Portal login created"
        description="Share these with the family so they can sign in."
        footer={<Button onClick={() => setNewLogin(null)}>Done</Button>}
      >
        <Card className="bg-slate-50 p-5">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <KeyRound size={13} /> Parent portal login
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Email</dt>
              <dd className="font-semibold text-slate-900">{newLogin?.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Temporary password</dt>
              <dd className="font-mono font-semibold text-slate-900">{newLogin?.password}</dd>
            </div>
          </dl>
          <Button size="sm" variant="outline" className="mt-4 w-full" onClick={copyLogin}>
            <Copy size={14} /> Copy login details
          </Button>
        </Card>
      </Modal>
    </PageTransition>
  )
}
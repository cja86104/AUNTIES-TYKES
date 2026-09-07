import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, Baby, ArrowRight, ShieldAlert, Pill, CalendarCheck, UserPlus } from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import {
  Card,
  Button,
  Badge,
  Avatar,
  Input,
  Tabs,
  PageHeader,
  EmptyState,
  SkeletonCard,
  statusTone,
  Modal,
} from '../../components/ui'
import ChildForm, { emptyChildForm, formToChild, validateChildForm } from '../../components/ChildForm'
import type { ChildFormValue } from '../../components/ChildForm'
import { useStore } from '../../store/useStore'
import { useBootstrap } from '../../lib/hooks'
import { ageLabel, fmtDate, fmtTime, todayISO } from '../../lib/helpers'

export default function AdminChildren() {
  const { isLoading } = useBootstrap('admin-children', 400)
  const children = useStore((s) => s.children)
  const families = useStore((s) => s.families)
  const attendance = useStore((s) => s.attendance)
  const addChild = useStore((s) => s.addChild)
  const pushToast = useStore((s) => s.pushToast)

  const [addOpen, setAddOpen] = useState(false)
  const [draft, setDraft] = useState<ChildFormValue>(emptyChildForm())
  const [errors, setErrors] = useState<Record<string, string>>({})

  const openAdd = () => {
    setDraft(emptyChildForm())
    setErrors({})
    setAddOpen(true)
  }

  const saveChild = () => {
    const e = validateChildForm(draft)
    setErrors(e)
    if (Object.keys(e).length) return
    addChild(formToChild(draft))
    setAddOpen(false)
    pushToast({
      title: 'Child added',
      description: `${draft.name.trim()} was added to ${families.find((f) => f.id === draft.familyId)?.name ?? 'the family'}.`,
    })
  }

  const [group, setGroup] = useState('all')
  const [query, setQuery] = useState('')
  const today = todayISO()

  const tabs = useMemo(() => {
    const groups = ['Infant', 'Toddler', 'Preschool']
    return [
      { value: 'all', label: 'All', count: children.length },
      ...groups.map((g) => ({ value: g, label: g, count: children.filter((c) => c.ageGroup === g).length })),
      { value: 'waitlist', label: 'Waitlist', count: children.filter((c) => c.status === 'waitlist').length },
    ]
  }, [children])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return children.filter((c) => {
      const matchGroup =
        group === 'all' ? true : group === 'waitlist' ? c.status === 'waitlist' : c.ageGroup === group
      const matchQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.plan.toLowerCase().includes(q) ||
        c.teacher.toLowerCase().includes(q)
      return matchGroup && matchQuery
    })
  }, [children, group, query])

  return (
    <PageTransition>
      <PageHeader
        title="Children"
        description="Profiles, plans, allergies, and today's status for every child in the house."
        actions={
          <>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, plan, teacher…"
                className="w-full pl-9 sm:w-72"
                aria-label="Search children"
              />
            </div>
            <Button onClick={openAdd}>
              <UserPlus size={16} /> Add child
            </Button>
          </>
        }
      >
        <div className="mt-5">
          <Tabs tabs={tabs} value={group} onChange={setGroup} />
        </div>
      </PageHeader>

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Baby}
          title="No children matched"
          description="Adjust the filter or clear your search."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQuery('')
                setGroup('all')
              }}
            >
              Reset filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c, i) => {
            const family = families.find((f) => f.id === c.familyId)
            const record = attendance.find((a) => a.childId === c.id && a.date === today)
            const status = c.status === 'waitlist' ? 'waitlist' : record?.status || 'expected'
            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.35) }}
              >
                <Card hover className="flex h-full flex-col p-5">
                  <div className="flex items-start gap-3.5">
                    <Avatar name={c.name} hue={c.hue} size="lg" />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-display text-lg font-extrabold text-slate-900">{c.name}</h2>
                      <p className="truncate text-sm text-slate-500">
                        {c.ageGroup} · {ageLabel(c.dob)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge tone={statusTone(status)}>{status}</Badge>
                        {c.allergies.length > 0 && (
                          <Badge tone="rose">
                            <ShieldAlert size={11} /> {c.allergies.length} allergy
                          </Badge>
                        )}
                        {c.medications.length > 0 && (
                          <Badge tone="violet">
                            <Pill size={11} /> Meds
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <dl className="mt-5 flex-1 space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Plan</dt>
                      <dd className="text-right font-semibold text-slate-800">{c.plan}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Teacher</dt>
                      <dd className="text-right font-semibold text-slate-800">{c.teacher}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Family</dt>
                      <dd className="truncate text-right font-semibold text-slate-800">{family?.name || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Today</dt>
                      <dd className="text-right font-semibold text-slate-800">
                        {record?.checkIn ? `In ${fmtTime(record.checkIn)}` : '—'}
                        {record?.checkOut ? ` / out ${fmtTime(record.checkOut)}` : ''}
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
                    <CalendarCheck size={13} /> Started {fmtDate(c.startDate)}
                  </p>

                  <Button as={Link} to={`/admin/children/${c.id}`} variant="outline" className="mt-4 w-full">
                    Open profile <ArrowRight size={15} />
                  </Button>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        wide
        title="Add a child"
        description="Enroll a sibling, or add a child to a family already on file."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveChild}>
              <UserPlus size={16} /> Add child
            </Button>
          </>
        }
      >
        <ChildForm value={draft} onChange={setDraft} errors={errors} families={families} />
      </Modal>
    </PageTransition>
  )
}
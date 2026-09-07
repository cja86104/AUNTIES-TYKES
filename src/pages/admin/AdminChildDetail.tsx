import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Baby,
  ShieldAlert,
  Pill,
  StickyNote,
  Users,
  ArrowRight,
  LogIn,
  LogOut,
  UserX,
  NotebookPen,
  Pencil,
} from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import { Card, Button, Badge, Avatar, EmptyState, PageHeader, statusTone, Modal } from '../../components/ui'
import ChildForm, { childToForm, formToChild, validateChildForm } from '../../components/ChildForm'
import type { ChildFormValue } from '../../components/ChildForm'
import DailyLogCard from '../../components/DailyLogCard'
import { useStore } from '../../store/useStore'
import { ageLabel, fmtDate, fmtTime, todayISO } from '../../lib/helpers'

export default function AdminChildDetail() {
  const { id } = useParams()
  const children = useStore((s) => s.children)
  const families = useStore((s) => s.families)
  const attendance = useStore((s) => s.attendance)
  const dailyLogs = useStore((s) => s.dailyLogs)
  const checkIn = useStore((s) => s.checkIn)
  const checkOut = useStore((s) => s.checkOut)
  const markAbsent = useStore((s) => s.markAbsent)
  const pushToast = useStore((s) => s.pushToast)

  const updateChild = useStore((s) => s.updateChild)
  const [editOpen, setEditOpen] = useState(false)
  const [draft, setDraft] = useState<ChildFormValue | null>(null)
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})

  const child = children.find((c) => c.id === id)

  const openEdit = () => {
    if (!child) return
    setDraft(childToForm(child))
    setEditErrors({})
    setEditOpen(true)
  }

  const saveEdit = () => {
    if (!draft || !child) return
    const e = validateChildForm(draft)
    setEditErrors(e)
    if (Object.keys(e).length) return
    updateChild(child.id, formToChild(draft))
    setEditOpen(false)
    pushToast({ title: 'Profile updated', description: `${draft.name.trim()}'s details were saved.` })
  }
  const today = todayISO()

  const records = useMemo(
    () =>
      attendance
        .filter((a) => a.childId === id)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 10),
    [attendance, id],
  )
  const logs = useMemo(
    () =>
      dailyLogs
        .filter((l) => l.childId === id)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 3),
    [dailyLogs, id],
  )

  if (!child) {
    return (
      <PageTransition>
        <EmptyState
          icon={Baby}
          title="Child not found"
          description="This profile may have been removed."
          action={
            <Button as={Link} to="/admin/children">
              Back to children
            </Button>
          }
        />
      </PageTransition>
    )
  }

  const family = families.find((f) => f.id === child.familyId)
  const todayRecord = attendance.find((a) => a.childId === child.id && a.date === today)
  const status = todayRecord?.status || 'expected'
  const first = child.name.split(' ')[0]

  return (
    <PageTransition>
      <Link
        to="/admin/children"
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-[#4F77D9]"
      >
        <ArrowLeft size={15} /> Back to children
      </Link>

      <PageHeader
        title={child.name}
        description={`${child.ageGroup} · ${ageLabel(child.dob)} · ${child.plan} · with ${child.teacher}`}
        actions={
          <>
            <Button variant="outline" onClick={openEdit}>
              <Pencil size={16} /> Edit profile
            </Button>
            <Button variant="outline" onClick={() => { checkIn(child.id); pushToast({ title: `${first} checked in` }) }} disabled={status === 'present'}>
              <LogIn size={16} /> Check in
            </Button>
            <Button variant="outline" onClick={() => { checkOut(child.id); pushToast({ title: `${first} checked out` }) }} disabled={status !== 'present'}>
              <LogOut size={16} /> Check out
            </Button>
            <Button variant="ghost" onClick={() => { markAbsent(child.id); pushToast({ tone: 'info', title: `${first} marked absent` }) }} disabled={status === 'absent'}>
              <UserX size={16} /> Absent
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name={child.name} hue={child.hue} size="xl" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={statusTone(child.status)}>{child.status}</Badge>
                  <Badge tone={statusTone(status)}>Today: {status}</Badge>
                  {child.allergies.length > 0 && (
                    <Badge tone="rose">
                      <ShieldAlert size={11} /> Allergy alert
                    </Badge>
                  )}
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  {[
                    ['Date of birth', fmtDate(child.dob)],
                    ['Age', ageLabel(child.dob)],
                    ['Started', fmtDate(child.startDate)],
                    ['Schedule', child.plan],
                    ['Teacher', child.teacher],
                    [
                      'Today',
                      todayRecord?.checkIn
                        ? `In ${fmtTime(todayRecord.checkIn)}${todayRecord.checkOut ? ` · out ${fmtTime(todayRecord.checkOut)}` : ''}`
                        : 'Not checked in',
                    ],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 border-b border-slate-100 pb-2">
                      <dt className="text-slate-500">{k}</dt>
                      <dd className="text-right font-semibold text-slate-800">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-display text-lg font-bold text-slate-900">Recent attendance</h2>
              <Badge tone="blue">Last {records.length} days</Badge>
            </div>
            {records.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No attendance yet" description="Records appear once you check this child in." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="bg-slate-50/70 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">In</th>
                      <th className="px-5 py-3">Out</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="px-5 py-3 font-semibold text-slate-800">{fmtDate(r.date)}</td>
                        <td className="px-5 py-3 text-slate-600">{r.checkIn ? fmtTime(r.checkIn) : '—'}</td>
                        <td className="px-5 py-3 text-slate-600">{r.checkOut ? fmtTime(r.checkOut) : '—'}</td>
                        <td className="px-5 py-3">
                          <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                        </td>
                        <td className="px-5 py-3 text-slate-500">{r.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-slate-900">Latest daily reports</h2>
              <Button as={Link} to="/admin/daily-logs" size="sm" variant="outline">
                <NotebookPen size={14} /> Write a log
              </Button>
            </div>
            {logs.length === 0 ? (
              <EmptyState
                icon={NotebookPen}
                title="No daily reports yet"
                description={`Write ${first}'s first report from the daily logs page.`}
                action={
                  <Button as={Link} to="/admin/daily-logs">
                    Go to daily logs <ArrowRight size={15} />
                  </Button>
                }
              />
            ) : (
              <div className="space-y-5">
                {logs.map((l, i) => (
                  <DailyLogCard key={l.id} log={l} child={child} index={i} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <ShieldAlert size={17} className="text-rose-500" />
              <h2 className="font-display text-lg font-bold text-slate-900">Allergies</h2>
            </div>
            {child.allergies.length ? (
              <ul className="mt-3.5 space-y-2">
                {child.allergies.map((a) => (
                  <li key={a} className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-800">
                    {a}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3.5 text-sm text-slate-500">None reported.</p>
            )}

            <div className="mt-6 flex items-center gap-2">
              <Pill size={17} className="text-violet-500" />
              <h2 className="font-display text-lg font-bold text-slate-900">Medications</h2>
            </div>
            {child.medications.length ? (
              <ul className="mt-3.5 space-y-2">
                {child.medications.map((m) => (
                  <li key={m} className="rounded-xl bg-violet-50 px-3.5 py-2.5 text-sm font-semibold text-violet-800">
                    {m}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3.5 text-sm text-slate-500">None on file.</p>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <StickyNote size={17} className="text-[#F5B942]" />
              <h2 className="font-display text-lg font-bold text-slate-900">Care notes</h2>
            </div>
            <p className="mt-3 rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
              {child.notes || 'No notes recorded.'}
            </p>
          </Card>

          {family && (
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Users size={17} className="text-[#4F77D9]" />
                <h2 className="font-display text-lg font-bold text-slate-900">Family</h2>
              </div>
              <p className="mt-3 font-display text-base font-bold text-slate-900">{family.name}</p>
              <p className="text-sm text-slate-600">
                {family.primaryContact} · {family.phone}
              </p>
              <p className="mt-1 break-all text-sm text-slate-600">{family.email}</p>
              <Button as={Link} to={`/admin/families/${family.id}`} variant="outline" className="mt-4 w-full">
                Open family record <ArrowRight size={15} />
              </Button>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        wide
        title="Edit child profile"
        description={child.name}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveEdit}>Save changes</Button>
          </>
        }
      >
        {draft && <ChildForm value={draft} onChange={setDraft} errors={editErrors} />}
      </Modal>
    </PageTransition>
  )
}
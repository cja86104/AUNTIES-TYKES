import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ClipboardList,
  CheckCircle2,
  XCircle,
  Mail,
  Phone,
  MapPin,
  Baby,
  ShieldCheck,
  Copy,
  KeyRound,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  StatCard,
  Tabs,
} from '../../components/ui'
import { useStore } from '../../store/useStore'
import { ageLabel, fmtDate } from '../../lib/helpers'
import type { ApprovalResult, EnrollmentStatus, EnrollmentSubmission } from '../../types'

const ENROLL_LINK = '/enroll'

export default function AdminEnrollments() {
  const enrollments = useStore((s) => s.enrollments)
  const approveEnrollment = useStore((s) => s.approveEnrollment)
  const declineEnrollment = useStore((s) => s.declineEnrollment)
  const pushToast = useStore((s) => s.pushToast)

  const [tab, setTab] = useState<'pending' | EnrollmentStatus | 'all'>('pending')
  const [confirmApprove, setConfirmApprove] = useState<EnrollmentSubmission | null>(null)
  const [confirmDecline, setConfirmDecline] = useState<EnrollmentSubmission | null>(null)
  const [result, setResult] = useState<ApprovalResult | null>(null)

  const rows = useMemo(
    () =>
      enrollments
        .filter((e) => (tab === 'all' ? true : e.status === tab))
        .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1)),
    [enrollments, tab],
  )

  const pendingCount = enrollments.filter((e) => e.status === 'pending').length
  const approvedCount = enrollments.filter((e) => e.status === 'approved').length
  const childCount = enrollments
    .filter((e) => e.status === 'pending')
    .reduce((s, e) => s + e.children.length, 0)

  const copyLink = () => {
    const url = `${window.location.origin}${ENROLL_LINK}`
    navigator.clipboard.writeText(url).then(
      () => pushToast({ title: 'Enrollment link copied', description: url }),
      () => pushToast({ tone: 'error', title: 'Could not copy', description: `Share this link: ${url}` }),
    )
  }

  const doApprove = () => {
    if (!confirmApprove) return
    const res = approveEnrollment(confirmApprove.id)
    setConfirmApprove(null)
    if (!res) {
      pushToast({ tone: 'error', title: 'Already reviewed', description: 'This enrollment was handled already.' })
      return
    }
    setResult(res)
    pushToast({
      title: 'Family enrolled',
      description: `${confirmApprove.familyName} and ${res.childIds.length} ${res.childIds.length === 1 ? 'child' : 'children'} were added.`,
    })
  }

  const doDecline = () => {
    if (!confirmDecline) return
    declineEnrollment(confirmDecline.id)
    pushToast({ tone: 'info', title: 'Enrollment declined', description: `${confirmDecline.familyName} was not enrolled.` })
    setConfirmDecline(null)
  }

  const copyCredentials = () => {
    if (!result?.credentials) return
    const text = `Aunties Tykes parent portal\nEmail: ${result.credentials.email}\nTemporary password: ${result.credentials.password}`
    navigator.clipboard.writeText(text).then(
      () => pushToast({ title: 'Login details copied' }),
      () => pushToast({ tone: 'error', title: 'Could not copy' }),
    )
  }

  return (
    <PageTransition>
      <PageHeader
        title="Enrollments"
        description="Forms families filled out themselves. Review one and approve it to create their file, their children, and their portal login."
        actions={
          <>
            <Button variant="outline" onClick={copyLink}>
              <Copy size={16} /> Copy enrollment link
            </Button>
            <Button as="a" href={ENROLL_LINK} target="_blank" rel="noreferrer">
              Preview the form <ArrowRight size={16} />
            </Button>
          </>
        }
      />

      <div className="grid gap-5 sm:grid-cols-3">
        <StatCard
          icon={ClipboardList}
          label="Waiting for review"
          value={pendingCount}
          sub={pendingCount === 0 ? 'Nothing needs you right now' : 'Families expecting to hear back'}
          tone={pendingCount > 0 ? 'amber' : 'green'}
        />
        <StatCard icon={Baby} label="Children in those forms" value={childCount} sub="Across pending enrollments" tone="blue" />
        <StatCard icon={CheckCircle2} label="Approved" value={approvedCount} sub="Turned into family files" tone="green" />
      </div>

      <Card className="mt-6 flex flex-wrap items-center gap-4 border-[#4F77D9]/25 bg-[#EAF0FC]/50 p-5">
        <ShieldCheck size={22} className="shrink-0 text-[#39569f]" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold text-slate-900">Send this to a new family</p>
          <p className="text-sm text-slate-600">
            Text or email them <code className="rounded bg-white px-1.5 py-0.5 text-xs font-semibold">{ENROLL_LINK}</code> and
            their answers land right here. No paperwork to retype.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={copyLink}>
          <Copy size={14} /> Copy link
        </Button>
      </Card>

      <div className="mb-6 mt-6">
        <Tabs
          tabs={[
            { value: 'pending', label: 'Needs review', count: pendingCount },
            { value: 'approved', label: 'Approved', count: approvedCount },
            { value: 'declined', label: 'Declined', count: enrollments.filter((e) => e.status === 'declined').length },
            { value: 'all', label: 'All', count: enrollments.length },
          ]}
          value={tab}
          onChange={(v) => setTab(v as 'pending' | EnrollmentStatus | 'all')}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={tab === 'pending' ? 'No enrollments waiting' : 'Nothing in this view'}
          description={
            tab === 'pending'
              ? 'When a family fills out the enrollment form, it appears here for you to review.'
              : 'Switch tabs to see the other submissions.'
          }
          action={
            <Button variant="outline" onClick={copyLink}>
              <Copy size={16} /> Copy the enrollment link
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {rows.map((e, i) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.05, 0.3) }}
            >
              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-4">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-extrabold text-slate-900">{e.familyName}</h2>
                    <p className="text-sm text-slate-600">
                      {e.primaryContact} ({e.relation}) · submitted {fmtDate(e.submittedAt, 'EEEE, MMM d')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {e.acknowledgedHandbook && (
                      <Badge tone="green">
                        <ShieldCheck size={12} /> Policies accepted
                      </Badge>
                    )}
                    <Badge tone={e.status === 'pending' ? 'amber' : e.status === 'approved' ? 'green' : 'rose'}>
                      {e.status}
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-6 px-5 py-5 lg:grid-cols-[1fr_1.2fr]">
                  <div className="space-y-3 text-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Contact</p>
                    <p className="flex items-center gap-2 text-slate-700">
                      <Mail size={14} className="shrink-0 text-slate-400" />
                      <a href={`mailto:${e.email}`} className="truncate hover:text-[#4F77D9] hover:underline">
                        {e.email}
                      </a>
                    </p>
                    <p className="flex items-center gap-2 text-slate-700">
                      <Phone size={14} className="shrink-0 text-slate-400" />
                      <a href={`tel:${e.phone}`} className="hover:text-[#4F77D9] hover:underline">
                        {e.phone}
                      </a>
                    </p>
                    <p className="flex items-start gap-2 text-slate-700">
                      <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
                      {e.address}
                    </p>

                    {e.secondary.name && (
                      <>
                        <p className="pt-2 text-xs font-bold uppercase tracking-wider text-slate-500">Second guardian</p>
                        <p className="text-slate-700">
                          {e.secondary.name}
                          {e.secondary.relation ? ` (${e.secondary.relation})` : ''} · {e.secondary.phone || 'no phone given'}
                        </p>
                      </>
                    )}

                    {e.emergency.length > 0 && (
                      <>
                        <p className="pt-2 text-xs font-bold uppercase tracking-wider text-slate-500">Emergency contacts</p>
                        <ul className="space-y-1 text-slate-700">
                          {e.emergency.map((c, idx) => (
                            <li key={idx}>
                              {c.name}
                              {c.relation ? ` (${c.relation})` : ''} · {c.phone}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    {e.notes && (
                      <>
                        <p className="pt-2 text-xs font-bold uppercase tracking-wider text-slate-500">Notes from the family</p>
                        <p className="italic text-slate-600">{e.notes}</p>
                      </>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                      {e.children.length} {e.children.length === 1 ? 'child' : 'children'}
                    </p>
                    <div className="space-y-3">
                      {e.children.map((c) => (
                        <div key={c.id} className="rounded-xl border border-slate-200 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-display text-sm font-bold text-slate-900">{c.name}</p>
                            <div className="flex gap-1.5">
                              <Badge tone="blue">{c.ageGroup}</Badge>
                              <Badge tone="neutral">{c.plan}</Badge>
                            </div>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            Born {fmtDate(c.dob)} ({ageLabel(c.dob)}) · wants to start {fmtDate(c.startDate)}
                          </p>
                          {c.allergies.trim() && (
                            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-rose-50 p-2 text-xs text-rose-900">
                              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                              <span>
                                <strong>Allergies:</strong> {c.allergies}
                              </span>
                            </p>
                          )}
                          {c.medications.trim() && (
                            <p className="mt-1.5 rounded-lg bg-[#FDF1DC] p-2 text-xs text-[#7a5510]">
                              <strong>Medications:</strong> {c.medications}
                            </p>
                          )}
                          {c.notes.trim() && <p className="mt-2 text-xs italic text-slate-600">{c.notes}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
                  {e.status === 'pending' ? (
                    <>
                      <p className="text-xs text-slate-500">
                        Approving creates the family file, {e.children.length === 1 ? 'the child' : 'all children'}, and a
                        portal login.
                      </p>
                      <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => setConfirmDecline(e)}>
                          <XCircle size={16} /> Decline
                        </Button>
                        <Button variant="accent" onClick={() => setConfirmApprove(e)}>
                          <CheckCircle2 size={16} /> Approve &amp; enroll
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-slate-500">
                        {e.status === 'approved' ? 'Enrolled' : 'Declined'} {e.reviewedAt ? fmtDate(e.reviewedAt) : ''}
                      </p>
                      {e.createdFamilyId && (
                        <Button as={Link} to={`/admin/families/${e.createdFamilyId}`} size="sm" variant="outline">
                          Open family file <ArrowRight size={14} />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(confirmApprove)}
        onClose={() => setConfirmApprove(null)}
        title="Approve this enrollment?"
        description={confirmApprove?.familyName}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmApprove(null)}>
              Not yet
            </Button>
            <Button variant="accent" onClick={doApprove}>
              <CheckCircle2 size={16} /> Approve &amp; enroll
            </Button>
          </>
        }
      >
        <Card className="bg-[#E6F6F0]/60 p-4 text-sm text-[#1f6152]">
          This creates the family file, adds{' '}
          {confirmApprove?.children.map((c) => c.name).join(' and ') || 'their children'} as enrolled, and issues a parent
          portal login you can hand over.
        </Card>
      </Modal>

      <Modal
        open={Boolean(confirmDecline)}
        onClose={() => setConfirmDecline(null)}
        title="Decline this enrollment?"
        description={confirmDecline?.familyName}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDecline(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doDecline}>
              <XCircle size={16} /> Decline
            </Button>
          </>
        }
      >
        <Card className="bg-rose-50/60 p-4 text-sm text-rose-900">
          The submission stays on file so you have a record, but no family, children, or login are created. Reach out to
          them directly — the form does not send an automatic message.
        </Card>
      </Modal>

      <Modal
        open={Boolean(result)}
        onClose={() => setResult(null)}
        title="Family enrolled"
        description="Hand these details to the family so they can sign in."
        footer={
          <>
            {result?.familyId && (
              <Button as={Link} to={`/admin/families/${result.familyId}`} variant="outline">
                Open their file
              </Button>
            )}
            <Button onClick={() => setResult(null)}>Done</Button>
          </>
        }
      >
        {result?.credentials ? (
          <div className="space-y-4">
            <Card className="bg-slate-50 p-5">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <KeyRound size={13} /> Parent portal login
              </p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Email</dt>
                  <dd className="font-semibold text-slate-900">{result.credentials.email}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Temporary password</dt>
                  <dd className="font-mono font-semibold text-slate-900">{result.credentials.password}</dd>
                </div>
              </dl>
              <Button size="sm" variant="outline" className="mt-4 w-full" onClick={copyCredentials}>
                <Copy size={14} /> Copy login details
              </Button>
            </Card>
            <p className="text-xs text-slate-500">
              This preview build has no email sending connected, so the password is not sent automatically — copy it and
              pass it along however you normally would.
            </p>
          </div>
        ) : (
          <Card className="bg-amber-50 p-4 text-sm text-amber-900">
            {result?.loginError ?? 'The family and children were created, but no portal login was issued.'}
          </Card>
        )}
      </Modal>
    </PageTransition>
  )
}

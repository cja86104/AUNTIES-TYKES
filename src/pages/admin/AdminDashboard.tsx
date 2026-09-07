import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import {
  Baby,
  Users,
  Wallet,
  ClipboardCheck,
  ArrowRight,
  LogIn,
  LogOut,
  UserX,
  Megaphone,
  MessageSquare,
  GripVertical,
  CalendarClock,
  TrendingUp,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import PageTransition from '../../components/PageTransition'
import {
  Card,
  Button,
  Badge,
  StatCard,
  PageHeader,
  Avatar,
  EmptyState,
  SkeletonCard,
  Skeleton,
  statusTone,
} from '../../components/ui'
import { useStore } from '../../store/useStore'
import { useBootstrap } from '../../lib/hooks'
import { money, todayISO, fmtTime, fmtDate, invoiceBalance, invoiceStatus, sum, ageLabel } from '../../lib/helpers'
import { revenueTrend } from '../../data/mockData'
import type { DragEndEvent } from '@dnd-kit/core'
import type { Child, WaitlistProspect } from '../../types'

interface AttendanceTally {
  date: string
  present: number
  absent: number
}

interface AttendanceTrendPoint extends AttendanceTally {
  label: string
}

interface SortableWaitlistRowProps {
  item: WaitlistProspect
  index: number
}

function SortableWaitlistRow({ item, index }: SortableWaitlistRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-xl border bg-white px-3.5 py-3 ${
        isDragging ? 'border-[#4F77D9] shadow-lg' : 'border-slate-200'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
        aria-label={`Reorder ${item.childName}`}
      >
        <GripVertical size={16} />
      </button>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#4F77D9]/10 font-display text-xs font-extrabold text-[#39569f]">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-900">{item.childName}</p>
        <p className="truncate text-xs text-slate-500">
          {item.ageGroup} · {item.requested} · {item.note}
        </p>
      </div>
    </li>
  )
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { isLoading } = useBootstrap('admin-dashboard')

  const children = useStore((s) => s.children)
  const families = useStore((s) => s.families)
  const attendance = useStore((s) => s.attendance)
  const invoices = useStore((s) => s.invoices)
  const announcements = useStore((s) => s.announcements)
  const threads = useStore((s) => s.threads)
  const leads = useStore((s) => s.leads)
  const waitlist = useStore((s) => s.waitlist)
  const setWaitlist = useStore((s) => s.setWaitlist)
  const checkIn = useStore((s) => s.checkIn)
  const checkOut = useStore((s) => s.checkOut)
  const markAbsent = useStore((s) => s.markAbsent)
  const pushToast = useStore((s) => s.pushToast)

  const today = todayISO()

  const active = useMemo(() => children.filter((c) => c.status === 'active'), [children])
  const todayRecords = useMemo(() => attendance.filter((a) => a.date === today), [attendance, today])

  const rows = useMemo(
    () =>
      active.map((c) => ({
        child: c,
        record: todayRecords.find((a) => a.childId === c.id) || null,
      })),
    [active, todayRecords],
  )

  const presentCount = rows.filter((r) => r.record?.status === 'present').length
  const outCount = rows.filter((r) => r.record?.status === 'checked-out').length
  const absentCount = rows.filter((r) => r.record?.status === 'absent').length

  const outstanding = useMemo(() => sum(invoices, (i) => invoiceBalance(i)), [invoices])
  const overdue = useMemo(() => invoices.filter((i) => invoiceStatus(i) === 'overdue'), [invoices])

  const attendanceTrend = useMemo<AttendanceTrendPoint[]>(() => {
    const byDate = new Map<string, AttendanceTally>()
    attendance.forEach((a) => {
      const entry = byDate.get(a.date) ?? { date: a.date, present: 0, absent: 0 }
      if (a.status === 'absent') entry.absent += 1
      else if (a.status !== 'expected') entry.present += 1
      byDate.set(a.date, entry)
    })
    return Array.from(byDate.values())
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(-10)
      .map((d) => ({ ...d, label: fmtDate(d.date, 'MMM d') }))
  }, [attendance])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (event: DragEndEvent) => {
    const { active: a, over } = event
    if (!over || a.id === over.id) return
    const oldIndex = waitlist.findIndex((w) => w.id === a.id)
    const newIndex = waitlist.findIndex((w) => w.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    setWaitlist(arrayMove(waitlist, oldIndex, newIndex))
    pushToast({ title: 'Waitlist reordered', description: 'The new priority order was saved.' })
  }

  const doCheckIn = (child: Child) => {
    checkIn(child.id)
    pushToast({ title: `${child.name.split(' ')[0]} checked in`, description: 'Time stamped just now.' })
  }
  const doCheckOut = (child: Child) => {
    checkOut(child.id)
    pushToast({ title: `${child.name.split(' ')[0]} checked out`, description: 'Have a good evening!' })
  }
  const doAbsent = (child: Child) => {
    markAbsent(child.id)
    pushToast({ tone: 'info', title: `${child.name.split(' ')[0]} marked absent` })
  }

  const recentThreads = useMemo(
    () => [...threads].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 3),
    [threads],
  )

  if (isLoading) {
    return (
      <PageTransition>
        <PageHeader title="Dashboard" description="Loading today's numbers…" />
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Card className="p-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-6 h-56 w-full" />
          </Card>
          <Card className="p-6">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-6 h-40 w-full" />
          </Card>
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <PageHeader
        title="Good day, Auntie Roz"
        description={`${fmtDate(today, 'EEEE, MMMM d')} · ${presentCount} here now, ${absentCount} out, ${
          rows.length - presentCount - outCount - absentCount
        } still expected.`}
        actions={
          <>
            <Button as={Link} to="/admin/attendance" variant="outline">
              <ClipboardCheck size={16} /> Attendance
            </Button>
            <Button as={Link} to="/admin/daily-logs">
              Write daily logs <ArrowRight size={16} />
            </Button>
          </>
        }
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Baby}
          label="Enrolled children"
          value={active.length}
          sub={`${children.filter((c) => c.status === 'waitlist').length} on the waitlist`}
          tone="blue"
          onClick={() => navigate('/admin/children')}
        />
        <StatCard
          icon={ClipboardCheck}
          label="Here today"
          value={`${presentCount}/${rows.length}`}
          sub={`${outCount} checked out · ${absentCount} absent`}
          tone="green"
          onClick={() => navigate('/admin/attendance')}
        />
        <StatCard
          icon={Wallet}
          label="Outstanding balance"
          value={money(outstanding)}
          sub={`${overdue.length} invoice${overdue.length === 1 ? '' : 's'} overdue`}
          tone={overdue.length ? 'rose' : 'amber'}
          onClick={() => navigate('/admin/billing')}
        />
        <StatCard
          icon={Users}
          label="Families"
          value={families.length}
          sub={`${leads.length} open inquir${leads.length === 1 ? 'y' : 'ies'}`}
          tone="violet"
          onClick={() => navigate('/admin/families')}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        {/* Today's roster */}
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">Today's roster</h2>
              <p className="text-xs text-slate-500">Tap to check children in and out in real time.</p>
            </div>
            <Badge tone="blue">
              <CalendarClock size={12} /> {fmtDate(today, 'MMM d')}
            </Badge>
          </div>

          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={Baby} title="No active children" description="Enroll a child to start tracking attendance." />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map(({ child, record }) => {
                const status = record?.status || 'expected'
                return (
                  <li key={child.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <Avatar name={child.name} hue={child.hue} size="md" />
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/admin/children/${child.id}`}
                        className="truncate font-display text-sm font-bold text-slate-900 transition hover:text-[#4F77D9]"
                      >
                        {child.name}
                      </Link>
                      <p className="truncate text-xs text-slate-500">
                        {child.ageGroup} · {ageLabel(child.dob)} ·{' '}
                        {record?.checkIn ? `in ${fmtTime(record.checkIn)}` : 'not in yet'}
                        {record?.checkOut ? ` · out ${fmtTime(record.checkOut)}` : ''}
                      </p>
                    </div>
                    <Badge tone={statusTone(status)}>{status}</Badge>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => doCheckIn(child)} disabled={status === 'present'}>
                        <LogIn size={14} /> In
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => doCheckOut(child)}
                        disabled={status !== 'present'}
                      >
                        <LogOut size={14} /> Out
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => doAbsent(child)} disabled={status === 'absent'}>
                        <UserX size={14} />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Waitlist */}
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">Waitlist priority</h2>
              <p className="text-xs text-slate-500">Drag to reorder. Order is saved instantly.</p>
            </div>
            <Badge tone="amber">{waitlist.length} waiting</Badge>
          </div>

          {waitlist.length === 0 ? (
            <div className="mt-5">
              <EmptyState icon={Users} title="Waitlist is empty" description="New inquiries land here once you add them." />
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={waitlist.map((w) => w.id)} strategy={verticalListSortingStrategy}>
                <ul className="mt-5 space-y-2.5">
                  {waitlist.map((item, i) => (
                    <SortableWaitlistRow key={item.id} item={item} index={i} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          <Button as={Link} to="/admin/families" variant="ghost" className="mt-4 w-full">
            Manage inquiries <ArrowRight size={15} />
          </Button>
        </Card>
      </div>

      {/* Revenue + attendance charts */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">Billed vs collected</h2>
              <p className="text-xs text-slate-500">Last six months of tuition</p>
            </div>
            <Badge tone="green">
              <TrendingUp size={12} /> 6 mo
            </Badge>
          </div>
          <div className="mt-5 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueTrend} margin={{ left: -18, right: 6, top: 6, bottom: 0 }}>
                <defs>
                  <linearGradient id="gBilled" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4F77D9" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#4F77D9" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gCollected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5DC4A6" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#5DC4A6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eceae5" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v, n) => [money(Number(v)), n === 'billed' ? 'Billed' : 'Collected']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Area type="monotone" dataKey="billed" stroke="#4F77D9" strokeWidth={2} fill="url(#gBilled)" />
                <Area type="monotone" dataKey="collected" stroke="#5DC4A6" strokeWidth={2} fill="url(#gCollected)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">Attendance trend</h2>
              <p className="text-xs text-slate-500">Children present per day</p>
            </div>
            <Badge tone="blue">10 days</Badge>
          </div>
          <div className="mt-5 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={attendanceTrend} margin={{ left: -22, right: 6, top: 6, bottom: 0 }}>
                <defs>
                  <linearGradient id="gPresent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F5B942" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#F5B942" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eceae5" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Area type="monotone" dataKey="present" stroke="#C98A18" strokeWidth={2} fill="url(#gPresent)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-slate-900">Latest announcement</h2>
            <Megaphone size={17} className="text-[#F5B942]" />
          </div>
          {announcements[0] ? (
            <div className="mt-4">
              <p className="font-display text-base font-bold text-slate-900">{announcements[0].title}</p>
              <p className="text-xs text-slate-500">{fmtDate(announcements[0].date)}</p>
              <div className="md mt-3 max-h-40 overflow-hidden text-sm">
                <ReactMarkdown>{announcements[0].body}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Nothing posted yet.</p>
          )}
          <Button as={Link} to="/admin/messages" variant="ghost" className="mt-4 w-full">
            Post an update <ArrowRight size={15} />
          </Button>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-slate-900">Recent conversations</h2>
            <MessageSquare size={17} className="text-[#4F77D9]" />
          </div>
          <ul className="mt-4 space-y-3">
            {recentThreads.map((t) => {
              const last = t.messages[t.messages.length - 1]
              const fam = families.find((f) => f.id === t.familyId)
              return (
                <li key={t.id}>
                  <Link
                    to="/admin/messages"
                    className="block rounded-xl border border-slate-200 p-3.5 transition hover:border-[#4F77D9] hover:bg-[#4F77D9]/5"
                  >
                    <p className="truncate text-sm font-bold text-slate-900">{t.subject}</p>
                    <p className="truncate text-xs text-slate-500">
                      {fam?.name} · {fmtDate(t.updatedAt)}
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600">{last?.body}</p>
                  </Link>
                </li>
              )
            })}
            {recentThreads.length === 0 && <p className="text-sm text-slate-500">No messages yet.</p>}
          </ul>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-slate-900">New inquiries</h2>
            <Users size={17} className="text-[#5DC4A6]" />
          </div>
          <ul className="mt-4 space-y-3">
            {leads.slice(0, 3).map((l) => (
              <li key={l.id} className="rounded-xl border border-slate-200 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-bold text-slate-900">{l.parentName}</p>
                  <Badge tone={l.status === 'Tour scheduled' ? 'green' : 'amber'}>{l.status}</Badge>
                </div>
                <p className="truncate text-xs text-slate-500">
                  {l.childAges} · {fmtDate(l.createdAt)}
                </p>
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600">{l.message}</p>
              </li>
            ))}
            {leads.length === 0 && <p className="text-sm text-slate-500">No open inquiries.</p>}
          </ul>
          <Button as={Link} to="/admin/families" variant="ghost" className="mt-4 w-full">
            Open inquiry inbox <ArrowRight size={15} />
          </Button>
        </Card>
      </div>
    </PageTransition>
  )
}
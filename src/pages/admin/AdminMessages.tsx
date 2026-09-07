import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { Megaphone, MessageSquare, Plus, Send, Users, Inbox } from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import {
  Avatar,
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
  Textarea,
} from '../../components/ui'
import { useStore } from '../../store/useStore'
import { fmtDate } from '../../lib/helpers'

interface AnnouncementErrors {
  title?: string
  body?: string
}

export default function AdminMessages() {
  const announcements = useStore((s) => s.announcements)
  const threads = useStore((s) => s.threads)
  const families = useStore((s) => s.families)
  const user = useStore((s) => s.user)
  const addAnnouncement = useStore((s) => s.addAnnouncement)
  const sendThreadMessage = useStore((s) => s.sendThreadMessage)
  const pushToast = useStore((s) => s.pushToast)

  const [tab, setTab] = useState<'announcements' | 'threads'>('announcements')
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState('all')
  const [errors, setErrors] = useState<AnnouncementErrors>({})

  const [activeThreadId, setActiveThreadId] = useState<string | null>(threads[0]?.id ?? null)
  const [reply, setReply] = useState('')

  const familyName = (id: string) => families.find((f) => f.id === id)?.name ?? 'Unknown family'

  const sortedAnnouncements = useMemo(
    () => [...announcements].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [announcements],
  )
  const sortedThreads = useMemo(
    () => [...threads].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [threads],
  )
  const activeThread = sortedThreads.find((t) => t.id === activeThreadId) ?? sortedThreads[0]

  const publish = () => {
    const next: AnnouncementErrors = {}
    if (!title.trim()) next.title = 'Give the announcement a title'
    if (body.trim().length < 10) next.body = 'Write at least a sentence'
    setErrors(next)
    if (Object.keys(next).length) return

    addAnnouncement({ title: title.trim(), body: body.trim(), audience })
    setOpen(false)
    setTitle('')
    setBody('')
    setAudience('all')
    setErrors({})
    pushToast({
      title: 'Announcement posted',
      description: audience === 'all' ? 'Every family can see it now.' : `Sent to ${familyName(audience)}.`,
    })
  }

  const sendReply = () => {
    if (!activeThread || !reply.trim()) return
    sendThreadMessage(activeThread.id, {
      from: 'admin',
      authorName: user?.name ?? 'Rosalind Hayes',
      body: reply.trim(),
    })
    setReply('')
    pushToast({ title: 'Reply sent', description: `${familyName(activeThread.familyId)} will see it in their portal.` })
  }

  return (
    <PageTransition>
      <PageHeader
        title="Messages"
        description="Post announcements to every family, or answer a family directly."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> New announcement
          </Button>
        }
      />

      <div className="mb-6">
        <Tabs
          tabs={[
            { value: 'announcements', label: 'Announcements', count: announcements.length },
            { value: 'threads', label: 'Family threads', count: threads.length },
          ]}
          value={tab}
          onChange={(v) => setTab(v as 'announcements' | 'threads')}
        />
      </div>

      {tab === 'announcements' ? (
        sortedAnnouncements.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No announcements yet"
            description="Post a note and it lands in every family's portal right away."
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus size={16} /> Write the first one
              </Button>
            }
          />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {sortedAnnouncements.map((a, i) => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.3) }}
              >
                <Card hover className="h-full overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4">
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-bold text-slate-900">{a.title}</h3>
                      <p className="mt-0.5 text-xs text-slate-500">{fmtDate(a.date, 'EEEE, MMMM d')}</p>
                    </div>
                    <Badge tone={a.audience === 'all' ? 'blue' : 'violet'}>
                      <Users size={12} /> {a.audience === 'all' ? 'All families' : familyName(a.audience)}
                    </Badge>
                  </div>
                  <div className="md px-5 py-4 text-sm">
                    <ReactMarkdown>{a.body}</ReactMarkdown>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )
      ) : sortedThreads.length === 0 ? (
        <EmptyState icon={Inbox} title="No family threads yet" description="When a family writes in, the conversation appears here." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="font-display text-sm font-bold text-slate-900">Conversations</h2>
            </div>
            <ul className="divide-y divide-slate-100">
              {sortedThreads.map((t) => {
                const isActive = activeThread?.id === t.id
                const last = t.messages[t.messages.length - 1]
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setActiveThreadId(t.id)}
                      className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition ${
                        isActive ? 'bg-[#4F77D9]/8' : 'hover:bg-slate-50'
                      }`}
                    >
                      <Avatar name={familyName(t.familyId)} size="sm" hue="from-[#F5B942] to-[#5DC4A6]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-sm font-bold text-slate-900">{t.subject}</span>
                        <span className="block truncate text-xs text-slate-500">{familyName(t.familyId)}</span>
                        {last && <span className="mt-0.5 block truncate text-xs text-slate-400">{last.body}</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>

          {activeThread && (
            <Card className="flex flex-col overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">{activeThread.subject}</h2>
                  <p className="text-xs text-slate-500">
                    {familyName(activeThread.familyId)} · updated {fmtDate(activeThread.updatedAt)}
                  </p>
                </div>
                <Badge tone="neutral">
                  <MessageSquare size={12} /> {activeThread.messages.length}
                </Badge>
              </div>

              <div className="flex-1 space-y-4 px-5 py-5">
                {activeThread.messages.map((m, i) => {
                  const mine = m.from === 'admin'
                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.05, 0.25) }}
                      className={`flex gap-3 ${mine ? 'flex-row-reverse' : ''}`}
                    >
                      <Avatar
                        name={m.authorName}
                        size="sm"
                        hue={mine ? 'from-[#4F77D9] to-[#5DC4A6]' : 'from-[#F5B942] to-[#F9D28A]'}
                      />
                      <div className={`max-w-[80%] ${mine ? 'text-right' : ''}`}>
                        <p className="text-xs font-semibold text-slate-500">
                          {m.authorName} · {fmtDate(m.at)}
                        </p>
                        <p
                          className={`mt-1 inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            mine ? 'bg-[#4F77D9] text-white' : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {m.body}
                        </p>
                      </div>
                    </motion.div>
                  )
                })}
              </div>

              <div className="border-t border-slate-100 p-4">
                <div className="flex gap-2">
                  <Input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendReply()
                      }
                    }}
                    placeholder={`Reply to ${familyName(activeThread.familyId)}…`}
                    aria-label="Reply message"
                  />
                  <Button onClick={sendReply} disabled={!reply.trim()}>
                    <Send size={16} /> Send
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        wide
        title="New announcement"
        description="Markdown works here — use **bold**, lists, and short paragraphs."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={publish}>
              <Megaphone size={16} /> Post announcement
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title" error={errors.title}>
            <Input
              value={title}
              invalid={Boolean(errors.title)}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Picture day is next Thursday 📸"
            />
          </Field>
          <Field label="Audience">
            <Select value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="all">All families</option>
              {families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} only
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Message" error={errors.body}>
            <Textarea
              rows={7}
              value={body}
              invalid={Boolean(errors.body)}
              onChange={(e) => setBody(e.target.value)}
              placeholder={'Our photographer arrives at **9:30 AM** next Thursday.\n\n- Clothes without logos if you can\n- Order forms go home Tuesday'}
            />
          </Field>
          {body.trim() && (
            <div>
              <p className="mb-1.5 text-sm font-semibold text-slate-700">Preview</p>
              <Card className="md bg-slate-50 p-4 text-sm">
                <ReactMarkdown>{body}</ReactMarkdown>
              </Card>
            </div>
          )}
        </div>
      </Modal>
    </PageTransition>
  )
}

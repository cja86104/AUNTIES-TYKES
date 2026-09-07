import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { Megaphone, MessageSquare, Send, Plus, Users, Inbox } from 'lucide-react'
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
  Tabs,
  Textarea,
} from '../../components/ui'
import { useStore } from '../../store/useStore'
import { useFamilyScope } from '../../lib/useFamilyScope'
import { fmtDate, todayISO, uid } from '../../lib/helpers'

interface NewThreadErrors {
  subject?: string
  body?: string
}

export default function ParentMessages() {
  const { user, familyId, family, announcements } = useFamilyScope()
  const allThreads = useStore((s) => s.threads)
  const sendThreadMessage = useStore((s) => s.sendThreadMessage)
  const startThread = useStore((s) => s.startThread)
  const pushToast = useStore((s) => s.pushToast)

  const threads = useMemo(
    () =>
      allThreads
        .filter((t) => t.familyId === familyId)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [allThreads, familyId],
  )

  const [tab, setTab] = useState<'announcements' | 'threads'>('announcements')
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [errors, setErrors] = useState<NewThreadErrors>({})

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? threads[0]
  const authorName = user?.name ?? family?.primaryContact ?? 'Parent'

  const sendReply = () => {
    if (!activeThread || !reply.trim()) return
    sendThreadMessage(activeThread.id, { from: 'parent', authorName, body: reply.trim() })
    setReply('')
    pushToast({ title: 'Message sent', description: 'Auntie Roz will see it on her next check of the portal.' })
  }

  const createThread = () => {
    const next: NewThreadErrors = {}
    if (!subject.trim()) next.subject = 'What is this about?'
    if (body.trim().length < 5) next.body = 'Add a little more detail'
    setErrors(next)
    if (Object.keys(next).length) return

    startThread({
      familyId,
      subject: subject.trim(),
      messages: [
        {
          id: uid('msg'),
          from: 'parent',
          authorName,
          at: todayISO(),
          body: body.trim(),
        },
      ],
    })
    setOpen(false)
    setSubject('')
    setBody('')
    setErrors({})
    setTab('threads')
    pushToast({ title: 'Message sent', description: 'We started a new conversation with Auntie Roz.' })
  }

  return (
    <PageTransition>
      <PageHeader
        title="Messages"
        description="Announcements from Aunties Tykes, and your own conversations with Auntie Roz."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> New message
          </Button>
        }
      />

      <div className="mb-6">
        <Tabs
          tabs={[
            { value: 'announcements', label: 'Announcements', count: announcements.length },
            { value: 'threads', label: 'My conversations', count: threads.length },
          ]}
          value={tab}
          onChange={(v) => setTab(v as 'announcements' | 'threads')}
        />
      </div>

      {tab === 'announcements' ? (
        announcements.length === 0 ? (
          <EmptyState icon={Megaphone} title="No announcements yet" description="Notices from Auntie Roz will appear here." />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {announcements.map((a, i) => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.06, 0.35) }}
              >
                <Card hover className="h-full overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-br from-[#FDF1DC] to-white px-5 py-4">
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-bold text-slate-900">{a.title}</h3>
                      <p className="mt-0.5 text-xs text-slate-500">{fmtDate(a.date, 'EEEE, MMMM d')}</p>
                    </div>
                    {a.audience !== 'all' && (
                      <Badge tone="violet">
                        <Users size={12} /> Just for you
                      </Badge>
                    )}
                  </div>
                  <div className="md px-5 py-4 text-sm">
                    <ReactMarkdown>{a.body}</ReactMarkdown>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )
      ) : threads.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No conversations yet"
          description="Question about nap time, pickup, or a form? Start a message and Auntie Roz will get back to you."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} /> Write a message
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="font-display text-sm font-bold text-slate-900">Your conversations</h2>
            </div>
            <ul className="divide-y divide-slate-100">
              {threads.map((t) => {
                const isActive = activeThread?.id === t.id
                const last = t.messages[t.messages.length - 1]
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setActiveThreadId(t.id)}
                      className={`w-full px-4 py-3.5 text-left transition ${isActive ? 'bg-[#4F77D9]/8' : 'hover:bg-slate-50'}`}
                    >
                      <span className="block truncate font-display text-sm font-bold text-slate-900">{t.subject}</span>
                      <span className="block text-xs text-slate-500">{fmtDate(t.updatedAt)}</span>
                      {last && <span className="mt-0.5 block truncate text-xs text-slate-400">{last.body}</span>}
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
                  <p className="text-xs text-slate-500">Updated {fmtDate(activeThread.updatedAt)}</p>
                </div>
                <Badge tone="neutral">
                  <MessageSquare size={12} /> {activeThread.messages.length}
                </Badge>
              </div>

              <div className="flex-1 space-y-4 px-5 py-5">
                {activeThread.messages.map((m, i) => {
                  const mine = m.from === 'parent'
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
                        hue={mine ? 'from-[#F5B942] to-[#5DC4A6]' : 'from-[#4F77D9] to-[#7DA0F0]'}
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
                    placeholder="Write a reply…"
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
        title="Message Auntie Roz"
        description="She reads the portal between naps and after pickup. For anything urgent, please call."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createThread}>
              <Send size={16} /> Send message
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Subject" error={errors.subject}>
            <Input
              value={subject}
              invalid={Boolean(errors.subject)}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Pickup change on Friday"
            />
          </Field>
          <Field label="Message" error={errors.body}>
            <Textarea
              rows={6}
              value={body}
              invalid={Boolean(errors.body)}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Grandma is picking up on Friday around 4 — she's on the emergency contact list."
            />
          </Field>
        </div>
      </Modal>
    </PageTransition>
  )
}

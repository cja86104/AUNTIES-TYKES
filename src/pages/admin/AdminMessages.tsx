import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { Megaphone, MessageSquare, Paperclip, Plus, Send, Users, Inbox, ArrowLeft, X, Search, CalendarDays, Trash2 } from 'lucide-react'
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
import FileUploader from '../../components/FileUploader'
import WeekPicker from '../../components/WeekPicker'
import { useStore } from '../../store/useStore'
import { DAYCARE_TIME_ZONE, bytes, cx, fmtDate, nowISO, todayISO, uid, weekLabel } from '../../lib/helpers'
import { weekOf, weekStartOf, weeksWithItems } from '../../lib/weeks'
import { downloadDocument, isInlineImage, removeDocumentFile } from '../../lib/storage'
import { AttachmentPhoto } from '../../components/DailyLogCard'
import { useSectionSeen } from '../../lib/unread'
import type { Announcement, Thread, UploadedFileMeta } from '../../types'

interface AnnouncementErrors {
  title?: string
  body?: string
}

interface ThreadErrors {
  family?: string
  subject?: string
  body?: string
}

export default function AdminMessages() {
  const announcements = useStore((s) => s.announcements)
  const threads = useStore((s) => s.threads)
  const families = useStore((s) => s.families)
  const user = useStore((s) => s.user)
  const addAnnouncement = useStore((s) => s.addAnnouncement)
  const deleteAnnouncement = useStore((s) => s.deleteAnnouncement)
  const sendThreadMessage = useStore((s) => s.sendThreadMessage)
  const startThread = useStore((s) => s.startThread)
  const deleteThread = useStore((s) => s.deleteThread)
  const pushToast = useStore((s) => s.pushToast)
  const seen = useSectionSeen('messages')

  const [tab, setTab] = useState<'announcements' | 'threads'>('threads')
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState('all')
  const [errors, setErrors] = useState<AnnouncementErrors>({})
  const [confirmDelete, setConfirmDelete] = useState<Announcement | null>(null)
  const [confirmDeleteThread, setConfirmDeleteThread] = useState<Thread | null>(null)
  const [attachment, setAttachment] = useState<UploadedFileMeta | null>(null)
  /** True while the attachment is still uploading, so Post cannot go without it. */
  const [uploading, setUploading] = useState(false)
  /**
   * Which announcement draft is on screen. Bumped every time the form is posted
   * or cancelled.
   *
   * An upload outlives the form that started it: a phone photo can still be on
   * its way when she posts or cancels. `draftId` is the id the form was rendered
   * with — and so the one an upload started from it remembers — and `liveDraft`
   * is the id right now. When they differ, the file belongs to a draft that is
   * gone, and it is deleted rather than quietly becoming the attachment on
   * whatever she writes next.
   */
  const [draftId, setDraftId] = useState(0)
  const liveDraft = useRef(0)

  const [activeThreadId, setActiveThreadId] = useState<string | null>(threads[0]?.id ?? null)
  /**
   * Below lg the list and thread stack, and the thread lands off the fold — so on
   * phones they take turns instead. A thread is auto-selected on mount, so this
   * cannot be derived from activeThreadId or the list would never be reachable.
   */
  const [mobilePane, setMobilePane] = useState<'list' | 'thread'>('list')
  const [reply, setReply] = useState('')

  /** The "start a conversation with one family" composer. */
  const [composeOpen, setComposeOpen] = useState(false)
  const [toFamily, setToFamily] = useState('')
  const [threadSubject, setThreadSubject] = useState('')
  const [threadBody, setThreadBody] = useState('')
  const [threadErrors, setThreadErrors] = useState<ThreadErrors>({})

  const familyName = (id: string) => families.find((f) => f.id === id)?.name ?? 'Unknown family'

  /**
   * Announcements start fresh every Monday on the admin side only: the tab
   * opens on this week (Mon–Sun, Eastern), earlier weeks are one step back,
   * and search looks across every week. Stepping back a week deletes nothing;
   * only the delete button on a card (with its confirmation) removes one.
   */
  const thisWeek = weekStartOf(todayISO()) ?? todayISO()
  const [week, setWeek] = useState(thisWeek)
  const [announcementQuery, setAnnouncementQuery] = useState('')

  const sortedAnnouncements = useMemo(
    () =>
      [...announcements]
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((a) => ({ ...a, week: weekOf(a.date, DAYCARE_TIME_ZONE) })),
    [announcements],
  )
  const announcementWeeks = useMemo(
    () => weeksWithItems(sortedAnnouncements.map((a) => a.week), thisWeek),
    [sortedAnnouncements, thisWeek],
  )
  const searchingAnnouncements = announcementQuery.trim() !== ''
  const shownAnnouncements = useMemo(() => {
    const q = announcementQuery.trim().toLowerCase()
    if (!q) return sortedAnnouncements.filter((a) => a.week === week)
    return sortedAnnouncements.filter((a) => {
      const audienceName = a.audience === 'all' ? 'all families' : (families.find((f) => f.id === a.audience)?.name ?? '')
      return `${a.title} ${a.body} ${audienceName} ${a.attachmentFileName ?? ''}`.toLowerCase().includes(q)
    })
  }, [sortedAnnouncements, announcementQuery, week, families])
  const thisWeekAnnouncementCount = announcementWeeks.find((w) => w.start === thisWeek)?.count ?? 0

  /**
   * Conversations get the same weekly view. A conversation belongs to the week
   * of its latest message (updatedAt), so a new reply from either side brings
   * an older conversation back into this week. Search looks across every week
   * — subject, family, and every message in it. Nothing is moved or deleted.
   */
  const [threadWeek, setThreadWeek] = useState(thisWeek)
  const [threadQuery, setThreadQuery] = useState('')
  const sortedThreads = useMemo(
    () =>
      [...threads]
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .map((t) => ({ ...t, week: weekOf(t.updatedAt, DAYCARE_TIME_ZONE) })),
    [threads],
  )
  const threadWeeks = useMemo(
    () => weeksWithItems(sortedThreads.map((t) => t.week), thisWeek),
    [sortedThreads, thisWeek],
  )
  /** A parent message she has not seen yet — the same rule the list's "New" pill uses. */
  const hasUnread = (t: Thread) => t.messages.some((m) => m.from === 'parent' && seen.isNew(m.at))
  const unreadThreadWeeks = new Set(
    sortedThreads.flatMap((t) => (t.week !== null && hasUnread(t) ? [t.week] : [])),
  )
  const searchingThreads = threadQuery.trim() !== ''
  const shownThreads = useMemo(() => {
    const q = threadQuery.trim().toLowerCase()
    if (!q) return sortedThreads.filter((t) => t.week === threadWeek)
    return sortedThreads.filter((t) => {
      const family = families.find((f) => f.id === t.familyId)?.name ?? ''
      const text = t.messages.map((m) => `${m.authorName} ${m.body}`).join(' ')
      return `${t.subject} ${family} ${text}`.toLowerCase().includes(q)
    })
  }, [sortedThreads, threadQuery, threadWeek, families])
  const thisWeekThreadCount = threadWeeks.find((w) => w.start === thisWeek)?.count ?? 0
  const activeThread = shownThreads.find((t) => t.id === activeThreadId) ?? shownThreads[0]

  /** A file already sitting in storage that no announcement row points at yet. */
  const discardStagedAttachment = (meta: UploadedFileMeta | null) => {
    if (!meta) return
    void removeDocumentFile(meta.storagePath).catch(() => {
      /* best-effort cleanup; an orphaned object is harmless */
    })
  }

  /** Clears the form and retires its draft id, so nothing in flight can land on the next one. */
  const resetAnnouncementForm = () => {
    liveDraft.current += 1
    setDraftId(liveDraft.current)
    setOpen(false)
    setTitle('')
    setBody('')
    setAudience('all')
    setAttachment(null)
    setUploading(false)
    setErrors({})
  }

  const onAttachmentUploaded = (meta: UploadedFileMeta) => {
    // Finished after its draft was posted or cancelled — not this form's file.
    if (draftId !== liveDraft.current) {
      discardStagedAttachment(meta)
      return
    }
    // Only one file per announcement — replacing a choice drops the one before it.
    discardStagedAttachment(attachment)
    setAttachment(meta)
  }

  const onAttachmentBusy = (busy: boolean) => {
    // A stale uploader reporting in must not unlock or lock the current form.
    if (draftId === liveDraft.current) setUploading(busy)
  }

  const onAttachmentError = (message: string) => {
    pushToast({ tone: 'error', title: 'That file was not uploaded', description: message })
  }

  const removeAttachment = () => {
    discardStagedAttachment(attachment)
    setAttachment(null)
  }

  const closeAnnouncementModal = () => {
    discardStagedAttachment(attachment)
    resetAnnouncementForm()
  }

  const publish = () => {
    // The button is disabled while a file uploads; this is the same rule for
    // any path that reaches here without it. Posting now would save the
    // announcement with no attachment and leave the photo behind.
    if (uploading) return
    const next: AnnouncementErrors = {}
    if (!title.trim()) next.title = 'Give the announcement a title'
    if (body.trim().length < 10) next.body = 'Write at least a sentence'
    setErrors(next)
    if (Object.keys(next).length) return

    addAnnouncement({
      title: title.trim(),
      body: body.trim(),
      audience,
      attachmentFileName: attachment?.fileName,
      attachmentSize: attachment?.size,
      attachmentStoragePath: attachment?.storagePath,
    })
    resetAnnouncementForm()
    // A new post belongs to this week; bring her back to it if she was looking at an older one.
    setWeek(thisWeek)
    setAnnouncementQuery('')
    pushToast({
      title: 'Announcement posted',
      description: audience === 'all' ? 'Every family can see it now.' : `Sent to ${familyName(audience)}.`,
    })
  }

  const doDeleteAnnouncement = () => {
    if (!confirmDelete) return
    const { id, title: deletedTitle } = confirmDelete
    deleteAnnouncement(id)
    pushToast({ tone: 'info', title: 'Announcement deleted', description: `${deletedTitle} is gone from the portals.` })
    setConfirmDelete(null)
  }

  const onDownloadAttachment = (a: { attachmentStoragePath?: string; attachmentFileName?: string; title: string }) => {
    if (!a.attachmentStoragePath) return
    void downloadDocument(a.attachmentStoragePath, a.attachmentFileName).catch((error: unknown) => {
      pushToast({
        tone: 'error',
        title: 'That download did not open',
        description: error instanceof Error ? error.message : 'Check your connection and try again.',
      })
    })
  }

  /**
   * Opens a thread the family can answer. An announcement is one-way and goes
   * to everyone; this is the other half — a conversation with one family that
   * either side can start.
   */
  const startConversation = () => {
    const next: ThreadErrors = {}
    if (!toFamily) next.family = 'Choose which family this goes to'
    if (!threadSubject.trim()) next.subject = 'Give it a subject'
    if (threadBody.trim().length < 5) next.body = 'Write at least a sentence'
    setThreadErrors(next)
    if (Object.keys(next).length) return

    const recipient = familyName(toFamily)
    startThread({
      familyId: toFamily,
      subject: threadSubject.trim(),
      messages: [
        {
          id: uid('msg'),
          from: 'admin',
          authorName: user?.name ?? "Auntie's Tykes",
          at: nowISO(),
          body: threadBody.trim(),
        },
      ],
    })
    setComposeOpen(false)
    setToFamily('')
    setThreadSubject('')
    setThreadBody('')
    setThreadErrors({})
    setTab('threads')
    // A new conversation belongs to this week; bring her back to it.
    setThreadWeek(thisWeek)
    setThreadQuery('')
    // Clearing the selection lets the list fall through to the newest thread.
    setActiveThreadId(null)
    pushToast({ title: 'Message sent', description: `${recipient} will see it in their portal.` })
  }

  const doDeleteThread = () => {
    if (!confirmDeleteThread) return
    const { id, subject } = confirmDeleteThread
    deleteThread(id)
    // Clearing the selection lets the list fall through to the newest thread,
    // and the phone view goes back to the list rather than into a different one.
    setActiveThreadId(null)
    setMobilePane('list')
    pushToast({ tone: 'info', title: 'Conversation deleted', description: `${subject} is gone from the portal.` })
    setConfirmDeleteThread(null)
  }

  const sendReply = () => {
    if (!activeThread || !reply.trim()) return
    sendThreadMessage(activeThread.id, {
      from: 'admin',
      authorName: user?.name ?? "Auntie's Tykes",
      body: reply.trim(),
    })
    setReply('')
    // The reply moves this conversation into this week. Follow it there and keep
    // it open, rather than letting it vanish from an earlier week's list.
    setActiveThreadId(activeThread.id)
    if (!searchingThreads) setThreadWeek(thisWeek)
    pushToast({ title: 'Reply sent', description: `${familyName(activeThread.familyId)} will see it in their portal.` })
  }

  return (
    <PageTransition>
      <PageHeader
        title="Messages & Announcements"
        description="Announcements go to every family. A message is a conversation with one family, and either of you can start it."
        actions={
          <>
            <Button variant="outline" onClick={() => setComposeOpen(true)}>
              <Plus size={16} /> New message
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Megaphone size={16} /> New announcement
            </Button>
          </>
        }
      />

      <div className="mb-6">
        <Tabs
          tabs={[
            { value: 'threads', label: 'Messages', count: thisWeekThreadCount },
            { value: 'announcements', label: 'Announcements', count: thisWeekAnnouncementCount },
          ]}
          value={tab}
          onChange={(v) => setTab(v as 'announcements' | 'threads')}
        />
      </div>

      {tab === 'threads' && sortedThreads.length > 0 && (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {searchingThreads ? (
            <p className="text-sm text-slate-500">
              Searching every week · {shownThreads.length} found
            </p>
          ) : (
            <WeekPicker
              week={threadWeek}
              thisWeek={thisWeek}
              weeks={threadWeeks}
              onChange={setThreadWeek}
              noun={['conversation', 'conversations']}
              newWeeks={unreadThreadWeeks}
            />
          )}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={threadQuery}
              onChange={(e) => setThreadQuery(e.target.value)}
              placeholder="Search all weeks…"
              className="w-full pl-9 sm:w-64"
              aria-label="Search messages"
            />
          </div>
        </div>
      )}

      {tab === 'announcements' && sortedAnnouncements.length > 0 && (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {searchingAnnouncements ? (
            <p className="text-sm text-slate-500">
              Searching every week · {shownAnnouncements.length} found
            </p>
          ) : (
            <WeekPicker
              week={week}
              thisWeek={thisWeek}
              weeks={announcementWeeks}
              onChange={setWeek}
              noun={['post', 'posts']}
            />
          )}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={announcementQuery}
              onChange={(e) => setAnnouncementQuery(e.target.value)}
              placeholder="Search all weeks…"
              className="w-full pl-9 sm:w-64"
              aria-label="Search announcements"
            />
          </div>
        </div>
      )}

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
        ) : shownAnnouncements.length === 0 ? (
          searchingAnnouncements ? (
            <EmptyState
              icon={Search}
              title="Nothing matches that search"
              description="Search looks through every week's announcements — titles, messages and attachments."
              action={
                <Button variant="outline" onClick={() => setAnnouncementQuery('')}>
                  Clear search
                </Button>
              }
            />
          ) : week === thisWeek ? (
            <EmptyState
              icon={CalendarDays}
              title="A fresh week"
              description="Nothing posted yet this week. Earlier weeks are one step back with the arrow, or search finds anything."
              action={
                <Button onClick={() => setOpen(true)}>
                  <Plus size={16} /> New announcement
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="Nothing posted that week"
              description="Step to another week, or search to find an announcement by what it said."
              action={
                <Button variant="outline" onClick={() => setWeek(thisWeek)}>
                  Back to this week
                </Button>
              }
            />
          )
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {shownAnnouncements.map((a, i) => (
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
                    <div className="flex flex-wrap items-center gap-1.5">
                      {searchingAnnouncements && a.week && (
                        <Badge tone="neutral">
                          <CalendarDays size={12} /> {weekLabel(a.week, thisWeek)}
                        </Badge>
                      )}
                      <Badge tone={a.audience === 'all' ? 'blue' : 'violet'}>
                        <Users size={12} /> {a.audience === 'all' ? 'All families' : familyName(a.audience)}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDelete(a)}
                        aria-label={`Delete announcement ${a.title}`}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                  <div className="md px-5 py-4 text-sm">
                    <ReactMarkdown>{a.body}</ReactMarkdown>
                  </div>
                  {a.attachmentStoragePath && (
                    <div className="border-t border-slate-100 px-5 py-3">
                      {/* A photo shows as a thumbnail; anything else keeps the download button. */}
                      {a.attachmentFileName && isInlineImage(a.attachmentFileName) ? (
                        <AttachmentPhoto
                          attachment={{
                            storagePath: a.attachmentStoragePath,
                            fileName: a.attachmentFileName,
                            size: a.attachmentSize ?? 0,
                          }}
                        />
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => onDownloadAttachment(a)}>
                          <Paperclip size={14} /> {a.attachmentFileName ?? 'Attachment'}
                          {typeof a.attachmentSize === 'number' && (
                            <span className="text-slate-400">· {bytes(a.attachmentSize)}</span>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              </motion.div>
            ))}
          </div>
        )
      ) : sortedThreads.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No messages yet"
          description="Start a conversation with a family, or wait for one to write in."
          action={
            <Button onClick={() => setComposeOpen(true)}>
              <Plus size={16} /> New message
            </Button>
          }
        />
      ) : shownThreads.length === 0 ? (
        searchingThreads ? (
          <EmptyState
            icon={Search}
            title="Nothing matches that search"
            description="Search looks through every week's conversations — subjects, families and every message."
            action={
              <Button variant="outline" onClick={() => setThreadQuery('')}>
                Clear search
              </Button>
            }
          />
        ) : threadWeek === thisWeek ? (
          <EmptyState
            icon={CalendarDays}
            title="A fresh week"
            description={
              unreadThreadWeeks.size > 0
                ? 'No conversations this week yet — but an earlier week has a message you have not read. It is marked New in the week list.'
                : 'No conversations this week yet. Earlier weeks are one step back with the arrow, or search finds anything.'
            }
            action={
              <Button onClick={() => setComposeOpen(true)}>
                <Plus size={16} /> New message
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="No conversations that week"
            description="Step to another week, or search to find a conversation by what it said."
            action={
              <Button variant="outline" onClick={() => setThreadWeek(thisWeek)}>
                Back to this week
              </Button>
            }
          />
        )
      ) : (
        <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
          <Card className={cx('overflow-hidden', mobilePane === 'thread' && 'hidden lg:block')}>
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="font-display text-sm font-bold text-slate-900">Conversations</h2>
            </div>
            <ul className="divide-y divide-slate-100">
              {shownThreads.map((t) => {
                const isActive = activeThread?.id === t.id
                const last = t.messages[t.messages.length - 1]
                const unread = hasUnread(t)
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => {
                        setActiveThreadId(t.id)
                        setMobilePane('thread')
                      }}
                      className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition ${
                        isActive ? 'bg-[#3F8570]/8' : 'hover:bg-slate-50'
                      }`}
                    >
                      <Avatar name={familyName(t.familyId)} size="sm" hue="from-[#F5B942] to-[#D98B9B]" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate font-display text-sm font-bold text-slate-900">{t.subject}</span>
                          {unread && <Badge tone="violet">New</Badge>}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {familyName(t.familyId)}
                          {searchingThreads && t.week ? ` · ${weekLabel(t.week, thisWeek)}` : ''}
                        </span>
                        {last && <span className="mt-0.5 block truncate text-xs text-slate-400">{last.body}</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>

          {activeThread && (
            <Card className={cx('flex flex-col overflow-hidden', mobilePane === 'list' && 'hidden lg:flex')}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <button
                  onClick={() => setMobilePane('list')}
                  className="inline-flex min-h-[2.75rem] w-full items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-[#3F8570] lg:hidden"
                >
                  <ArrowLeft size={16} /> Conversations
                </button>
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">{activeThread.subject}</h2>
                  <p className="text-xs text-slate-500">
                    {familyName(activeThread.familyId)} · updated {fmtDate(activeThread.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge tone="neutral">
                    <MessageSquare size={12} /> {activeThread.messages.length}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmDeleteThread(activeThread)}
                    aria-label={`Delete conversation ${activeThread.subject}`}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
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
                        hue={mine ? 'from-[#3F8570] to-[#D98B9B]' : 'from-[#F5B942] to-[#F9D28A]'}
                      />
                      <div className={`max-w-[80%] ${mine ? 'text-right' : ''}`}>
                        <p className="text-xs font-semibold text-slate-500">
                          {m.authorName} · {fmtDate(m.at)}
                        </p>
                        <p
                          className={`mt-1 inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            mine ? 'bg-[#3F8570] text-white' : 'bg-slate-100 text-slate-800'
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
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        title="New message"
        description="Goes to one family as a conversation they can reply to."
        footer={
          <>
            <Button variant="ghost" onClick={() => setComposeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={startConversation}>
              <Send size={16} /> Send message
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="To" error={threadErrors.family}>
            <Select value={toFamily} onChange={(e) => setToFamily(e.target.value)} invalid={Boolean(threadErrors.family)}>
              <option value="">Choose a family…</option>
              {families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subject" error={threadErrors.subject}>
            <Input
              value={threadSubject}
              invalid={Boolean(threadErrors.subject)}
              onChange={(e) => setThreadSubject(e.target.value)}
              placeholder="Thursday pickup"
            />
          </Field>
          <Field label="Message" error={threadErrors.body}>
            <Textarea
              rows={6}
              value={threadBody}
              invalid={Boolean(threadErrors.body)}
              onChange={(e) => setThreadBody(e.target.value)}
              placeholder="Just a heads up that we're heading to the park Thursday morning — sunscreen would help!"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(confirmDeleteThread)}
        onClose={() => setConfirmDeleteThread(null)}
        title="Delete this conversation?"
        description={confirmDeleteThread?.subject}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDeleteThread(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={doDeleteThread}>
              <Trash2 size={16} /> Delete
            </Button>
          </>
        }
      >
        <Card className="bg-rose-50/60 p-4 text-sm text-rose-900">
          {confirmDeleteThread
            ? `All ${String(confirmDeleteThread.messages.length)} message${confirmDeleteThread.messages.length === 1 ? '' : 's'} in it, yours and ${familyName(confirmDeleteThread.familyId)}’s, are deleted, and they lose the conversation from their portal immediately.`
            : ''}{' '}
          This cannot be undone.
        </Card>
      </Modal>

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Delete this announcement?"
        description={confirmDelete?.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={doDeleteAnnouncement}>
              <Trash2 size={16} /> Delete
            </Button>
          </>
        }
      >
        <Card className="bg-rose-50/60 p-4 text-sm text-rose-900">
          {confirmDelete?.audience === 'all'
            ? 'Every family will immediately lose it from their portal.'
            : `${confirmDelete ? familyName(confirmDelete.audience) : 'The family'} will immediately lose it from their portal.`}
          {confirmDelete?.attachmentStoragePath ? ' Its attached file is deleted too.' : ''} This cannot be undone.
        </Card>
      </Modal>

      <Modal
        open={open}
        onClose={closeAnnouncementModal}
        wide
        title="New announcement"
        description="Markdown works here — use **bold**, lists, and short paragraphs."
        footer={
          <>
            <Button variant="ghost" onClick={closeAnnouncementModal}>
              Cancel
            </Button>
            <Button onClick={publish} disabled={uploading}>
              <Megaphone size={16} /> {uploading ? 'Waiting for the upload…' : 'Post announcement'}
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
          {/* A div, not <Field>: Field is a <label>, and a tap on a label fires its first button — here, Remove. */}
          <div>
            <p className="mb-1.5 text-sm font-semibold text-slate-700">Attachment (optional)</p>
            {attachment ? (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                {isInlineImage(attachment.fileName) ? (
                  <AttachmentPhoto attachment={attachment} showName={false} />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <Paperclip size={16} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{attachment.fileName}</p>
                  <p className="text-xs text-slate-500">{bytes(attachment.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={removeAttachment}
                  className="inline-flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center sm:min-h-0 sm:min-w-0 rounded-full p-1 text-slate-400 hover:bg-slate-100"
                  aria-label="Remove attachment"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <FileUploader
                // Keyed to the draft so a new announcement starts with an empty
                // uploader instead of the last one's queue.
                key={draftId}
                prefix="admin"
                label="Attach a flyer, form, or order sheet"
                onUploaded={onAttachmentUploaded}
                onError={onAttachmentError}
                onBusyChange={onAttachmentBusy}
              />
            )}
          </div>
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

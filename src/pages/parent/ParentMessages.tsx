import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { Megaphone, MessageSquare, Paperclip, Send, Plus, Users, Inbox, ArrowLeft, Search, CalendarDays } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
import WeekPicker from '../../components/WeekPicker'
import { useStore } from '../../store/useStore'
import { useFamilyScope } from '../../lib/useFamilyScope'
import { DAYCARE_TIME_ZONE, bytes, cx, fmtDate, nowISO, todayISO, uid } from '../../lib/helpers'
import { weekOf, weekStartOf, weeksWithItems } from '../../lib/weeks'
import { usePortalWeekText } from '../../lib/usePortalWeekText'
import { downloadDocument, isInlineImage } from '../../lib/storage'
import { AttachmentPhoto } from '../../components/DailyLogCard'
import { useSectionSeen } from '../../lib/unread'
import type { Thread } from '../../types'

interface NewThreadErrors {
  subject?: string
  body?: string
}

export default function ParentMessages() {
  const { t } = useTranslation()
  const { user, familyId, family, announcements } = useFamilyScope()
  const allThreads = useStore((s) => s.threads)
  const sendThreadMessage = useStore((s) => s.sendThreadMessage)
  const startThread = useStore((s) => s.startThread)
  const pushToast = useStore((s) => s.pushToast)
  const seen = useSectionSeen('messages')
  // `t` is shadowed by the thread loop variable below, so read this up here.
  const newLabel = t('common.new')

  /**
   * Both tabs start fresh every Monday: they open on this week (Mon–Sun,
   * Eastern) and show everything from the whole week so far. Earlier weeks are
   * one step back, and search looks across every week. Nothing is deleted.
   *
   * A conversation belongs to the week of its latest message, so when Auntie
   * Melissa replies to an older conversation it comes back into this week with
   * its New pill. An announcement belongs to the week it was posted.
   */
  const thisWeek = weekStartOf(todayISO()) ?? todayISO()

  const threads = useMemo(
    () =>
      allThreads
        .filter((t) => t.familyId === familyId)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .map((t) => ({ ...t, week: weekOf(t.updatedAt, DAYCARE_TIME_ZONE) })),
    [allThreads, familyId],
  )
  const [threadWeek, setThreadWeek] = useState(thisWeek)
  const [threadQuery, setThreadQuery] = useState('')
  const searchingThreads = threadQuery.trim() !== ''
  const threadWeeks = useMemo(() => weeksWithItems(threads.map((t) => t.week), thisWeek), [threads, thisWeek])
  const shownThreads = useMemo(() => {
    const q = threadQuery.trim().toLowerCase()
    if (!q) return threads.filter((t) => t.week === threadWeek)
    return threads.filter((t) =>
      `${t.subject} ${t.messages.map((m) => `${m.authorName} ${m.body}`).join(' ')}`.toLowerCase().includes(q),
    )
  }, [threads, threadQuery, threadWeek])
  /** A reply from Auntie's Tykes this parent has not seen yet — the list's New pill. */
  const hasUnread = (thread: Thread) => thread.messages.some((m) => m.from === 'admin' && seen.isNew(m.at))
  const unreadThreadWeeks = new Set(threads.flatMap((t) => (t.week !== null && hasUnread(t) ? [t.week] : [])))
  const thisWeekThreadCount = threadWeeks.find((w) => w.start === thisWeek)?.count ?? 0

  const datedAnnouncements = useMemo(
    () => announcements.map((a) => ({ ...a, week: weekOf(a.date, DAYCARE_TIME_ZONE) })),
    [announcements],
  )
  const [announcementWeek, setAnnouncementWeek] = useState(thisWeek)
  const [announcementQuery, setAnnouncementQuery] = useState('')
  const searchingAnnouncements = announcementQuery.trim() !== ''
  const announcementWeeks = useMemo(
    () => weeksWithItems(datedAnnouncements.map((a) => a.week), thisWeek),
    [datedAnnouncements, thisWeek],
  )
  const shownAnnouncements = useMemo(() => {
    const q = announcementQuery.trim().toLowerCase()
    if (!q) return datedAnnouncements.filter((a) => a.week === announcementWeek)
    return datedAnnouncements.filter((a) =>
      `${a.title} ${a.body} ${a.attachmentFileName ?? ''}`.toLowerCase().includes(q),
    )
  }, [datedAnnouncements, announcementQuery, announcementWeek])
  const unreadAnnouncementWeeks = new Set(
    datedAnnouncements.flatMap((a) => (a.week !== null && seen.isNew(a.date) ? [a.week] : [])),
  )
  const thisWeekAnnouncementCount = announcementWeeks.find((w) => w.start === thisWeek)?.count ?? 0

  const conversationWeekText = usePortalWeekText(thisWeek, 'messages.conversationCount')
  const announcementWeekText = usePortalWeekText(thisWeek, 'messages.announcementCount')

  const [tab, setTab] = useState<'announcements' | 'threads'>('threads')
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  /**
   * Below lg the list and thread stack and the thread lands off the fold, so on
   * phones they take turns. activeThread falls back to threads[0], so which pane
   * shows cannot be derived from it or the list would never be reachable.
   */
  const [mobilePane, setMobilePane] = useState<'list' | 'thread'>('list')
  const [reply, setReply] = useState('')
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [errors, setErrors] = useState<NewThreadErrors>({})

  const activeThread = shownThreads.find((t) => t.id === activeThreadId) ?? shownThreads[0]
  const authorName = user?.name ?? family?.primaryContact ?? 'Parent'

  const onDownloadAttachment = (storagePath: string, fileName?: string) => {
    void downloadDocument(storagePath, fileName).catch(() => {
      pushToast({ tone: 'error', title: t('messages.attachmentError') })
    })
  }

  const sendReply = () => {
    if (!activeThread || !reply.trim()) return
    sendThreadMessage(activeThread.id, { from: 'parent', authorName, body: reply.trim() })
    setReply('')
    // The reply moves this conversation into this week. Follow it there and keep
    // it open, rather than letting it vanish from an earlier week's list.
    setActiveThreadId(activeThread.id)
    if (!searchingThreads) setThreadWeek(thisWeek)
    pushToast({ title: t('messages.toastSentTitle'), description: t('messages.toastReplySentDesc') })
  }

  const createThread = () => {
    const next: NewThreadErrors = {}
    if (!subject.trim()) next.subject = t('messages.subjectError')
    if (body.trim().length < 5) next.body = t('messages.bodyError')
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
          at: nowISO(),
          body: body.trim(),
        },
      ],
    })
    setOpen(false)
    setSubject('')
    setBody('')
    setErrors({})
    setTab('threads')
    // A new conversation belongs to this week; bring them back to it.
    setThreadWeek(thisWeek)
    setThreadQuery('')
    setActiveThreadId(null)
    pushToast({ title: t('messages.toastSentTitle'), description: t('messages.toastNewThreadDesc') })
  }

  return (
    <PageTransition>
      <PageHeader
        title={t('messages.title')}
        description={t('messages.description')}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> {t('messages.newMessage')}
          </Button>
        }
      />

      <div className="mb-6">
        <Tabs
          tabs={[
            { value: 'threads', label: t('messages.tabConversations'), count: thisWeekThreadCount },
            { value: 'announcements', label: t('messages.tabAnnouncements'), count: thisWeekAnnouncementCount },
          ]}
          value={tab}
          onChange={(v) => setTab(v as 'announcements' | 'threads')}
        />
      </div>

      {tab === 'threads' && threads.length > 0 && (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {searchingThreads ? (
            <p className="text-sm text-slate-500">{t('messages.searchingAll', { count: shownThreads.length })}</p>
          ) : (
            <WeekPicker
              week={threadWeek}
              thisWeek={thisWeek}
              weeks={threadWeeks}
              onChange={setThreadWeek}
              text={conversationWeekText}
              newWeeks={unreadThreadWeeks}
            />
          )}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={threadQuery}
              onChange={(e) => setThreadQuery(e.target.value)}
              placeholder={t('messages.searchPlaceholder')}
              className="w-full pl-9 sm:w-64"
              aria-label={t('messages.searchConversationsAria')}
            />
          </div>
        </div>
      )}

      {tab === 'announcements' && announcements.length > 0 && (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {searchingAnnouncements ? (
            <p className="text-sm text-slate-500">{t('messages.searchingAll', { count: shownAnnouncements.length })}</p>
          ) : (
            <WeekPicker
              week={announcementWeek}
              thisWeek={thisWeek}
              weeks={announcementWeeks}
              onChange={setAnnouncementWeek}
              text={announcementWeekText}
              newWeeks={unreadAnnouncementWeeks}
            />
          )}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={announcementQuery}
              onChange={(e) => setAnnouncementQuery(e.target.value)}
              placeholder={t('messages.searchPlaceholder')}
              className="w-full pl-9 sm:w-64"
              aria-label={t('messages.searchAnnouncementsAria')}
            />
          </div>
        </div>
      )}

      {tab === 'announcements' ? (
        announcements.length === 0 ? (
          <EmptyState icon={Megaphone} title={t('messages.noAnnouncementsTitle')} description={t('messages.noAnnouncementsDesc')} />
        ) : shownAnnouncements.length === 0 ? (
          searchingAnnouncements ? (
            <EmptyState
              icon={Search}
              title={t('messages.noMatchTitle')}
              description={t('messages.noMatchAnnouncementsDesc')}
              action={
                <Button variant="outline" onClick={() => setAnnouncementQuery('')}>
                  {t('messages.clearSearch')}
                </Button>
              }
            />
          ) : announcementWeek === thisWeek ? (
            <EmptyState
              icon={CalendarDays}
              title={t('messages.freshWeekTitle')}
              description={
                unreadAnnouncementWeeks.size > 0 ? t('messages.earlierUnreadDesc') : t('messages.freshAnnouncementsDesc')
              }
            />
          ) : (
            <EmptyState
              icon={CalendarDays}
              title={t('messages.emptyAnnouncementsWeekTitle')}
              description={t('messages.emptyWeekDesc')}
              action={
                <Button variant="outline" onClick={() => setAnnouncementWeek(thisWeek)}>
                  {t('weeks.backToThisWeek')}
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
                transition={{ delay: Math.min(i * 0.06, 0.35) }}
              >
                <Card hover className="h-full overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-[#FDF1DC] px-5 py-4">
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-bold text-slate-900">{a.title}</h3>
                      <p className="mt-0.5 text-xs text-slate-500">{fmtDate(a.date, 'EEEE, MMMM d')}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {searchingAnnouncements && a.week && (
                        <Badge tone="neutral">
                          <CalendarDays size={12} /> {announcementWeekText.label(a.week)}
                        </Badge>
                      )}
                      {seen.isNew(a.date) && <Badge tone="green">{t('common.new')}</Badge>}
                      {a.audience !== 'all' && (
                        <Badge tone="violet">
                          <Users size={12} /> {t('messages.justForYou')}
                        </Badge>
                      )}
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
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onDownloadAttachment(a.attachmentStoragePath ?? '', a.attachmentFileName)}
                        >
                          <Paperclip size={14} /> {a.attachmentFileName ?? t('messages.attachment')}
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
      ) : threads.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={t('messages.noConversationsTitle')}
          description={t('messages.noConversationsDesc')}
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} /> {t('messages.writeMessage')}
            </Button>
          }
        />
      ) : shownThreads.length === 0 ? (
        searchingThreads ? (
          <EmptyState
            icon={Search}
            title={t('messages.noMatchTitle')}
            description={t('messages.noMatchConversationsDesc')}
            action={
              <Button variant="outline" onClick={() => setThreadQuery('')}>
                {t('messages.clearSearch')}
              </Button>
            }
          />
        ) : threadWeek === thisWeek ? (
          <EmptyState
            icon={CalendarDays}
            title={t('messages.freshWeekTitle')}
            description={unreadThreadWeeks.size > 0 ? t('messages.earlierUnreadDesc') : t('messages.freshConversationsDesc')}
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus size={16} /> {t('messages.writeMessage')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={CalendarDays}
            title={t('messages.emptyConversationsWeekTitle')}
            description={t('messages.emptyWeekDesc')}
            action={
              <Button variant="outline" onClick={() => setThreadWeek(thisWeek)}>
                {t('weeks.backToThisWeek')}
              </Button>
            }
          />
        )
      ) : (
        <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
          <Card className={cx('overflow-hidden', mobilePane === 'thread' && 'hidden lg:block')}>
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="font-display text-sm font-bold text-slate-900">{t('messages.yourConversations')}</h2>
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
                      className={`w-full px-4 py-3.5 text-left transition ${isActive ? 'bg-[#3F8570]/8' : 'hover:bg-slate-50'}`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-display text-sm font-bold text-slate-900">{t.subject}</span>
                        {unread && <Badge tone="violet">{newLabel}</Badge>}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {fmtDate(t.updatedAt)}
                        {searchingThreads && t.week ? ` · ${conversationWeekText.label(t.week)}` : ''}
                      </span>
                      {last && <span className="mt-0.5 block truncate text-xs text-slate-400">{last.body}</span>}
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
                  <ArrowLeft size={16} /> {t('messages.backToMessages')}
                </button>
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">{activeThread.subject}</h2>
                  <p className="text-xs text-slate-500">{t('messages.updated', { date: fmtDate(activeThread.updatedAt) })}</p>
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
                        hue={mine ? 'from-[#F5B942] to-[#D98B9B]' : 'from-[#3F8570] to-[#D98B9B]'}
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
                    placeholder={t('messages.replyPlaceholder')}
                    aria-label={t('messages.replyPlaceholder')}
                  />
                  <Button onClick={sendReply} disabled={!reply.trim()}>
                    <Send size={16} /> {t('messages.send')}
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
        title={t('messages.modalTitle')}
        description={t('messages.modalDescription')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('messages.cancel')}
            </Button>
            <Button onClick={createThread}>
              <Send size={16} /> {t('messages.sendMessage')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('messages.subject')} error={errors.subject}>
            <Input
              value={subject}
              invalid={Boolean(errors.subject)}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('messages.subjectPlaceholder')}
            />
          </Field>
          <Field label={t('messages.message')} error={errors.body}>
            <Textarea
              rows={6}
              value={body}
              invalid={Boolean(errors.body)}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('messages.messagePlaceholder')}
            />
          </Field>
        </div>
      </Modal>
    </PageTransition>
  )
}

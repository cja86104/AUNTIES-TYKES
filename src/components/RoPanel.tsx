import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Loader2,
  Mic,
  Send,
  Sparkles,
  Square,
  Volume2,
  X,
} from 'lucide-react'
import { Badge } from './ui'
import { cx } from '../lib/helpers'
import { useStore } from '../store/useStore'
import { useBodyScrollLock } from '../lib/useBodyScrollLock'
import {
  canRecord,
  fetchSpeech,
  pickRecordingMimeType,
  RoError,
  transcribeRecording,
  type RoDraft,
  type RoNotice,
  type RoToolRun,
} from '../lib/ro'
import { useRoSession, type RoMessage } from '../lib/roSession'

/**
 * Ro's console presence — plan §11.
 *
 * A persistent control in the admin header opening a slide-over, not a route:
 * Melissa is mid-task on whatever page she is on when she needs Ro, and a route
 * switch throws that context away for nothing. The panel is meant to be glanced
 * at and dismissed, which is also why it is not a full page — a destination page
 * invites being built like one, and that fights the co-worker framing in §4.
 *
 * Phase 1 drafts and never sends, so every draft below renders as a preview with
 * a copy button and says plainly that nothing left the building. The confirmation
 * UI that replaces it in Phase 2 goes exactly here.
 */

/* -------------------------------- draft card ------------------------------- */

function field(draft: Record<string, unknown>, key: string): string {
  const value = draft[key]
  return typeof value === 'string' ? value : ''
}

function DraftCard({ entry }: { entry: RoDraft }) {
  const [copied, setCopied] = useState(false)
  const body = field(entry.draft, 'body')
  const subject = field(entry.draft, 'subject') || field(entry.draft, 'title')
  const to = field(entry.draft, 'familyName') || field(entry.draft, 'audience')
  const recipients = entry.draft.recipientCount

  const copy = () => {
    const text = subject.length > 0 ? `${subject}\n\n${body}` : body
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
      },
      () => setCopied(false),
    )
  }

  return (
    <div className="mt-3 rounded-card border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge tone="amber">Draft — not sent</Badge>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-chip px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        >
          {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.75} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {to.length > 0 && (
        <p className="text-xs font-semibold text-slate-500">
          To: {to}
          {typeof recipients === 'number' && recipients > 1 ? ` (${String(recipients)} families)` : ''}
        </p>
      )}
      {subject.length > 0 && <p className="mt-1 text-sm font-bold text-slate-900">{subject}</p>}
      {body.length > 0 && (
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{body}</p>
      )}
      <p className="mt-2.5 border-t border-slate-100 pt-2 text-xs text-slate-500">
        Nothing has been sent. Copy it into Messages to send it yourself — Ro sending for you comes
        later.
      </p>
    </div>
  )
}

/* ------------------------------ activity feed ------------------------------ */

const priorityTone = { high: 'rose', medium: 'amber', low: 'blue' } as const

function Activity({ runs, notices }: { runs: RoToolRun[]; notices: RoNotice[] }) {
  const [open, setOpen] = useState(false)
  if (runs.length === 0 && notices.length === 0) return null

  return (
    <div className="mt-2.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-slate-800"
      >
        <ChevronDown size={14} strokeWidth={2} className={cx('transition', open && 'rotate-180')} />
        {runs.length > 0 ? `${String(runs.length)} lookup${runs.length === 1 ? '' : 's'}` : 'Details'}
        {notices.length > 0 ? ` · ${String(notices.length)} flagged` : ''}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-card bg-slate-50 p-2.5">
          {runs.map((run, index) => (
            <p key={`${run.name}-${String(index)}`} className="text-xs text-slate-600">
              <span className="font-semibold text-slate-800">{run.name}</span>
              {run.ok ? '' : ` — failed: ${run.error ?? 'unknown'}`}
            </p>
          ))}
          {notices.map((notice) => (
            <p key={notice.key} className="flex items-start gap-1.5 text-xs text-slate-600">
              <Badge tone={priorityTone[notice.priority]}>{notice.priority}</Badge>
              <span className="pt-0.5">{notice.summary}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------ narrow viewport ---------------------------- */

/**
 * True on a phone-width screen.
 *
 * Decides whether the panel behaves as a modal. On a phone it is full-width and
 * necessarily covers the app, so it takes a backdrop and locks the page behind
 * it. On a wider screen it must NOT: Ro stays open until Melissa closes her, and
 * a backdrop over the console she is trying to use would make the app
 * unclickable while Ro is open.
 */
function useNarrowViewport(): boolean {
  const query = '(max-width: 639px)'
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setNarrow(event.matches)
    media.addEventListener('change', onChange)
    setNarrow(media.matches)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return narrow
}

/* --------------------------------- panel ---------------------------------- */

export interface RoAssistantProps {
  /** Called when the panel opens, so the shell can close its own overlays. */
  onOpen?: () => void
}

export default function RoAssistant({ onOpen }: RoAssistantProps) {
  const pushToast = useStore((s) => s.pushToast)

  // Conversation state lives in the store, not here: App.tsx remounts this whole
  // subtree on every navigation (see roSession.ts), and the thread has to
  // survive that. Only what is genuinely tied to this mount stays local — the
  // microphone, the meter, the audio element.
  const open = useRoSession((s) => s.open)
  const setOpen = useRoSession((s) => s.setOpen)
  const input = useRoSession((s) => s.input)
  const setInput = useRoSession((s) => s.setInput)
  const messages = useRoSession((s) => s.messages)
  const busy = useRoSession((s) => s.busy)
  const send = useRoSession((s) => s.send)
  const clear = useRoSession((s) => s.clear)
  const status = useRoSession((s) => s.status)
  const statusProblem = useRoSession((s) => s.statusProblem)
  const statusChecked = useRoSession((s) => s.statusChecked)
  const ensureStatus = useRoSession((s) => s.ensureStatus)

  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  /** 0–1 input level, so she can see the mic is picking her up. */
  const [level, setLevel] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [speakingId, setSpeakingId] = useState<string | null>(null)

  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const meterRef = useRef<{ context: AudioContext; frame: number } | null>(null)
  const tickRef = useRef<number | null>(null)

  const narrow = useNarrowViewport()
  // Only a phone-width panel freezes the page behind it. On a wider screen the
  // console stays usable with Ro open, which is the whole point of her staying.
  useBodyScrollLock(open && narrow)

  useEffect(() => {
    ensureStatus()
  }, [ensureStatus])

  // Release the microphone and any playing audio when this mount goes away.
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      audioRef.current?.pause()
      if (audioUrlRef.current !== null) URL.revokeObjectURL(audioUrlRef.current)
      if (meterRef.current !== null) {
        cancelAnimationFrame(meterRef.current.frame)
        void meterRef.current.context.close()
      }
      if (tickRef.current !== null) window.clearInterval(tickRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Keep the newest message in view, including right after a remount.
  useEffect(() => {
    const node = scrollRef.current
    if (node !== null) node.scrollTop = node.scrollHeight
  }, [messages, busy, open])

  const stopMeter = useCallback(() => {
    if (meterRef.current !== null) {
      cancelAnimationFrame(meterRef.current.frame)
      void meterRef.current.context.close()
      meterRef.current = null
    }
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
    setLevel(0)
  }, [])

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop()
    setRecording(false)
    stopMeter()
  }, [stopMeter])

  /**
   * Watches the input level with a Web Audio analyser.
   *
   * Measurement of the local stream, not speech recognition — §9's ban is on
   * browser speech APIs and there is no `webkitSpeechRecognition` here. It exists
   * because transcription only happens after the recorder stops, so without it a
   * working recording and a dead microphone look identical.
   */
  const startMeter = useCallback((stream: MediaStream) => {
    try {
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      context.createMediaStreamSource(stream).connect(analyser)
      const samples = new Uint8Array(analyser.frequencyBinCount)
      const read = () => {
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) {
          const centred = (sample - 128) / 128
          sum += centred * centred
        }
        setLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4))
        if (meterRef.current !== null) meterRef.current.frame = requestAnimationFrame(read)
      }
      meterRef.current = { context, frame: requestAnimationFrame(read) }
    } catch {
      setLevel(0)
    }
  }, [])

  const startRecording = useCallback(async () => {
    const mimeType = pickRecordingMimeType()
    if (mimeType === null) {
      pushToast({ tone: 'error', title: 'This browser cannot record audio' })
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        stopMeter()
        const blob = new Blob(chunksRef.current, { type: mimeType })
        chunksRef.current = []
        setTranscribing(true)
        transcribeRecording(blob)
          .then((text) => {
            // Into the box rather than straight out: §9 says treat the transcript
            // as if she had typed it, and typed text waits for send. One tap to
            // fix a misheard name beats answering the wrong question.
            const current = useRoSession.getState().input
            setInput(current.length > 0 ? `${current} ${text}` : text)
            inputRef.current?.focus()
          })
          .catch((cause: unknown) => {
            pushToast({
              tone: 'error',
              title: cause instanceof RoError ? cause.message : 'Could not transcribe that',
            })
          })
          .finally(() => setTranscribing(false))
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
      setSeconds(0)
      tickRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000)
      startMeter(stream)
    } catch {
      pushToast({
        tone: 'error',
        title: 'Microphone blocked',
        description: 'Allow microphone access for this site, then try again.',
      })
    }
  }, [pushToast, setInput, startMeter, stopMeter])

  /** Tap to listen. Never autoplay — §11, and every browser's gesture rule. */
  const listen = useCallback(
    async (message: RoMessage) => {
      if (speakingId === message.id) {
        audioRef.current?.pause()
        setSpeakingId(null)
        return
      }
      audioRef.current?.pause()
      if (audioUrlRef.current !== null) {
        URL.revokeObjectURL(audioUrlRef.current)
        audioUrlRef.current = null
      }
      setSpeakingId(message.id)
      try {
        const url = await fetchSpeech(message.content)
        audioUrlRef.current = url
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onended = () => setSpeakingId(null)
        await audio.play()
      } catch (cause) {
        setSpeakingId(null)
        pushToast({
          tone: 'error',
          title: cause instanceof RoError ? cause.message : 'Could not play that',
        })
      }
    },
    [speakingId, pushToast],
  )

  // Hidden only when Ro is deliberately switched off. A failed status call or a
  // broken server config leaves the control visible, because the panel can then
  // explain why — hiding it in those cases looks identical to the feature not
  // existing, which is how a missing env var went unnoticed once already.
  const deliberatelyOff = status !== null && !status.enabled && status.misconfigured !== true
  if (!statusChecked || deliberatelyOff) return null

  const unreachable = statusProblem !== null
  const voiceIn = status?.voice.input === true && canRecord()
  const voiceOut = status?.voice.output === true

  return (
    <>
      <button
        onClick={() => {
          onOpen?.()
          setOpen(true)
        }}
        className={cx(
          'inline-flex min-h-[2.75rem] items-center gap-2 rounded-control border px-3 text-sm font-semibold transition sm:min-h-0 sm:py-2',
          open
            ? 'border-brand bg-brand-tint text-brand'
            : 'border-slate-300 text-slate-600 hover:border-brand hover:text-brand',
        )}
        aria-label="Ask Ro"
        aria-expanded={open}
      >
        <Sparkles size={20} strokeWidth={1.75} />
        <span className="hidden sm:inline">Ro</span>
        {messages.length > 0 && !open && (
          <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand px-1.5 text-xs font-bold text-white">
            {messages.filter((message) => message.role === 'assistant').length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Phone only. On a wider screen there is no backdrop at all, so the
                console stays clickable with Ro open — she stays until Melissa
                closes her, and a blocking overlay would make that unusable. */}
            {narrow && (
              <motion.div
                className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm sm:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setOpen(false)}
              />
            )}
            <motion.aside
              role="dialog"
              // Modal on a phone, where it covers everything; not modal on a wider
              // screen, where the app behind it stays in use.
              aria-modal={narrow}
              aria-label="Ro, your operations partner"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-slate-200 bg-canvas shadow-raised sm:w-[26rem]"
            >
              <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
                    <Sparkles size={20} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className="block font-display text-sm font-extrabold text-slate-900">Ro</span>
                    <span className="block truncate text-xs text-slate-500">
                      Reads and drafts — never sends
                    </span>
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {messages.length > 0 && (
                    <button
                      onClick={clear}
                      className="rounded-chip px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                      title="Start a new conversation"
                    >
                      New
                    </button>
                  )}
                  <button
                    onClick={() => setOpen(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-control text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                    aria-label="Close"
                  >
                    <X size={20} strokeWidth={1.75} />
                  </button>
                </div>
              </header>

              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
                {unreachable && (
                  <div className="mb-4 flex items-start gap-2.5 rounded-card border border-amber-200 bg-amber-50 p-3">
                    <AlertTriangle size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-amber-600" />
                    <p className="text-sm leading-relaxed text-amber-900">{statusProblem}</p>
                  </div>
                )}

                {messages.length === 0 && !unreachable && (
                  <div className="py-6 text-center">
                    <p className="text-sm font-semibold text-slate-700">Ask me anything about today.</p>
                    <p className="mx-auto mt-1.5 max-w-[17rem] text-sm leading-relaxed text-slate-500">
                      Who is checked in, what is overdue, who is waiting on a reply. I can draft a
                      message too — you send it.
                    </p>
                  </div>
                )}

                <div className="space-y-4">
                  {messages.map((message) =>
                    message.role === 'user' ? (
                      <div key={message.id} className="flex justify-end">
                        <p className="max-w-[85%] whitespace-pre-wrap rounded-card rounded-br-sm bg-brand px-3.5 py-2.5 text-sm leading-relaxed text-white">
                          {message.content}
                        </p>
                      </div>
                    ) : (
                      <div key={message.id}>
                        <div className="rounded-card rounded-bl-sm bg-white px-3.5 py-2.5 shadow-card">
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                            {message.content}
                          </p>
                          {voiceOut && message.content.length > 0 && (
                            <button
                              onClick={() => void listen(message)}
                              className="mt-2 inline-flex items-center gap-1.5 rounded-chip px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                            >
                              {speakingId === message.id ? (
                                <Square size={14} strokeWidth={2} />
                              ) : (
                                <Volume2 size={14} strokeWidth={1.75} />
                              )}
                              {speakingId === message.id ? 'Stop' : 'Listen'}
                            </button>
                          )}
                        </div>
                        {(message.drafts ?? []).map((draft, index) => (
                          <DraftCard key={`${message.id}-draft-${String(index)}`} entry={draft} />
                        ))}
                        <Activity runs={message.toolRuns ?? []} notices={message.notices ?? []} />
                      </div>
                    ),
                  )}
                  {busy && (
                    <p className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 size={16} strokeWidth={2} className="animate-spin" /> Thinking…
                    </p>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-200 bg-white px-3 py-3">
                {(recording || transcribing) && (
                  <div className="mb-2.5 flex items-center gap-3 rounded-control bg-slate-50 px-3 py-2">
                    {recording ? (
                      <>
                        <span className="flex h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-rose-500" />
                        <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-slate-700">
                          {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, '0')}
                        </span>
                        {/* Proof the microphone is live. Transcription only happens
                            after Stop, so without this a good recording and a dead
                            mic look exactly the same. */}
                        <span className="flex flex-1 items-end gap-[3px]" aria-hidden="true">
                          {Array.from({ length: 14 }, (_, index) => {
                            const lit = level * 14 > index
                            return (
                              <span
                                key={index}
                                className={cx(
                                  'w-full rounded-sm transition-all duration-75',
                                  lit ? 'bg-brand' : 'bg-slate-200',
                                )}
                                style={{ height: lit ? `${String(6 + index)}px` : '4px' }}
                              />
                            )
                          })}
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-slate-500">
                          Tap ■ when done
                        </span>
                      </>
                    ) : (
                      <>
                        <Loader2 size={16} strokeWidth={2} className="shrink-0 animate-spin text-brand" />
                        <span className="text-xs font-semibold text-slate-600">
                          Typing out what you said…
                        </span>
                      </>
                    )}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  {voiceIn && (
                    <button
                      onClick={() => (recording ? stopRecording() : void startRecording())}
                      disabled={transcribing || busy}
                      className={cx(
                        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border transition disabled:opacity-50',
                        recording
                          ? 'border-rose-300 bg-rose-50 text-rose-600'
                          : 'border-slate-300 text-slate-600 hover:border-brand hover:text-brand',
                      )}
                      aria-label={recording ? 'Stop recording' : 'Record a question'}
                    >
                      {transcribing ? (
                        <Loader2 size={20} strokeWidth={2} className="animate-spin" />
                      ) : recording ? (
                        <Square size={18} strokeWidth={2} />
                      ) : (
                        <Mic size={20} strokeWidth={1.75} />
                      )}
                    </button>
                  )}
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      // Enter sends, Shift+Enter makes a new line.
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        void send(input)
                      }
                    }}
                    rows={1}
                    placeholder={
                      recording
                        ? 'Recording — your words appear when you tap ■'
                        : transcribing
                          ? 'One moment…'
                          : 'Ask Ro…'
                    }
                    className="max-h-32 min-h-[2.75rem] w-full resize-none rounded-control border border-slate-300 px-3 py-2.5 text-sm leading-relaxed text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
                  />
                  <button
                    onClick={() => void send(input)}
                    disabled={busy || input.trim().length === 0}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-brand text-white shadow-control transition hover:bg-brand-deep disabled:opacity-40"
                    aria-label="Send"
                  >
                    <Send size={18} strokeWidth={2} />
                  </button>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

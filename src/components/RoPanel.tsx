import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  Mic,
  Send,
  Sparkles,
  Square,
  Undo2,
  Volume2,
  X,
} from 'lucide-react'
import { Badge } from './ui'
import { cx } from '../lib/helpers'
import { useStore } from '../store/useStore'
import { useBodyScrollLock } from '../lib/useBodyScrollLock'
import {
  canRecord,
  pickRecordingMimeType,
  RoError,
  speechFor,
  transcribeRecording,
  type RoAction,
  type RoDraft,
  type RoNotice,
  type RoToolRun,
} from '../lib/ro'
import { useRoSession, type RoDecision, type RoMessage } from '../lib/roSession'

/**
 * Ro's console presence — plan §11.
 *
 * A persistent control in the admin header opening a slide-over, not a route:
 * Melissa is mid-task on whatever page she is on when she needs Ro, and a route
 * switch throws that context away for nothing. The panel is meant to be glanced
 * at and dismissed, which is also why it is not a full page — a destination page
 * invites being built like one, and that fights the co-worker framing in §4.
 *
 * Two different cards can hang off one of her replies, and the difference between
 * them is the whole of §7:
 *
 *  - A DRAFT is wording. Nothing behind it can run, because no send tool exists
 *    yet, so it renders with a copy button and says so.
 *  - An ACTION is prepared and waiting. Its arguments are already stored
 *    server-side, and the button runs exactly them. Approving is the only path to
 *    that write — the tool that proposed it has none.
 */

/**
 * 50ms of silence, for unlocking audio playback on iOS.
 *
 * Safari will only start audio from inside a user gesture, and it judges that by
 * the call stack, not by whether a tap happened recently. The reply's audio may
 * still be generating when she taps, and once the tap handler has awaited
 * anything the gesture is over and `play()` is refused. The way through is to
 * play something — anything — synchronously on the tap, because once an element
 * has played inside a gesture iOS will let that same element play again later.
 *
 * So: one audio element for the whole panel, primed with this on the first tap,
 * then re-pointed at each reply. 8-bit PCM silence is 128, not 0.
 */
const SILENT_WAV =
  'data:audio/wav;base64,' +
  'UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICA'

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
        Not sent — copy it into Messages for now. An Approve &amp; send button lands here once the
        send tool is built.
      </p>
    </div>
  )
}

/* ------------------------------- action card ------------------------------- */

/**
 * One prepared action, with the tap that runs it.
 *
 * The decision lives in the session store rather than here (see roSession.ts):
 * this component is remounted on every navigation, and a card that forgot she had
 * approved something would offer to run it twice.
 *
 * Nothing about the action is sent back up except its id — the wording below is a
 * rendering of what the server already stored, not the payload. So there is no
 * version of this card that can approve something other than what it displays.
 */
/** Seconds left on an undo window, or 0 when there isn't one. */
function undoSecondsLeft(until: string | null): number {
  if (until === null) return 0
  return Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 1000))
}

/**
 * Ticks down an undo window once a second, and stops at zero.
 *
 * The countdown is the whole point of showing it: "Undo" with no clock invites
 * her to assume it is still there, and §8's window is short. The interval is tied
 * to the deadline rather than to a mount, so it survives this card being
 * remounted by a navigation with the right number still on it.
 */
function useUndoCountdown(until: string | null): number {
  const [left, setLeft] = useState(() => undoSecondsLeft(until))
  useEffect(() => {
    setLeft(undoSecondsLeft(until))
    if (until === null) return
    const id = window.setInterval(() => {
      const next = undoSecondsLeft(until)
      setLeft(next)
      if (next <= 0) window.clearInterval(id)
    }, 1000)
    return () => window.clearInterval(id)
  }, [until])
  return left
}

function ActionCard({ action }: { action: RoAction }) {
  // An id with no entry is pending. Annotated because this project does not enable
  // noUncheckedIndexedAccess, so the index signature would otherwise claim every
  // lookup succeeds and make the pending branch below unreachable.
  const decision: RoDecision | undefined = useRoSession((s) => s.decisions[action.id])
  const decide = useRoSession((s) => s.decide)
  const state: 'pending' | RoDecision['state'] =
    decision === undefined ? 'pending' : decision.state
  const detail = decision === undefined ? '' : decision.detail

  const undoLeft = useUndoCountdown(decision?.undoUntil ?? null)
  const problem = decision?.problem ?? ''

  // A parent login's password, typed here at the tap. Card-local on purpose: it
  // goes out with the approval and is kept nowhere else — not in useRoSession,
  // not in the message, not sent to Ro. It stays only so "Copy login details"
  // can work afterwards, and is gone when this card unmounts.
  const secretSpec = action.secret
  const [secret, setSecret] = useState('')
  const [reveal, setReveal] = useState(false)
  const [copied, setCopied] = useState(false)
  const secretShort = secretSpec !== undefined && secret.trim().length < secretSpec.minLength
  const approve = () => void decide(action.id, 'approve', secretSpec === undefined ? undefined : secret)
  const decline = () => {
    setSecret('')
    void decide(action.id, 'decline')
  }

  /** The same text the console's account dialog copies. */
  const copyLogin = () => {
    if (secretSpec === undefined) return
    const text = [
      `Parent login for the ${secretSpec.share.familyName}`,
      `Email: ${secretSpec.share.email}`,
      `Password: ${secret.trim()}`,
      '',
      'Please keep these somewhere safe and change the password after signing in.',
    ].join('\n')
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
      },
      () => setCopied(false),
    )
  }

  const settled = state === 'done' || state === 'declined' || state === 'undone'
  const tone =
    state === 'done' ? 'green' : state === 'failed' ? 'rose' : state === 'undone' ? 'neutral' : 'amber'
  const label =
    state === 'done'
      ? 'Done'
      : state === 'declined'
        ? 'Dismissed'
        : state === 'undone'
          ? 'Pulled back'
          : state === 'failed'
            ? "Didn't go through"
            : 'Waiting on you'

  return (
    <div
      className={cx(
        'mt-3 rounded-card border p-3',
        state === 'done'
          ? 'border-emerald-200 bg-emerald-50/60'
          : state === 'failed'
            ? 'border-rose-200 bg-rose-50/60'
            : state === 'declined' || state === 'undone'
              ? 'border-slate-200 bg-slate-50'
              : 'border-sunny bg-white',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge tone={tone}>{label}</Badge>
        <span className="text-xs font-semibold text-slate-500">{action.title}</span>
      </div>

      <p className="text-sm font-bold leading-snug text-slate-900">{action.summary}</p>

      {action.detail.length > 0 && !settled && (
        <dl className="mt-2.5 space-y-1.5 border-t border-slate-100 pt-2.5">
          {action.detail.map((row) => (
            <div key={row.label} className="flex gap-2 text-xs leading-relaxed">
              <dt className="w-[5.5rem] shrink-0 font-semibold text-slate-500">{row.label}</dt>
              <dd className="min-w-0 flex-1 whitespace-pre-wrap text-slate-700">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {secretSpec !== undefined && (state === 'pending' || state === 'failed') && (
        <label className="mt-3 block">
          <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <KeyRound size={13} strokeWidth={2} /> {secretSpec.label}
          </span>
          <span className="relative block">
            {/* text-base below sm: iOS Safari zooms the page on any focused field
                under 16px and does not zoom back out — same as the message box. */}
            <input
              type={reveal ? 'text' : 'password'}
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              maxLength={secretSpec.maxLength}
              placeholder={`At least ${String(secretSpec.minLength)} characters`}
              className="min-h-[2.75rem] w-full rounded-control border border-slate-300 py-2 pl-3 pr-11 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15 sm:text-sm"
            />
            <button
              type="button"
              onClick={() => setReveal((value) => !value)}
              aria-label={reveal ? 'Hide password' : 'Show password'}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-slate-500">
            Pick something you can tell them again — Ro never sees it, and it can't be looked up later.
          </span>
        </label>
      )}

      {state === 'pending' && (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={approve}
            disabled={secretShort}
            className="inline-flex min-h-[2.25rem] flex-1 items-center justify-center gap-1.5 rounded-control bg-brand px-3 text-sm font-semibold text-white shadow-control transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ShieldCheck size={16} strokeWidth={2} />
            {action.confirmLabel}
          </button>
          <button
            onClick={decline}
            className="inline-flex min-h-[2.25rem] items-center justify-center rounded-control border border-slate-300 px-3 text-sm font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
          >
            No thanks
          </button>
        </div>
      )}

      {state === 'working' && (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-600">
          <Loader2 size={16} strokeWidth={2} className="animate-spin" /> Doing it…
        </p>
      )}

      {state === 'done' && (
        <>
          <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-emerald-800">
            <Check size={14} strokeWidth={2.5} className="mt-0.5 shrink-0" />
            {detail.length > 0 ? detail : 'Saved.'}
          </p>
          {secretSpec !== undefined && secret.trim().length > 0 && (
            <button
              onClick={copyLogin}
              className="mt-2 inline-flex items-center gap-1.5 rounded-chip border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
            >
              {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.75} />}
              {copied ? 'Copied' : 'Copy login details'}
            </button>
          )}
          {undoLeft > 0 && (
            <button
              onClick={() => void decide(action.id, 'undo')}
              className="mt-2 inline-flex items-center gap-1.5 rounded-chip border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
            >
              <Undo2 size={14} strokeWidth={2} />
              Undo · {Math.floor(undoLeft / 60)}:{(undoLeft % 60).toString().padStart(2, '0')}
            </button>
          )}
          {problem.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-rose-800">
              <AlertTriangle size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
              {problem}
            </p>
          )}
        </>
      )}

      {state === 'undone' && (
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          {detail.length > 0 ? detail : 'Pulled back.'}
        </p>
      )}

      {state === 'declined' && (
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {detail.length > 0 ? detail : 'Dismissed. Nothing was changed.'}
        </p>
      )}

      {state === 'failed' && (
        <>
          <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-rose-800">
            <AlertTriangle size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
            {detail}
          </p>
          <button
            onClick={approve}
            disabled={secretShort}
            className="mt-2 rounded-chip px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Try again
          </button>
        </>
      )}
    </div>
  )
}

/* -------------------------------- warnings -------------------------------- */

/**
 * Things that went wrong behind a reply that still came back.
 *
 * These were collected server-side from the first turn and then rendered
 * nowhere, which is how "No reply after 4 rounds" — the actual explanation for a
 * failed turn — reached the browser and was thrown away. A warning channel with
 * no display is worse than no channel: it reads as working.
 *
 * Kept small and below the reply, because most of these are survivable: a watcher
 * that could not run, a tier that was unavailable and got covered by the backup.
 * She should be able to see them without being alarmed by them.
 */
function Warnings({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="mt-2 space-y-1">
      {items.map((item, index) => (
        <p
          key={`${String(index)}-${item.slice(0, 24)}`}
          className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-500"
        >
          <AlertTriangle size={13} strokeWidth={1.75} className="mt-0.5 shrink-0 text-sunny-ink" />
          {item}
        </p>
      ))}
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
  const meterRef = useRef<{ context: AudioContext; frame: number } | null>(null)
  /**
   * Whether the microphone ever actually picked anything up this recording, and
   * whether the meter was running well enough to know.
   *
   * Silence is what makes Whisper invent text — it answers a quiet clip with
   * subtitle boilerplate ("Thank you", sometimes in Chinese). The cheapest fix is
   * not to send silence. `meterRan` matters because the meter is best-effort: if
   * it failed to start, "heard nothing" means nothing, and the clip must be sent.
   */
  const heardRef = useRef(false)
  const meterRanRef = useRef(false)
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
      // Pause only. The clip URLs belong to the speech cache in ro.ts, which
      // outlives this mount so a page change does not throw ready audio away.
      audioRef.current?.pause()
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

  // Desktop only. On a phone, focusing on open throws the keyboard up over half
  // the panel before she has read anything, and — until the size fix above — took
  // the page zoomed in with it. She taps the box when she wants to type.
  useEffect(() => {
    if (open && !narrow) inputRef.current?.focus()
  }, [open, narrow])

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
        const level = Math.min(1, Math.sqrt(sum / samples.length) * 4)
        // Comfortably above room tone, comfortably below speech.
        if (level > 0.08) heardRef.current = true
        setLevel(level)
        if (meterRef.current !== null) meterRef.current.frame = requestAnimationFrame(read)
      }
      meterRef.current = { context, frame: requestAnimationFrame(read) }
      meterRanRef.current = true
    } catch {
      // Without a meter there is no way to know whether anything was said, so the
      // silence guard below must not fire.
      meterRanRef.current = false
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

        if (meterRanRef.current && !heardRef.current) {
          // Nothing was said. Sending it anyway is how "Thank you." ends up in
          // the box in front of whatever she types next.
          pushToast({
            tone: 'info',
            title: "I didn't hear anything",
            description: 'Tap the mic and speak, or type it instead.',
          })
          return
        }

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
      heardRef.current = false
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

  /**
   * Tap to listen. Never autoplay — §11, and every browser's gesture rule.
   *
   * The audio itself is normally already generated by the time she taps — the
   * effect below starts it the moment a reply arrives — so this usually just
   * plays it. If it is still on its way, the tap waits for that same request
   * rather than starting a second one.
   *
   * Everything before the first `await` runs inside the tap, and that is load
   * bearing on iOS: one shared element is created and primed with silence there,
   * so it is already allowed to play by the time the real audio arrives several
   * seconds later. Creating `new Audio(url)` after the fetch — which is what this
   * did — produces an element that has never played inside a gesture, and Safari
   * refuses it every time. Desktop Chrome allows it, which is why this worked
   * everywhere except the phone.
   */
  const listen = useCallback(
    async (message: RoMessage) => {
      if (speakingId === message.id) {
        audioRef.current?.pause()
        setSpeakingId(null)
        return
      }

      // ---- synchronous: still inside the tap ----
      let audio = audioRef.current
      if (audio === null) {
        audio = new Audio()
        audioRef.current = audio
      }
      audio.pause()
      // Cleared before the primer: otherwise the 50ms of silence ends, fires the
      // handler, and wipes the playing state while the real audio is still being
      // fetched — the Stop button would flick back to Listen on its own.
      audio.onended = null
      audio.src = SILENT_WAV
      // Primed on every tap rather than once behind a flag. It is inaudible and
      // costs nothing, and the flag had a failure mode: changing `src` while this
      // play() is pending rejects it with AbortError, which is not a real failure
      // but would have latched the flag off.
      //
      // Not awaited — what matters is that play() is CALLED inside the gesture,
      // not that it finished before we move on.
      void audio.play().catch(() => {})
      // ---- the gesture ends here ----

      setSpeakingId(message.id)

      try {
        const { url, trimmed } = await speechFor(message.id, message.content)
        audio.onended = () => setSpeakingId(null)
        audio.src = url
        await audio.play()
        if (trimmed) {
          pushToast({
            tone: 'info',
            title: 'Reading the first part',
            description: 'That reply was too long to read out in full.',
          })
        }
      } catch (cause) {
        setSpeakingId(null)
        // A blocked autoplay and a failed request both land here and need
        // opposite responses from her, so they are not reported as one thing.
        const blocked = cause instanceof DOMException && cause.name === 'NotAllowedError'
        pushToast({
          tone: 'error',
          title: blocked
            ? 'Your phone blocked the playback'
            : cause instanceof RoError
              ? cause.message
              : 'Could not play that',
          description: blocked ? 'Tap Listen once more — it should play this time.' : undefined,
        })
      }
    },
    [speakingId, pushToast],
  )

  const voiceOut = status?.voice.output === true
  const latest: RoMessage | undefined = messages[messages.length - 1]

  /**
   * Starts generating the newest reply's audio as soon as it arrives.
   *
   * Speech is slow to produce — the server waits for the whole clip, and a phone
   * downloads all of it before playing — and starting that only on the Listen
   * tap left her sitting through all of it. Generating ahead is not playback:
   * nothing is heard until she taps (§11), so the iOS gesture rule is untouched.
   *
   * Newest reply only, and only while voice output is on. `speechFor` shares one
   * request per reply, so a remount or a tap that lands mid-generation never
   * pays for the same audio twice. A failure here is silent on purpose: she has
   * not asked for anything yet, and her tap retries it and reports any error.
   */
  useEffect(() => {
    if (!voiceOut || latest === undefined) return
    if (latest.role !== 'assistant' || latest.content.length === 0) return
    void speechFor(latest.id, latest.content).catch(() => undefined)
  }, [voiceOut, latest])

  // Hidden only when Ro is deliberately switched off. A failed status call or a
  // broken server config leaves the control visible, because the panel can then
  // explain why — hiding it in those cases looks identical to the feature not
  // existing, which is how a missing env var went unnoticed once already.
  const deliberatelyOff = status !== null && !status.enabled && status.misconfigured !== true
  if (!statusChecked || deliberatelyOff) return null

  const unreachable = statusProblem !== null
  const voiceIn = status?.voice.input === true && canRecord()

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
                      Nothing happens without your tap
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
                      Who is checked in, what is overdue, who is waiting on a reply. I can write a
                      message and send it once you&rsquo;ve read it.
                    </p>
                    <Link
                      to="/admin/ro-guide"
                      onClick={() => {
                        // On a phone the panel covers the page, so close it to show the guide.
                        if (narrow) setOpen(false)
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-chip px-2 py-1 text-sm font-semibold text-brand transition hover:bg-brand-tint"
                    >
                      <BookOpen size={16} strokeWidth={1.75} />
                      See everything I can do
                    </Link>
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
                        {(message.actions ?? []).map((action) => (
                          <ActionCard key={action.id} action={action} />
                        ))}
                        {(message.drafts ?? []).map((draft, index) => (
                          <DraftCard key={`${message.id}-draft-${String(index)}`} entry={draft} />
                        ))}
                        <Warnings items={message.warnings ?? []} />
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
                    // text-base below sm for the same reason `fieldBase` in ui.tsx
                    // has it: iOS Safari force-zooms the page whenever a focused
                    // field computes under 16px, and it does not zoom back out.
                    // This box was a raw textarea and missed that convention.
                    className="max-h-32 min-h-[2.75rem] w-full resize-none rounded-control border border-slate-300 px-3 py-2.5 text-base leading-relaxed text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15 sm:text-sm"
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

import { supabase } from './supabase'

/**
 * The browser half of Ro — plan §11.
 *
 * Every call carries the owner's own access token, the same pattern
 * `createParentLogin` in persist.ts already uses: the serverless function holds
 * the OpenRouter key and verifies the caller is an admin, so nothing about Ro
 * needs a key in the bundle.
 *
 * One case gets explicit handling because it is the normal local-dev experience:
 * `npm run dev` is Vite alone, and Vite does not serve `/api/*`. A request for
 * the chat endpoint there comes back as the SPA's index.html — a 200 with HTML
 * in it — so `response.json()` would throw something unreadable. `apiUnavailable`
 * distinguishes that from a real failure, and the panel says which it was.
 */

export interface RoStatus {
  enabled: boolean
  /** True when the server could not read its own configuration. */
  misconfigured?: boolean
  name?: string
  reason?: string
  voice: { input: boolean; output: boolean }
  canSend?: boolean
}

export interface RoDraft {
  tool: string
  draft: Record<string, unknown>
}

/**
 * An action Ro has prepared and is waiting on a tap for — plan §7.
 *
 * The arguments are already stored server-side against `id`, so approving this
 * runs exactly what `summary` and `detail` describe. Nothing here is sent back up
 * except the id and the decision, which is what makes the preview trustworthy:
 * the browser cannot alter what it is approving.
 */
export interface RoAction {
  id: string
  /** The tool that proposed it, e.g. `rule.save`. */
  kind: string
  title: string
  summary: string
  detail: { label: string; value: string }[]
  confirmLabel: string
}

export interface RoActionResult {
  outcome: 'executed' | 'declined' | 'failed' | 'undone'
  summary: string
  error: string
  /** When the undo option lapses, for the actions that have one. */
  undoUntil: string | null
}

export interface RoToolRun {
  name: string
  tier: string | null
  ok: boolean
  arguments: string
  error?: string
}

export interface RoNotice {
  kind: string
  priority: 'low' | 'medium' | 'high'
  key: string
  summary: string
}

export interface RoReply {
  reply: string
  model: string
  tier: string
  escalated: boolean
  drafts: RoDraft[]
  actions: RoAction[]
  toolRuns: RoToolRun[]
  notices: RoNotice[]
  quietHours: boolean
  warnings: string[]
}

export interface RoTurn {
  role: 'user' | 'assistant'
  content: string
}

/** Thrown for every failure the panel shows; `apiUnavailable` picks the wording. */
export class RoError extends Error {
  readonly apiUnavailable: boolean
  readonly status: number

  constructor(message: string, options: { apiUnavailable?: boolean; status?: number } = {}) {
    super(message)
    this.name = 'RoError'
    this.apiUnavailable = options.apiUnavailable ?? false
    this.status = options.status ?? 0
  }
}

const DEV_SERVER_HINT =
  "Ro's server functions aren't reachable. `npm run dev` serves the app but not " +
  '`/api/*` — use `vercel dev` instead, or try this on the deployed site.'

/**
 * Turns a non-JSON response into a message that says which of three different
 * problems it is.
 *
 * They are easy to confuse and were confused here: all three produce a body that
 * is not JSON, so reporting them identically as "not running" hid a crashed
 * function behind a dev-server message. The status code separates them —
 * 5xx is Vercel's HTML error page for a function that threw, 404 is nothing
 * deployed at that path, and a 200 carrying HTML is Vite's SPA fallback.
 */
function nonJsonError(path: string, status: number): RoError {
  if (status >= 500) {
    return new RoError(
      `Ro's server function crashed (HTTP ${String(status)} at ${path}). This is a server ` +
        'error, not a missing endpoint — check the Vercel function logs. A missing ' +
        'environment variable is the usual cause: every AI_MODEL_* value, ' +
        'OPENROUTER_API_KEY and SUPABASE_SERVICE_ROLE_KEY have to be set in the Vercel ' +
        'project, not just in .env.local, which is never deployed.',
      { status },
    )
  }
  if (status === 404) {
    return new RoError(
      `Nothing answered at ${path} (404). In local dev that means \`npm run dev\` instead ` +
        'of `vercel dev`. On a deployed site it means the function did not ship — check ' +
        "the deployment's Functions list.",
      { apiUnavailable: true, status },
    )
  }
  return new RoError(DEV_SERVER_HINT, { apiUnavailable: true, status })
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token === undefined) throw new RoError('Your session has expired — sign in again.')
  return { Authorization: `Bearer ${token}` }
}

/**
 * Reads a JSON body, or reports that the endpoint isn't a JSON API.
 *
 * Checked by content type rather than by parsing and catching: Vite's fallback
 * returns a perfectly valid 200, so the status code alone cannot tell these apart.
 */
async function readJson(response: Response, path: string): Promise<unknown> {
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) throw nonJsonError(path, response.status)
  try {
    return (await response.json()) as unknown
  } catch {
    throw new RoError('The server sent a reply I could not read.', { status: response.status })
  }
}

function errorFrom(body: unknown, status: number): RoError {
  if (typeof body === 'object' && body !== null) {
    const message = (body as Record<string, unknown>).error
    if (typeof message === 'string' && message.length > 0) return new RoError(message, { status })
  }
  return new RoError(`Something went wrong (${String(status)}).`, { status })
}

/** Is Ro switched on, and what can she do? Called once when the console mounts. */
export async function fetchRoStatus(): Promise<RoStatus> {
  let response: Response
  try {
    response = await fetch('/api/ai/status', { headers: await authHeader() })
  } catch {
    throw new RoError(DEV_SERVER_HINT, { apiUnavailable: true })
  }

  // A 404 is the other shape the dev server takes, depending on the route.

  const body = await readJson(response, '/api/ai/status')
  if (!response.ok) throw errorFrom(body, response.status)

  const record = body as Record<string, unknown>
  const voice = (record.voice ?? {}) as Record<string, unknown>
  return {
    enabled: record.enabled === true,
    misconfigured: record.misconfigured === true,
    name: typeof record.name === 'string' ? record.name : 'Ro',
    reason: typeof record.reason === 'string' ? record.reason : undefined,
    voice: { input: voice.input === true, output: voice.output === true },
    canSend: record.canSend === true,
  }
}

/**
 * Keeps a malformed action out of the panel.
 *
 * The server validates the same shape before sending it, so this is the second of
 * two checks rather than the only one — but a card without an id renders an
 * Approve button that cannot approve anything, and that is worth one guard on
 * each side of the wire.
 */
function isAction(action: RoAction): boolean {
  return (
    typeof action.id === 'string' &&
    action.id.length > 0 &&
    typeof action.summary === 'string' &&
    typeof action.confirmLabel === 'string' &&
    Array.isArray(action.detail)
  )
}

function readReply(body: unknown): RoReply {
  const record = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])
  return {
    reply: typeof record.reply === 'string' ? record.reply : '',
    model: typeof record.model === 'string' ? record.model : '',
    tier: typeof record.tier === 'string' ? record.tier : '',
    escalated: record.escalated === true,
    drafts: list<RoDraft>(record.drafts),
    actions: list<RoAction>(record.actions).filter(isAction),
    toolRuns: list<RoToolRun>(record.toolRuns),
    notices: list<RoNotice>(record.notices),
    quietHours: record.quietHours === true,
    warnings: list<string>(record.warnings),
  }
}

/** Sends one turn. History is trimmed server-side too; this keeps the body small. */
export async function askRo(message: string, history: RoTurn[]): Promise<RoReply> {
  let response: Response
  try {
    response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ message, history: history.slice(-20) }),
    })
  } catch {
    throw new RoError(DEV_SERVER_HINT, { apiUnavailable: true })
  }


  const body = await readJson(response, '/api/ai/chat')
  if (!response.ok) throw errorFrom(body, response.status)
  return readReply(body)
}

/**
 * Approves or dismisses one prepared action.
 *
 * Sends the id and the decision, and nothing else. The arguments live server-side
 * against that id, written before the preview was ever rendered, so there is no
 * way for a tampered-with or stale page to approve something other than what it
 * showed — §7's gate is only worth having if the thing approved and the thing run
 * are the same thing.
 *
 * A 409 comes back when the action was no longer hers to decide: already done,
 * already dismissed, or gone. That throws, and the panel shows why on the card.
 */
export async function confirmRoAction(
  proposalId: string,
  decision: 'approve' | 'decline' | 'undo',
): Promise<RoActionResult> {
  let response: Response
  try {
    response = await fetch('/api/ai/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ proposalId, decision }),
    })
  } catch {
    throw new RoError(DEV_SERVER_HINT, { apiUnavailable: true })
  }

  const body = await readJson(response, '/api/ai/confirm')
  if (!response.ok) throw errorFrom(body, response.status)

  const record = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const outcome = record.outcome
  const known = outcome === 'executed' || outcome === 'declined' || outcome === 'undone'
  return {
    // A failed undo comes back as `executed` WITH an error: the thing is still
    // sent, which is the outcome that matters, and the error says why it could
    // not be pulled back. Collapsing that into 'failed' would tell her the send
    // failed, which is the opposite of what happened.
    outcome: known ? outcome : 'failed',
    summary: typeof record.summary === 'string' ? record.summary : '',
    error: typeof record.error === 'string' ? record.error : '',
    undoUntil: typeof record.undoUntil === 'string' ? record.undoUntil : null,
  }
}

/* ---------------------------------- voice --------------------------------- */
/**
 * Plan §9, browser side. Two rules hold here and must keep holding:
 *
 *  - Never `webkitSpeechRecognition`, never `speechSynthesis()`. Recording goes
 *    to the server and comes back as text; text goes to the server and comes
 *    back as an audio file. That is what makes iOS Safari work, and it is not a
 *    preference.
 *  - Playback starts from a tap. §11 wants a tap-to-listen control per reply and
 *    no autoplay, which is also the user-gesture rule every browser enforces.
 *    Generating the audio is not playback, so that starts as soon as a reply
 *    arrives — see `speechFor`.
 */

/** What `MediaRecorder` produced, mapped to the formats the server accepts. */
const MIME_TO_FORMAT: { match: string; format: string }[] = [
  { match: 'webm', format: 'webm' },
  { match: 'ogg', format: 'ogg' },
  { match: 'mp4', format: 'm4a' },
  { match: 'm4a', format: 'm4a' },
  { match: 'aac', format: 'aac' },
  { match: 'mpeg', format: 'mp3' },
  { match: 'mp3', format: 'mp3' },
  { match: 'wav', format: 'wav' },
  { match: 'flac', format: 'flac' },
]

/**
 * Picks a recording mime type this browser actually supports.
 *
 * Safari records `audio/mp4`, Chrome and Firefox `audio/webm`. Asking for the
 * wrong one gives an empty or silent clip rather than an error, so the choice is
 * made from `isTypeSupported` instead of assumed.
 */
export function pickRecordingMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg']
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate
  }
  return null
}

/** True when this browser can record at all — the mic button hides otherwise. */
export function canRecord(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices !== undefined &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    pickRecordingMimeType() !== null
  )
}

function formatFor(mimeType: string): string {
  const lowered = mimeType.toLowerCase()
  const hit = MIME_TO_FORMAT.find((entry) => lowered.includes(entry.match))
  return hit?.format ?? 'webm'
}

/** Blob to raw base64, without the `data:` prefix the server rejects. */
async function toBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  // Chunked: spreading a multi-megabyte array into String.fromCharCode blows
  // the argument limit on a long recording.
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** Uploads a recording and returns what she said. */
export async function transcribeRecording(blob: Blob): Promise<string> {
  if (blob.size === 0) throw new RoError("That recording came through empty — I didn't catch anything.")

  const audio = await toBase64(blob)
  let response: Response
  try {
    response = await fetch('/api/ai/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ audio, format: formatFor(blob.type) }),
    })
  } catch {
    throw new RoError(DEV_SERVER_HINT, { apiUnavailable: true })
  }


  const body = await readJson(response, '/api/ai/transcribe')
  if (!response.ok) throw errorFrom(body, response.status)

  const text = (body as Record<string, unknown>).text
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new RoError("I couldn't make out any words in that.")
  }
  return text.trim()
}

/** A reply rendered as audio, ready to hand to an `<audio>` element. */
export interface RoSpeech {
  /** Object URL for the audio blob. Owned by the cache below — never revoke it. */
  url: string
  /**
   * Set when the reply was too long to speak in full and only the first part was
   * read. The panel tells her, because audio that stops early with no
   * explanation reads as a bug.
   */
  trimmed: boolean
}

/**
 * Fetches Ro's reply as audio and returns an object URL to play.
 *
 * Internal: go through `speechFor`, which owns the URL's lifetime.
 */
async function fetchSpeech(text: string): Promise<RoSpeech> {
  let response: Response
  try {
    response = await fetch('/api/ai/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ text }),
    })
  } catch {
    throw new RoError(DEV_SERVER_HINT, { apiUnavailable: true })
  }

  if (!response.ok) {
    // This endpoint answers with audio on success and JSON on failure.
    const body = await readJson(response, '/api/ai/speak')
    throw errorFrom(body, response.status)
  }

  const blob = await response.blob()
  if (blob.size === 0) throw new RoError('The audio came back empty.')
  return { url: URL.createObjectURL(blob), trimmed: response.headers.get('X-Ro-Trimmed') === '1' }
}

/**
 * Replies whose audio has been generated or is being generated, keyed by message
 * id, least recently used first.
 *
 * Why this exists: generating speech is the slow part of Listen — the server
 * waits for the whole clip before it answers, and a phone then downloads all of
 * it before playing. Started only on the tap, all of that was dead air. The panel
 * now calls `speechFor` the moment a reply arrives, so by the time she taps
 * Listen the audio is usually already here. Playback itself still starts only
 * from her tap (§11); only the generation moved earlier.
 *
 * Module scope rather than component state on purpose: `App.tsx` remounts the
 * panel on every navigation (see roSession.ts), and a cache inside the component
 * would be thrown away — and the same reply paid for again — every time she
 * changed page. A reload ends the conversation, and this with it.
 */
const speechCache = new Map<string, Promise<RoSpeech>>()

/**
 * How many clips are kept. Each is uncompressed WAV — about 48 KB per second of
 * speech, so up to ~4 MB for the longest reply the server will read — which on a
 * phone is worth bounding. Enough for the newest reply plus a few to replay.
 */
const SPEECH_CACHE_LIMIT = 4

/**
 * The audio for one reply, generating it if this is the first ask.
 *
 * Safe to call for a reply that is already in flight or done: both callers (the
 * prefetch when a reply lands, and the Listen tap) share one request. A failure
 * is dropped from the cache rather than kept, so the next tap tries again
 * instead of replaying the error.
 */
export function speechFor(messageId: string, text: string): Promise<RoSpeech> {
  const cached = speechCache.get(messageId)
  if (cached !== undefined) {
    // Re-inserted to mark it most recently used, so the clip she just tapped is
    // the last one to be evicted.
    speechCache.delete(messageId)
    speechCache.set(messageId, cached)
    return cached
  }

  const pending = fetchSpeech(text)
  speechCache.set(messageId, pending)
  void pending.catch(() => {
    if (speechCache.get(messageId) === pending) speechCache.delete(messageId)
  })

  while (speechCache.size > SPEECH_CACHE_LIMIT) {
    const oldest = speechCache.keys().next()
    if (oldest.done === true) break
    const evicted = speechCache.get(oldest.value)
    speechCache.delete(oldest.value)
    // Revoked once it settles — an in-flight clip has no URL yet to release.
    void evicted?.then(
      (speech) => URL.revokeObjectURL(speech.url),
      () => undefined,
    )
  }
  return pending
}

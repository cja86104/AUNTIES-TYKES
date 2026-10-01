/**
 * The one OpenRouter client.
 *
 * Plan §10: chat, transcription and speech all go through OpenRouter — one
 * provider, one key. This module owns that HTTP boundary so no handler builds
 * its own request, and so the tier fallback behaves identically everywhere.
 *
 * Tier fallback: `chat()` walks the tier's ordered model list from
 * `loadAiConfig()`. A model that is rate-limited, erroring or no longer listed
 * hands off to the next id in the list; a bad key stops immediately, because
 * retrying another model with the same credentials cannot help. The model that
 * actually answered comes back in the result, since §8's audit log has to record
 * which one it was rather than which one was asked for first.
 *
 * Nothing here throws. Every failure is a typed result a handler can turn into
 * a status code and a real message.
 */

import type { AiConfig, ModelTier } from './config.js'

const BASE_URL = 'https://openrouter.ai/api/v1'

/** A tool the model may call. `parameters` is a JSON Schema object. */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/**
 * Serializes straight to OpenRouter's message array. A tool-calling assistant
 * turn carries `content: null`, which is why content is nullable on that arm
 * only.
 */
export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface ChatRequest {
  messages: ChatMessage[]
  tools?: ToolDefinition[]
  /** 'auto' lets the model answer in prose; 'none' forbids tool calls. */
  toolChoice?: 'auto' | 'none' | 'required'
  temperature?: number
  maxTokens?: number
  /** Per-attempt budget. Each model in the tier list gets its own. */
  timeoutMs?: number
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface ChatSuccess {
  ok: true
  /** The model that actually answered, not the one asked for first. */
  model: string
  content: string
  toolCalls: ToolCall[]
  usage: TokenUsage | null
}

export interface AiFailure {
  ok: false
  /** Safe to show an admin: no key material, no raw provider payload. */
  error: string
  /** Suggested HTTP status for the caller to pass on. */
  status: number
  /** Every model tried, with why each one failed. For the server log. */
  attempts: AttemptLog[]
}

export interface AttemptLog {
  model: string
  status: number | null
  detail: string
}

export type ChatResult = ChatSuccess | AiFailure

/**
 * Room for a reply plus a round of tool-call arguments.
 *
 * Ro's prose is short by design, but a tool call carrying a drafted message body
 * is not, and a cut-off tool call is malformed JSON rather than a short answer.
 */
const DEFAULT_MAX_TOKENS = 2048

const DEFAULT_TIMEOUT_MS = 30_000

function headers(config: AiConfig): Record<string, string> {
  const built: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  }
  // OpenRouter's attribution headers. Reporting only; omitted when unset.
  if (config.siteUrl !== null) built['HTTP-Referer'] = config.siteUrl
  if (config.siteName !== null) built['X-Title'] = config.siteName
  return built
}

/** 401/403 mean the key is wrong or blocked. Another model will not fix it. */
function isFatal(status: number): boolean {
  return status === 401 || status === 403
}

/**
 * An auth rejection, reported with what OpenRouter actually said.
 *
 * 401 and 403 were originally collapsed into one message about the key being
 * rejected, which is wrong for 403: a 401 means the credential was not accepted
 * at all, while a 403 often means it WAS accepted and something else is refused —
 * a model the account cannot reach, a region block, a moderation refusal. One
 * message for both sends you looking at the wrong thing.
 */
function authFailure(
  status: number,
  detail: string,
  attempts: AttemptLog[],
  config: AiConfig,
): AiFailure {
  const cause =
    status === 401
      ? 'OpenRouter did not accept the API key (401). A rejected key cannot be ' +
        "attributed to an account, so a 401 will NOT appear in OpenRouter's activity " +
        'log — an empty log is expected here, not evidence the key is fine.'
      : 'OpenRouter accepted the key but refused the request (403). That is usually ' +
        'model access, a region restriction, or a moderation block — not the key itself.'
  return {
    ok: false,
    error: `${cause} It said: ${detail} [${describeKey(config.apiKey)}]`,
    status: 502,
    attempts,
  }
}

/**
 * Describes the configured key without revealing it.
 *
 * Length and prefix catch what actually goes wrong when a key moves from a local
 * file to a dashboard: quotes pasted around the value, a truncated copy, or a
 * different credential entirely. An OpenRouter inference key is `sk-or-v1-` plus
 * 64 characters, so 73 is expected and 75 almost always means the quotes came
 * along. No part of the key itself is included.
 */
function describeKey(key: string): string {
  const notes = [`key length ${String(key.length)}`, 'expected 73']
  notes.push(key.startsWith('sk-or-v1-') ? 'prefix ok' : 'prefix is NOT sk-or-v1-')
  if (!/^[A-Za-z0-9-]+$/.test(key)) notes.push('contains quotes or other unexpected characters')
  return notes.join(', ')
}

/**
 * Names a model together with the variable that set it.
 *
 * A model id alone is not actionable when four variables can hold one: the fix
 * is always "change variable X", so the message says X.
 */
function named(config: AiConfig, model: string): string {
  const source = config.modelSources[model]
  return source === undefined ? model : `${source} (${model})`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * `Array.isArray` narrows an `unknown` to `any[]`, which would hand `any` back
 * to every caller. This keeps the element type `unknown` so each entry still
 * has to be narrowed before it is read.
 */
function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

/**
 * Pulls a human-readable message out of an error body without trusting its
 * shape. OpenRouter answers `{ error: { message, code } }`; other proxies in
 * front of it may answer with something else entirely.
 */
function errorDetail(body: unknown, fallback: string): string {
  if (typeof body === 'string' && body.trim().length > 0) return body.trim().slice(0, 300)
  if (isRecord(body)) {
    const error = body.error
    if (typeof error === 'string' && error.trim().length > 0) return error.trim().slice(0, 300)
    if (isRecord(error) && typeof error.message === 'string' && error.message.length > 0) {
      // OpenRouter reports an upstream failure as the bare phrase "Provider
      // returned error" and puts the reason the provider actually gave in
      // metadata.raw. Reporting only the wrapper cost real diagnosis time once;
      // the useful half is pulled up here so the next one says what went wrong.
      const raw = isRecord(error.metadata) ? error.metadata.raw : undefined
      const provider = isRecord(error.metadata) ? error.metadata.provider_name : undefined
      const detail =
        typeof raw === 'string' && raw.trim().length > 0
          ? raw.trim()
          : isRecord(raw)
            ? JSON.stringify(raw)
            : ''
      const who = typeof provider === 'string' && provider.length > 0 ? ` [${provider}]` : ''
      if (detail.length > 0) return `${error.message}${who}: ${detail}`.slice(0, 400)
      return `${error.message}${who}`.slice(0, 300)
    }
    if (typeof body.message === 'string' && body.message.length > 0) {
      return body.message.slice(0, 300)
    }
  }
  return fallback
}

function readUsage(value: unknown): TokenUsage | null {
  if (!isRecord(value)) return null
  const prompt = value.prompt_tokens
  const completion = value.completion_tokens
  const total = value.total_tokens
  if (typeof prompt !== 'number' || typeof completion !== 'number') return null
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: typeof total === 'number' ? total : prompt + completion,
  }
}

function readToolCalls(value: unknown): ToolCall[] {
  if (!isArray(value)) return []
  const calls: ToolCall[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    const fn = entry.function
    if (!isRecord(fn)) continue
    const id = entry.id
    const name = fn.name
    const args = fn.arguments
    if (typeof id !== 'string' || typeof name !== 'string') continue
    calls.push({
      id,
      type: 'function',
      // Absent arguments mean a no-argument tool; '{}' keeps JSON.parse honest
      // at the call site instead of making every caller handle undefined.
      function: { name, arguments: typeof args === 'string' ? args : '{}' },
    })
  }
  return calls
}

/**
 * Narrows a successful completion body. Returns a string describing what was
 * wrong when the shape is not what a chat completion should look like — a
 * model that answers with nothing usable is a failure, not an empty reply.
 */
function readCompletion(body: unknown): { content: string; toolCalls: ToolCall[] } | string {
  if (!isRecord(body)) return 'the model returned a response that was not an object'
  const choices = body.choices
  if (!isArray(choices) || choices.length === 0) {
    return errorDetail(body, 'the model returned no choices')
  }
  const first = choices[0]
  if (!isRecord(first)) return 'the model returned a malformed choice'
  const message = first.message
  if (!isRecord(message)) return 'the model returned a choice with no message'
  const rawContent = message.content
  const content = typeof rawContent === 'string' ? rawContent : ''
  const toolCalls = readToolCalls(message.tool_calls)
  if (content.trim().length === 0 && toolCalls.length === 0) {
    return 'the model returned an empty reply'
  }
  return { content, toolCalls }
}

/** POSTs JSON with a per-attempt timeout. Network and abort both land here. */
async function postJson(
  url: string,
  config: AiConfig,
  payload: unknown,
  timeoutMs: number,
): Promise<{ status: number; body: unknown } | { status: null; detail: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: headers(config),
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const raw = await response.text()
    let body: unknown = raw
    if (raw.length > 0) {
      try {
        body = JSON.parse(raw)
      } catch {
        body = raw
      }
    }
    return { status: response.status, body }
  } catch (cause) {
    const aborted = controller.signal.aborted
    const detail = aborted
      ? `no response within ${Math.round(timeoutMs / 1000)}s`
      : cause instanceof Error
        ? cause.message
        : 'the request could not be sent'
    return { status: null, detail }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Sends a chat completion, walking the tier's model list until one answers.
 *
 * @param tier Which of plan §10's tiers to route to. The caller picks the tier;
 *             this module never decides that a job deserves a bigger model.
 */
export async function chat(
  config: AiConfig,
  tier: ModelTier,
  request: ChatRequest,
): Promise<ChatResult> {
  const models = config.models[tier]
  const attempts: AttemptLog[] = []
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS

  if (models.length === 0) {
    return {
      ok: false,
      error: `No model is configured for the ${tier} tier`,
      status: 500,
      attempts,
    }
  }

  for (const model of models) {
    const payload: Record<string, unknown> = {
      model,
      messages: request.messages,
      // Always sent, never conditional. Anthropic's API requires max_tokens on
      // every request, so omitting it made the escalation tier — and only the
      // escalation tier — fail with OpenRouter's generic "Provider returned
      // error", while the OpenAI-compatible tiers 0 and 1 were unaffected and
      // hid the problem. Escalation is rare, so this sat latent until a turn
      // actually needed it.
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
    }
    if (request.tools !== undefined && request.tools.length > 0) {
      payload.tools = request.tools
      payload.tool_choice = request.toolChoice ?? 'auto'
    }
    if (request.temperature !== undefined) payload.temperature = request.temperature

    // A pinned provider (config.ts: `<tier>_PROVIDER`) is sent with no
    // fallback, same reasoning as the TTS pin below: the point of pinning is
    // a specific provider's own numbers (Cerebras's throughput on
    // gpt-oss-120b, in the tier-0/1 case), so silently falling back to a
    // slower or costlier provider on a hiccup would defeat the pin. A model
    // with no entry keeps OpenRouter's own routing.
    const providerSlugs = config.chatProviders[model]
    if (providerSlugs !== undefined && providerSlugs.length > 0) {
      payload.provider = { only: providerSlugs, allow_fallbacks: false }
    }

    const result = await postJson(`${BASE_URL}/chat/completions`, config, payload, timeoutMs)

    if (result.status === null) {
      attempts.push({ model, status: null, detail: result.detail })
      continue
    }
    if (result.status >= 400) {
      const detail = errorDetail(result.body, `HTTP ${result.status}`)
      attempts.push({ model, status: result.status, detail })
      if (isFatal(result.status)) return authFailure(result.status, detail, attempts, config)
      continue
    }

    const completion = readCompletion(result.body)
    if (typeof completion === 'string') {
      attempts.push({ model, status: result.status, detail: completion })
      continue
    }

    return {
      ok: true,
      model,
      content: completion.content,
      toolCalls: completion.toolCalls,
      usage: readUsage(isRecord(result.body) ? result.body.usage : null),
    }
  }

  const last = attempts[attempts.length - 1]
  return {
    ok: false,
    error:
      last === undefined
        ? `The ${tier} tier could not be reached`
        : `The ${tier} tier could not be reached — ${named(config, last.model)}: ${last.detail}`,
    status: 502,
    attempts,
  }
}

/* ---------------------------------- audio --------------------------------- */
/**
 * Speech in both directions, plan §9.
 *
 * The architecture is chosen to be Safari-safe by construction: the server calls
 * the API and hands back text or an audio file, so neither direction touches
 * `webkitSpeechRecognition` or `speechSynthesis()`. Those are free and are
 * exactly the wrong choice — the first does not reliably open the microphone on
 * iOS Safari, the second has inconsistent voices there. Nothing in this module
 * or its callers may reach for them later.
 */

/**
 * Gemini TTS returns raw PCM and refuses mp3: "Gemini TTS only supports
 * response_format=\"pcm\"". That breaks §9's Safari reasoning as originally
 * written, because headerless PCM is not playable by an `<audio>` element —
 * there is no container for the browser to read a rate or bit depth from.
 *
 * The fix keeps the architecture and changes the container: ask for PCM, then put
 * a 44-byte RIFF/WAVE header on it here. WAV plays through a plain `<audio>`
 * element in every browser, Safari included, so the mechanism §9 depends on —
 * server produces a file, client plays it after a tap — is untouched. Only the
 * file type changed, mp3 to wav.
 *
 * These numbers are Google's own, not inferred: the Gemini speech docs specify
 * "headerless raw 16-bit signed little-endian linear PCM (audio/l16, 24 kHz,
 * mono)". A wrong value here does not fail loudly, it plays the voice at the
 * wrong speed, which is why each is written down with its source.
 */
const PCM_SAMPLE_RATE = 24_000
const PCM_CHANNELS = 1
const PCM_BITS_PER_SAMPLE = 16

/** Wraps raw little-endian PCM samples in a WAV container. */
export function wavFromPcm(
  pcm: Buffer,
  sampleRate = PCM_SAMPLE_RATE,
  channels = PCM_CHANNELS,
  bitsPerSample = PCM_BITS_PER_SAMPLE,
): Buffer {
  const blockAlign = (channels * bitsPerSample) / 8
  // Written into one allocation rather than concatenated: Buffer.concat's typing
  // disagrees with Buffer's own ArrayBufferLike in current @types/node, and a
  // single alloc plus copy is cheaper anyway.
  const out = Buffer.alloc(44 + pcm.byteLength)
  out.write('RIFF', 0, 'ascii')
  out.writeUInt32LE(36 + pcm.byteLength, 4)
  out.write('WAVE', 8, 'ascii')
  out.write('fmt ', 12, 'ascii')
  out.writeUInt32LE(16, 16) // fmt chunk length
  out.writeUInt16LE(1, 20) // 1 = uncompressed PCM
  out.writeUInt16LE(channels, 22)
  out.writeUInt32LE(sampleRate, 24)
  out.writeUInt32LE(sampleRate * blockAlign, 28) // byte rate
  out.writeUInt16LE(blockAlign, 32)
  out.writeUInt16LE(bitsPerSample, 34)
  out.write('data', 36, 'ascii')
  out.writeUInt32LE(pcm.byteLength, 40)
  // `set` rather than `copy`: both move the bytes, but copy's parameter type in
  // current @types/node is narrower than Buffer itself, and set takes an
  // ArrayLike<number> so it accepts a Buffer without a cast.
  out.set(pcm, 44)
  return out
}

/**
 * A response-size ceiling. PCM is uncompressed — 24 kHz 16-bit mono is 48 KB per
 * second — and a function response cannot be arbitrarily large, so a long reply
 * is refused before generation rather than truncated mid-sentence.
 */
const MAX_SPEECH_BYTES = 4_000_000

/** Formats OpenRouter's transcription endpoint documents. */
export const TRANSCRIBABLE_FORMATS = ['wav', 'mp3', 'flac', 'm4a', 'ogg', 'webm', 'aac'] as const
export type TranscribableFormat = (typeof TRANSCRIBABLE_FORMATS)[number]

export interface TranscriptionSuccess {
  ok: true
  model: string
  text: string
  /** Billed audio length, when the provider reports it. */
  seconds: number | null
}

export interface SpeechSuccess {
  ok: true
  model: string
  voice: string
  contentType: string
  audio: Buffer
}

/** POSTs and returns the raw body, for the endpoint that answers with audio. */
async function postForBinary(
  url: string,
  config: AiConfig,
  payload: unknown,
  timeoutMs: number,
): Promise<
  | { status: number; contentType: string; body: Buffer }
  | { status: number; errorBody: unknown }
  | { status: null; detail: string }
> {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: headers(config),
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!response.ok) {
      // An error from this endpoint is JSON even though success is not.
      const raw = await response.text()
      let parsed: unknown = raw
      try {
        parsed = JSON.parse(raw) as unknown
      } catch {
        parsed = raw
      }
      return { status: response.status, errorBody: parsed }
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    return {
      status: response.status,
      contentType: response.headers.get('content-type') ?? 'audio/mpeg',
      body: buffer,
    }
  } catch (cause) {
    const detail = controller.signal.aborted
      ? `no response within ${Math.round(timeoutMs / 1000)}s`
      : cause instanceof Error
        ? cause.message
        : 'the request could not be sent'
    return { status: null, detail }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Her voice to text.
 *
 * Audio goes as raw base64 in JSON, not as a data URI — OpenRouter's docs are
 * explicit that `input_audio.data` must not carry a `data:audio/...;base64,`
 * prefix.
 */
export async function transcribe(
  config: AiConfig,
  input: { audioBase64: string; format: TranscribableFormat; language?: string; timeoutMs?: number },
): Promise<TranscriptionSuccess | AiFailure> {
  const attempts: AttemptLog[] = []
  const timeoutMs = input.timeoutMs ?? 60_000

  if (config.stt.length === 0) {
    return { ok: false, error: 'No speech-to-text model is configured', status: 500, attempts }
  }

  for (const model of config.stt) {
    const payload: Record<string, unknown> = {
      model,
      input_audio: { data: input.audioBase64, format: input.format },
      // Whisper-family models invent text when the audio gives them nothing to
      // work with, and sampling is what lets them. Zero does not eliminate it,
      // but it stops the model reaching for a plausible-sounding phrase.
      temperature: 0,
    }
    if (input.language !== undefined) payload.language = input.language

    // Same reasoning as the chat-tier pin above: Whisper-family models have
    // very few providers behind them on OpenRouter, default routing is
    // price-weighted rather than latency-weighted, and the cheaper one can be
    // far slower for this workload. A model with no entry keeps OpenRouter's
    // own routing.
    const providerSlugs = config.sttProviders[model]
    if (providerSlugs !== undefined && providerSlugs.length > 0) {
      payload.provider = { only: providerSlugs, allow_fallbacks: false }
    }

    const result = await postJson(`${BASE_URL}/audio/transcriptions`, config, payload, timeoutMs)
    if (result.status === null) {
      attempts.push({ model, status: null, detail: result.detail })
      continue
    }
    if (result.status >= 400) {
      const detail = errorDetail(result.body, `HTTP ${result.status}`)
      attempts.push({ model, status: result.status, detail })
      if (isFatal(result.status)) return authFailure(result.status, detail, attempts, config)
      continue
    }
    if (!isRecord(result.body) || typeof result.body.text !== 'string') {
      attempts.push({ model, status: result.status, detail: 'no transcript in the response' })
      continue
    }

    const usage = result.body.usage
    const seconds = isRecord(usage) && typeof usage.seconds === 'number' ? usage.seconds : null
    return { ok: true, model, text: result.body.text, seconds }
  }

  const last = attempts[attempts.length - 1]
  return {
    ok: false,
    error:
      last === undefined
        ? 'Could not transcribe that'
        : `Could not transcribe that — ${named(config, last.model)}: ${last.detail}`,
    status: 502,
    attempts,
  }
}

/**
 * Ro's reply to an audio file.
 *
 * The returned file is WAV (PCM in a RIFF header) or mp3, depending on what the
 * provider gives back — either plays through a plain `<audio>` element, which is
 * the whole Safari story here. See the PCM notes above.
 *
 * A model with no configured voice is skipped rather than called with another
 * provider's voice name — §9 leaves the fallback model's voice unpicked, and
 * `Erinome` is a Gemini voice that OpenAI would refuse. See config.ts.
 */
export async function speak(
  config: AiConfig,
  input: { text: string; timeoutMs?: number },
): Promise<SpeechSuccess | AiFailure> {
  const attempts: AttemptLog[] = []
  const timeoutMs = input.timeoutMs ?? 60_000

  const usable = config.tts.models.filter((model) => config.tts.voices[model] !== undefined)
  if (usable.length === 0) {
    const configured = config.tts.models.length
    return {
      ok: false,
      error:
        configured === 0
          ? 'No text-to-speech model is configured'
          : 'No text-to-speech model has a voice configured. Set AI_MODEL_TTS_VOICE, ' +
            'and AI_MODEL_TTS_FALLBACK_VOICE if a fallback model is set.',
      status: 500,
      attempts,
    }
  }

  for (const model of usable) {
    const voice = config.tts.voices[model]
    if (voice === undefined) continue

    // A pinned provider (config.ts: AI_MODEL_TTS_PROVIDER /
    // AI_MODEL_TTS_FALLBACK_PROVIDER) is sent with no fallback — the point of
    // pinning Kokoro to DeepInfra is the $3.38/M-character gap to Together, so
    // silently falling back to the pricier provider on a DeepInfra hiccup
    // would defeat the reason this field exists. A model with no pin omitted
    // gets no `provider` field and keeps OpenRouter's own routing.
    const provider = config.tts.providers[model]
    const providerRouting =
      provider === undefined ? {} : { provider: { order: [provider], allow_fallbacks: false } }

    // PCM first: it is the format the endpoint documents as its default and the
    // only one Gemini accepts. mp3 is tried after, for a provider that refuses
    // PCM. Negotiating per model rather than hardcoding one format is the lesson
    // of this bug — asking every model for mp3 is what broke speech.
    for (const format of ['pcm', 'mp3'] as const) {
      const result = await postForBinary(
        `${BASE_URL}/audio/speech`,
        config,
        { model, input: input.text, voice, response_format: format, ...providerRouting },
        timeoutMs,
      )

      if ('detail' in result) {
        attempts.push({ model, status: null, detail: `${format}: ${result.detail}` })
        break // a network failure is not a format problem
      }
      if ('errorBody' in result) {
        const detail = errorDetail(result.errorBody, `HTTP ${result.status}`)
        attempts.push({ model, status: result.status, detail: `${format}: ${detail}` })
        if (isFatal(result.status)) return authFailure(result.status, detail, attempts, config)
        // Only try the other format when the complaint was about the format.
        if (/response_format|format|pcm|mp3/i.test(detail)) continue
        break
      }
      if (result.body.byteLength === 0) {
        attempts.push({ model, status: result.status, detail: `${format}: empty audio` })
        break
      }

      // Branch on what came back, not on what was asked for.
      const returnedMp3 = /mpeg|mp3/i.test(result.contentType)
      const audio = returnedMp3 ? result.body : wavFromPcm(result.body)
      const contentType = returnedMp3 ? 'audio/mpeg' : 'audio/wav'

      if (audio.byteLength > MAX_SPEECH_BYTES) {
        return {
          ok: false,
          error:
            'That reply is too long to read aloud — uncompressed speech would be about ' +
            `${String(Math.round(audio.byteLength / 100_000) / 10)} MB.`,
          status: 413,
          attempts,
        }
      }

      return { ok: true, model, voice, contentType, audio }
    }
  }

  const last = attempts[attempts.length - 1]
  return {
    ok: false,
    error:
      last === undefined
        ? 'Could not generate speech'
        : `Could not generate speech — ${named(config, last.model)}: ${last.detail}`,
    status: 502,
    attempts,
  }
}

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

import type { AiConfig, ModelTier } from './config'

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
      return error.message.slice(0, 300)
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
    const payload: Record<string, unknown> = { model, messages: request.messages }
    if (request.tools !== undefined && request.tools.length > 0) {
      payload.tools = request.tools
      payload.tool_choice = request.toolChoice ?? 'auto'
    }
    if (request.temperature !== undefined) payload.temperature = request.temperature
    if (request.maxTokens !== undefined) payload.max_tokens = request.maxTokens

    const result = await postJson(`${BASE_URL}/chat/completions`, config, payload, timeoutMs)

    if (result.status === null) {
      attempts.push({ model, status: null, detail: result.detail })
      continue
    }
    if (result.status >= 400) {
      const detail = errorDetail(result.body, `HTTP ${result.status}`)
      attempts.push({ model, status: result.status, detail })
      if (isFatal(result.status)) {
        return {
          ok: false,
          error: 'OpenRouter rejected the studio API key',
          status: 502,
          attempts,
        }
      }
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
        : `The ${tier} tier could not be reached: ${last.detail}`,
    status: 502,
    attempts,
  }
}

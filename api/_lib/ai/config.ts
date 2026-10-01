/**
 * Ro's server-side configuration.
 *
 * Every model id, flag and limit comes from the environment — plan §10 is
 * explicit that model ids are not hardcoded, so swapping a model or adding a
 * second option to a tier for redundancy is a config change, not a code
 * change. Each tier reads one variable that may hold a comma-separated,
 * ordered list; `openrouter.ts` walks that list in order and falls through to
 * the next entry when one is unavailable.
 *
 * Nothing here is defaulted. A missing or malformed variable is reported as a
 * configuration error rather than quietly substituting a model, a limit or an
 * "off" flag — guessing any of those would mean billing the studio's key for a
 * model nobody chose, or running with a blast-radius cap nobody set.
 *
 * This file is under api/_lib/, which Vercel does not turn into an endpoint.
 */

/** Plan §10's three tiers, named for the job rather than the number. */
export type ModelTier = 'intent' | 'drafting' | 'escalation'

/** Which environment variable backs each tier. */
const TIER_ENV: Record<ModelTier, string> = {
  intent: 'AI_MODEL_TIER0_INTENT',
  drafting: 'AI_MODEL_TIER1_DRAFTING',
  escalation: 'AI_MODEL_TIER2_ESCALATION',
}

export interface SpeechConfig {
  /** Ordered list: the §9 pick first, its fallback after. */
  models: string[]
  /**
   * Voice name per model id. Voices are provider-specific — Gemini's `Erinome`
   * is not a voice `gpt-4o-mini-tts` accepts — so a model with no configured
   * voice is skipped rather than called with another provider's voice name.
   * Plan §9 deliberately leaves the fallback's voice unpicked; set
   * AI_MODEL_TTS_FALLBACK_VOICE once it has been listened to.
   */
  voices: Record<string, string>
  /**
   * OpenRouter provider slug to pin per model id, optional. Most models route
   * fine on whichever provider OpenRouter picks, but Kokoro specifically must
   * not float: DeepInfra prices it at $0.62/M characters against Together's
   * $4.00/M — over $3/M apart for the identical model — so the pick is sent as
   * `provider: { order: [slug], allow_fallbacks: false }` rather than left to
   * OpenRouter's own routing. A model with no entry here gets no `provider`
   * field at all and keeps OpenRouter's default routing.
   */
  providers: Record<string, string>
}

export interface AiConfig {
  apiKey: string
  /** OpenRouter's attribution headers. Optional — they affect reporting only. */
  siteUrl: string | null
  siteName: string | null
  models: Record<ModelTier, string[]>
  /**
   * Provider pin per chat model id, optional. Mirrors `tts.providers`'
   * reasoning: a tier can be pinned to one inference provider (or a short
   * whitelist of them) when that provider's own numbers justify refusing to
   * float elsewhere, sent as `provider: { only: [...], allow_fallbacks:
   * false }`. Set via `<tier env var>_PROVIDER`, e.g.
   * AI_MODEL_TIER0_INTENT_PROVIDER. A model with no entry here gets no
   * `provider` field and keeps OpenRouter's own routing.
   */
  chatProviders: Record<string, string[]>
  /** Speech-to-text model ids, in order. */
  stt: string[]
  /**
   * Provider pin per STT model id, optional. Same mechanism and reasoning as
   * `chatProviders` — set via AI_MODEL_STT_PROVIDER. Whisper-family models on
   * OpenRouter have very few providers behind them, and default (unpinned)
   * routing is price-weighted, not latency-weighted, so the cheaper provider
   * wins even when it is far slower for this workload. A model with no entry
   * here gets no `provider` field and keeps OpenRouter's own routing.
   */
  sttProviders: Record<string, string[]>
  tts: SpeechConfig
  /**
   * Every environment variable that names each model id, comma-joined.
   *
   * Only for error messages, and it earns its keep: "openai/gpt-4o-mini-tts does
   * not exist" sends you hunting through four TTS variables, while "AI_MODEL_TTS
   * (openai/gpt-4o-mini-tts) does not exist" names the one to change.
   *
   * ALL of them, not the last one written — that distinction caused a real
   * misdiagnosis. When AI_MODEL_TTS and AI_MODEL_TTS_FALLBACK both held the same
   * id, a single-value map kept whichever was assigned last, so a failure of the
   * PRIMARY model was reported against the FALLBACK variable. It read as an
   * unexplained fallback when nothing had fallen back at all.
   */
  modelSources: Record<string, string>
  /** Master switch. False means every Ro endpoint refuses. */
  enabled: boolean
  requireConfirmationForSends: boolean
  maxSendsPerHour: number
  maxRecipientsPerAction: number
}

export type ConfigResult = { ok: true; config: AiConfig } | { ok: false; error: string }

function text(name: string): string | null {
  const raw = process.env[name]
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * A comma-separated, ordered list of provider slugs, optional. Unset means
 * "let OpenRouter route it", so — unlike `modelList` — this never adds to
 * `missing`.
 */
function providerList(name: string): string[] {
  const raw = text(name)
  if (raw === null) return []
  return raw
    .split(',')
    .map((slug) => slug.trim())
    .filter((slug) => slug.length > 0)
}

/** A comma-separated, ordered list of model ids. Blank entries are dropped. */
function modelList(name: string, missing: string[]): string[] {
  const raw = text(name)
  if (raw === null) {
    missing.push(name)
    return []
  }
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
  if (ids.length === 0) missing.push(name)
  return ids
}

function flag(name: string, missing: string[], malformed: string[]): boolean {
  const raw = text(name)
  if (raw === null) {
    missing.push(name)
    return false
  }
  const lowered = raw.toLowerCase()
  if (lowered === 'true') return true
  if (lowered === 'false') return false
  malformed.push(`${name} must be true or false`)
  return false
}

function count(name: string, missing: string[], malformed: string[]): number {
  const raw = text(name)
  if (raw === null) {
    missing.push(name)
    return 0
  }
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) {
    malformed.push(`${name} must be a whole number of 1 or more`)
    return 0
  }
  return value
}

/**
 * Reads the environment once per invocation.
 *
 * Returns a result rather than throwing so a handler can answer with a 500 and
 * the actual reason, the same way `create-parent-login.ts` reports its missing
 * Supabase variables instead of crashing on import.
 */
export function loadAiConfig(): ConfigResult {
  const missing: string[] = []
  const malformed: string[] = []

  const apiKey = text('OPENROUTER_API_KEY')
  if (apiKey === null) missing.push('OPENROUTER_API_KEY')

  const models: Record<ModelTier, string[]> = {
    intent: modelList(TIER_ENV.intent, missing),
    drafting: modelList(TIER_ENV.drafting, missing),
    escalation: modelList(TIER_ENV.escalation, missing),
  }

  // Provider pin per tier, optional, attributed to that tier's first model id
  // — the same model named more than once (as tier 0 and tier 1 both are for
  // the Cerebras-pinned gpt-oss-120b swap) picks up the pin under both keys,
  // since it's keyed by id rather than by tier.
  const chatProviders: Record<string, string[]> = {}
  for (const tier of Object.keys(models) as ModelTier[]) {
    const slugs = providerList(`${TIER_ENV[tier]}_PROVIDER`)
    const firstModel = models[tier][0]
    if (slugs.length > 0 && firstModel !== undefined) chatProviders[firstModel] = slugs
  }

  const stt = modelList('AI_MODEL_STT', missing)
  const sttProviders: Record<string, string[]> = {}
  {
    const slugs = providerList('AI_MODEL_STT_PROVIDER')
    const firstStt = stt[0]
    if (slugs.length > 0 && firstStt !== undefined) sttProviders[firstStt] = slugs
  }

  // The TTS pick and its fallback are two variables, read as one ordered list.
  const ttsModels: string[] = []
  const primaryTts = text('AI_MODEL_TTS')
  if (primaryTts === null) missing.push('AI_MODEL_TTS')
  else ttsModels.push(primaryTts)
  const fallbackTts = text('AI_MODEL_TTS_FALLBACK')
  if (fallbackTts !== null && !ttsModels.includes(fallbackTts)) ttsModels.push(fallbackTts)

  const voices: Record<string, string> = {}
  const primaryVoice = text('AI_MODEL_TTS_VOICE')
  if (primaryVoice === null) missing.push('AI_MODEL_TTS_VOICE')
  else if (primaryTts !== null) voices[primaryTts] = primaryVoice
  const fallbackVoice = text('AI_MODEL_TTS_FALLBACK_VOICE')
  if (fallbackVoice !== null && fallbackTts !== null) voices[fallbackTts] = fallbackVoice

  // Provider pin, optional — unset means "let OpenRouter route it", so these
  // are read straight through rather than via modelList/missing-tracking.
  const providers: Record<string, string> = {}
  const primaryProvider = text('AI_MODEL_TTS_PROVIDER')
  if (primaryProvider !== null && primaryTts !== null) providers[primaryTts] = primaryProvider
  const fallbackProvider = text('AI_MODEL_TTS_FALLBACK_PROVIDER')
  if (fallbackProvider !== null && fallbackTts !== null) providers[fallbackTts] = fallbackProvider

  const enabled = flag('AI_ASSISTANT_ENABLED', missing, malformed)
  const requireConfirmationForSends = flag(
    'AI_REQUIRE_CONFIRMATION_FOR_SENDS',
    missing,
    malformed,
  )
  const maxSendsPerHour = count('AI_MAX_SENDS_PER_HOUR', missing, malformed)
  const maxRecipientsPerAction = count('AI_MAX_RECIPIENTS_PER_ACTION', missing, malformed)

  // Built after the reads above. An id named by more than one variable is
  // attributed to every one of them, so a duplicate is visible rather than
  // silently collapsing to whichever was assigned last.
  const sourcesById = new Map<string, string[]>()
  const attribute = (id: string, variable: string): void => {
    const existing = sourcesById.get(id) ?? []
    if (!existing.includes(variable)) existing.push(variable)
    sourcesById.set(id, existing)
  }
  for (const tier of Object.keys(models) as ModelTier[]) {
    for (const id of models[tier]) attribute(id, TIER_ENV[tier])
  }
  for (const id of stt) attribute(id, 'AI_MODEL_STT')
  if (primaryTts !== null) attribute(primaryTts, 'AI_MODEL_TTS')
  if (fallbackTts !== null) attribute(fallbackTts, 'AI_MODEL_TTS_FALLBACK')
  const modelSources: Record<string, string> = {}
  for (const [id, variables] of sourcesById) modelSources[id] = variables.join(' and ')

  const problems: string[] = []
  if (missing.length > 0) problems.push(`missing ${missing.join(', ')}`)
  problems.push(...malformed)
  if (problems.length > 0) {
    return { ok: false, error: `Ro is not configured on the server: ${problems.join('; ')}` }
  }
  if (apiKey === null) {
    // Unreachable — a null key is already in `missing`. Narrows the type.
    return { ok: false, error: 'Ro is not configured on the server: missing OPENROUTER_API_KEY' }
  }

  return {
    ok: true,
    config: {
      apiKey,
      siteUrl: text('OPENROUTER_SITE_URL'),
      siteName: text('OPENROUTER_SITE_NAME'),
      models,
      chatProviders,
      stt,
      sttProviders,
      tts: { models: ttsModels, voices, providers },
      modelSources,
      enabled,
      requireConfirmationForSends,
      maxSendsPerHour,
      maxRecipientsPerAction,
    },
  }
}

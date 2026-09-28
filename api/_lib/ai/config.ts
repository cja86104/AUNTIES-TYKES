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
}

export interface AiConfig {
  apiKey: string
  /** OpenRouter's attribution headers. Optional — they affect reporting only. */
  siteUrl: string | null
  siteName: string | null
  models: Record<ModelTier, string[]>
  /** Speech-to-text model ids, in order. */
  stt: string[]
  tts: SpeechConfig
  /**
   * Which environment variable supplied each model id.
   *
   * Only for error messages, and it earns its keep: "openai/gpt-4o-mini-tts does
   * not exist" sends you hunting through four TTS variables, while "AI_MODEL_TTS
   * (openai/gpt-4o-mini-tts) does not exist" names the one to change.
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

  const stt = modelList('AI_MODEL_STT', missing)

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

  const enabled = flag('AI_ASSISTANT_ENABLED', missing, malformed)
  const requireConfirmationForSends = flag(
    'AI_REQUIRE_CONFIRMATION_FOR_SENDS',
    missing,
    malformed,
  )
  const maxSendsPerHour = count('AI_MAX_SENDS_PER_HOUR', missing, malformed)
  const maxRecipientsPerAction = count('AI_MAX_RECIPIENTS_PER_ACTION', missing, malformed)

  // Built after the reads above so every id is attributed, including duplicates
  // across variables (last one wins, which is fine for a diagnostic).
  const modelSources: Record<string, string> = {}
  for (const tier of Object.keys(models) as ModelTier[]) {
    for (const id of models[tier]) modelSources[id] = TIER_ENV[tier]
  }
  for (const id of stt) modelSources[id] = 'AI_MODEL_STT'
  if (primaryTts !== null) modelSources[primaryTts] = 'AI_MODEL_TTS'
  if (fallbackTts !== null) modelSources[fallbackTts] = 'AI_MODEL_TTS_FALLBACK'

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
      stt,
      tts: { models: ttsModels, voices },
      modelSources,
      enabled,
      requireConfirmationForSends,
      maxSendsPerHour,
      maxRecipientsPerAction,
    },
  }
}

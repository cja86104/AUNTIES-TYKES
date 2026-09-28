import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateAdmin } from '../_lib/ai/caller.js'
import { loadAiConfig } from '../_lib/ai/config.js'
import { transcribe, TRANSCRIBABLE_FORMATS, type TranscribableFormat } from '../_lib/ai/openrouter.js'

/**
 * Her voice to text — plan §9's input half.
 *
 * The browser records with `MediaRecorder`, uploads the clip here, and gets a
 * transcript back which it then sends through the normal chat flow as if she had
 * typed it. Nothing on the client touches `webkitSpeechRecognition`, which is
 * what makes this work on iOS Safari at all.
 *
 * Size: a Vercel function's request body caps at 4.5 MB, and base64 inflates
 * bytes by about a third, so the ceiling below is set from the platform limit
 * rather than from OpenRouter's own 25 MB. At Opus-in-WebM rates that is still
 * several minutes of speech — far longer than anything she would dictate to an
 * assistant in one go.
 */

const MAX_BASE64_CHARS = 3_500_000
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

interface Payload {
  audioBase64: string
  format: TranscribableFormat
  language?: string
}

function readPayload(raw: unknown): Payload | string {
  if (typeof raw !== 'object' || raw === null) return 'Malformed request body'
  const body = raw as Record<string, unknown>

  const audio = typeof body.audio === 'string' ? body.audio.trim() : ''
  if (audio.length === 0) return 'No audio was sent'
  if (audio.length > MAX_BASE64_CHARS) return 'That recording is too long — keep it under a few minutes'
  // A data: prefix is the most likely client mistake, and OpenRouter rejects it,
  // so name it rather than forwarding something that will fail downstream.
  if (audio.startsWith('data:')) return 'Send raw base64 audio, without the data: prefix'
  if (!BASE64.test(audio)) return 'That audio was not valid base64'

  const format = typeof body.format === 'string' ? body.format.toLowerCase() : ''
  if (!TRANSCRIBABLE_FORMATS.includes(format as TranscribableFormat)) {
    return `Unsupported audio format. Use one of: ${TRANSCRIBABLE_FORMATS.join(', ')}`
  }

  const language = typeof body.language === 'string' ? body.language.trim() : ''
  const payload: Payload = { audioBase64: audio, format: format as TranscribableFormat }
  // ISO-639-1 only; anything else is dropped rather than passed through.
  if (/^[a-z]{2}$/.test(language)) payload.language = language
  return payload
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const config = loadAiConfig()
  if (!config.ok) {
    res.status(500).json({ error: config.error })
    return
  }
  if (!config.config.enabled) {
    res.status(503).json({ error: 'Ro is turned off.', enabled: false })
    return
  }

  const caller = await authenticateAdmin(req.headers.authorization)
  if (!caller.ok) {
    res.status(caller.status).json({ error: caller.error })
    return
  }

  const payload = readPayload(req.body)
  if (typeof payload === 'string') {
    res.status(400).json({ error: payload })
    return
  }

  const result = await transcribe(config.config, payload)
  if (!result.ok) {
    console.error('[ro] transcribe failed', JSON.stringify(result.attempts))
    res.status(result.status).json({ error: result.error })
    return
  }

  res.status(200).json({ text: result.text, model: result.model, seconds: result.seconds })
}

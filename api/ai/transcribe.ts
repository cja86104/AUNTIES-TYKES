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

/**
 * Whisper's stock phrases for silence, which it emits before she starts talking.
 *
 * These are artifacts of the training data — subtitle and end-card boilerplate —
 * not anything that was in the room. Pinning the language removes the non-English
 * ones at source; this is the backstop for the English ones, which pinning cannot
 * help with because they are already in the right language.
 *
 * Deliberately a short list of exact openers rather than a fuzzy filter. "Thank
 * you" is something she might genuinely start with, so it is removed only when it
 * stands alone at the very front AND real words follow it. Cutting a sentence she
 * actually said is the worse of the two failures: a spurious one is visible in the
 * box and she can delete it, because a transcript lands there for her to read
 * rather than being sent anywhere.
 */
const OPENING_ARTIFACTS = [
  'thank you',
  'thanks for watching',
  'thank you for watching',
  'please subscribe',
  'subscribe to my channel',
  'bye',
  'you',
]

/** Han, Kana or Hangul. She is not speaking these. */
const NON_LATIN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const NON_LATIN_ALL = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu

/** Sentence enders, including the full-width ones these artifacts arrive with. */
const SENTENCE_END = /^([^.!?…。！？]{1,60}[.!?…。！？]+)[\s]+(\S[\s\S]*)$/u

/**
 * Removes a foreign-script preamble sitting in front of what she said.
 *
 * Not done by splitting sentences, which was the first attempt and was wrong
 * twice over: the real artifact was "字幕由Amara.org社群提供." — whose embedded dot
 * in "Amara.org" split it in the wrong place — and the Japanese one ends in a
 * full-width period, which a plain [.!?] class does not match.
 *
 * So it works on scripts instead. Find the last Han/Kana/Hangul character; if
 * everything after it is ordinary Latin text of a reasonable length, that tail is
 * what she said and the head is the artifact. A transcript that is foreign script
 * throughout is left alone — she may have meant it, and there would be nothing
 * left to keep.
 */
function stripForeignPreamble(text: string): string {
  const marks = [...text.matchAll(NON_LATIN_ALL)]
  const last = marks[marks.length - 1]
  if (last?.index === undefined) return text

  const cut = last.index + last[0].length
  // A long foreign section is content, not a stray opener.
  if (cut > 80) return text

  const rest = text.slice(cut).replace(/^[\s.,!?…。！？、:;-]+/u, '').trim()
  // Nothing worth keeping, or still foreign: leave the transcript as it came.
  if (rest.length < 10 || NON_LATIN.test(rest)) return text
  return rest
}

/**
 * Strips what Whisper invents for the silence before she starts talking.
 *
 * Two different problems. The foreign-script ones are handled above. The English
 * ones are handled below, from a short list of exact openers rather than a fuzzy
 * filter: "Thank you" is something she might genuinely start with, so it is
 * removed only when it stands alone at the very front AND real words follow it.
 * Cutting a sentence she actually said is the worse of the two failures — a
 * spurious one is visible in the box and she can delete it, because a transcript
 * lands there for her to read rather than being sent anywhere.
 */
export function stripOpeningArtifact(raw: string): string {
  let text = stripForeignPreamble(raw.trim())
  if (text.length === 0) return text

  // Two passes: these arrive doubled often enough to matter — "Thank you. Thank
  // you. <what she actually said>".
  for (let pass = 0; pass < 2; pass += 1) {
    const match = SENTENCE_END.exec(text)
    if (match === null) break
    const opener = match[1] ?? ''
    const rest = match[2] ?? ''
    const bare = opener.replace(/[.!?…。！？\s]+$/u, '').trim().toLowerCase()
    if (!OPENING_ARTIFACTS.includes(bare)) break
    text = rest.trim()
  }

  return text
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

  // Her own language, unless the client named one. Left unpinned, Whisper guesses
  // from the audio — and the quiet second before she starts talking is exactly
  // where it guesses wrong.
  if (payload.language === undefined) payload.language = caller.caller.language

  const result = await transcribe(config.config, payload)
  if (!result.ok) {
    console.error('[ro] transcribe failed', JSON.stringify(result.attempts))
    res.status(result.status).json({ error: result.error })
    return
  }

  const text = stripOpeningArtifact(result.text)
  res.status(200).json({ text, model: result.model, seconds: result.seconds })
}

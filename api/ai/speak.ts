import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateAdmin } from '../_lib/ai/caller.js'
import { loadAiConfig } from '../_lib/ai/config.js'
import { speak } from '../_lib/ai/openrouter.js'

/**
 * Ro's reply as audio — plan §9's output half.
 *
 * Returns the audio bytes directly rather than base64 in JSON, so the client can
 * hand the response straight to an `<audio>` element. §11 requires playback to
 * start from a tap and never autoplay, which also satisfies the user-gesture
 * rule every modern browser enforces — so the Safari story needs no workaround,
 * it is just how the feature is built.
 *
 * No caching: the audio is generated per reply, a reply is shown once, and a
 * cached copy of one parent's draft being read aloud is not something worth
 * keeping at the edge.
 */

/**
 * Roughly 80 seconds of speech.
 *
 * Lower than it looks on purpose: speech comes back as uncompressed PCM at 24 kHz
 * 16-bit mono — 48 KB per second — against a 4 MB ceiling on what a function may
 * return. So this is a response-size limit wearing a character limit's clothes,
 * and splitting long text into several requests would not raise it: the
 * constraint is the total audio, not the call. Lifting it properly needs
 * compressed audio, which the Gemini TTS model does not offer (§9).
 *
 * It was assumed this would not bite because Ro's replies are short. It bit: a
 * "Monday rundown" is dense rather than chatty and went past it, while a longer
 * but airier answer did not, so it read as random. Going over is now a trim
 * rather than a refusal — see `fitToSpoken`.
 */
const MAX_CHARS = 1200

/**
 * As much as can be spoken, ending on a sentence.
 *
 * Refusing outright was the wrong call. She asked for it to be read out, and
 * cutting off at four fifths with a word about it is more use than silence and
 * an error. Cut at a sentence end so it does not stop mid-clause; a single
 * sentence longer than the budget is cut at a word instead.
 */
export function fitToSpoken(text: string, max = MAX_CHARS): { spoken: string; trimmed: boolean } {
  if (text.length <= max) return { spoken: text, trimmed: false }

  const sentences = text.split(/(?<=[.!?…])\s+/)
  let spoken = ''
  for (const sentence of sentences) {
    const next = spoken.length === 0 ? sentence : `${spoken} ${sentence}`
    if (next.length > max) break
    spoken = next
  }

  if (spoken.length === 0) {
    // One very long sentence. Back off to the last space inside the budget.
    const cut = text.slice(0, max)
    const lastSpace = cut.lastIndexOf(' ')
    spoken = lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut
  }
  return { spoken, trimmed: true }
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

  const body = typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : {}
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (text.length === 0) {
    res.status(400).json({ error: 'There is nothing to read out' })
    return
  }
  const { spoken, trimmed } = fitToSpoken(text)

  const result = await speak(config.config, { text: spoken })
  if (!result.ok) {
    console.error('[ro] speak failed', JSON.stringify(result.attempts))
    res.status(result.status).json({ error: result.error })
    return
  }

  res.setHeader('Content-Type', result.contentType)
  res.setHeader('Content-Length', result.audio.byteLength.toString())
  res.setHeader('Cache-Control', 'no-store')
  // Which model and voice actually spoke, for the audit trail and for the
  // one-time listen check §9 asks for before this ships.
  res.setHeader('X-Ro-Voice', `${result.model}/${result.voice}`)
  // The client says so rather than letting her wonder why it stopped early.
  if (trimmed) res.setHeader('X-Ro-Trimmed', '1')
  res.status(200).send(result.audio)
}

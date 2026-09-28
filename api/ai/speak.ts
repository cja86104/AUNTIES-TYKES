import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateAdmin } from '../_lib/ai/caller.js'
import { loadAiConfig } from '../_lib/ai/config.js'
import { speak } from '../_lib/ai/openrouter.js'

/**
 * Ro's reply as audio — plan §9's output half.
 *
 * Returns the mp3 bytes directly rather than base64 in JSON, so the client can
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
 * Lower than it looks on purpose: speech comes back as uncompressed PCM at 48 KB
 * per second, so this is a response-size limit wearing a character limit's
 * clothes. Ro's replies are short by design, so it should not bite.
 */
const MAX_CHARS = 1200

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
  if (text.length > MAX_CHARS) {
    res.status(400).json({ error: 'That is too long to read aloud' })
    return
  }

  const result = await speak(config.config, { text })
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
  res.status(200).send(result.audio)
}

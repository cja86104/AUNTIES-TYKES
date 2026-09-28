import type { VercelRequest, VercelResponse } from '@vercel/node'
import { loadAiConfig } from '../_lib/ai/config.js'
import { authenticateAdmin } from '../_lib/ai/caller.js'

/**
 * Whether Ro is available, and what she can do.
 *
 * This exists because `AI_ASSISTANT_ENABLED` is server-only. It must stay that
 * way — a VITE_-prefixed copy would be a second source of truth for the same
 * switch, and the plan's own §15 records that an earlier duplicate of this flag
 * in `.env.local` was set both false and true at once. So the browser asks
 * instead of being told at build time, and the server stays the only authority.
 *
 * The admin console calls this once when it mounts, to decide whether to render
 * the assistant control at all. Nothing here is expensive: no model call, no
 * database read beyond the caller's own profile.
 *
 * Voice capability is reported per direction because they can fail
 * independently: the TTS fallback in §9 has no verified voice yet, so if the
 * primary TTS model is unavailable and no AI_MODEL_TTS_FALLBACK_VOICE is set,
 * speech is off while transcription still works.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const caller = await authenticateAdmin(req.headers.authorization)
  if (!caller.ok) {
    res.status(caller.status).json({ error: caller.error })
    return
  }

  const config = loadAiConfig()
  if (!config.ok) {
    // Not a 500: a missing variable is a deployment problem, not a crash. But it
    // is reported as `misconfigured` rather than plain `enabled: false`, because
    // the two need opposite handling — a deliberate off switch should hide the
    // control, while a broken config has to be visible to the one person who can
    // fix it. Collapsing them made a missing env var look like a missing feature.
    res.status(200).json({
      enabled: false,
      misconfigured: true,
      reason: config.error,
      voice: { input: false, output: false },
    })
    return
  }

  const speakable = config.config.tts.models.filter(
    (model) => config.config.tts.voices[model] !== undefined,
  )

  res.status(200).json({
    enabled: config.config.enabled,
    name: 'Ro',
    voice: {
      input: config.config.stt.length > 0,
      output: speakable.length > 0,
    },
    // True since 2026-09-28, and it means "she can prepare a send", never "she can
    // send unattended" — every send goes through a preview and her tap in
    // /api/ai/confirm, which §7 has no exception to.
    canSend: true,
    canAct: true,
    requiresConfirmationForSends: config.config.requireConfirmationForSends,
  })
}

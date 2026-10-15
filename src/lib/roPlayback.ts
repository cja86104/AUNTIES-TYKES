import { create } from 'zustand'
import { speechFor, type RoSpeech } from './ro'
import { splitForSpeech } from './speechParts'

/**
 * Ro's voice: the one audio element she speaks through, and which reply is
 * speaking right now.
 *
 * She reads each reply out loud the moment it arrives, with no tap — the owner
 * asked for that. Mute stops the reply that is playing and nothing else: it is
 * not a setting, so the next reply speaks again. Listen plays a reply again.
 *
 * Built for Safari on an iPhone first, which only lets audio start inside a
 * tap. A reply's audio arrives seconds after the tap that asked for it, by which
 * point the gesture is long over. The way through is that iOS remembers an
 * element that played inside a tap and lets that same element play again later.
 * So every tap that leads to a reply — Send, Listen — calls `primePlayback`
 * synchronously, which plays 50ms of silence on the shared element, and the
 * reply's audio is later pointed at that same element.
 *
 * Module scope, not component state, for the same reason as `roSession.ts`:
 * `App.tsx` remounts the whole admin subtree on every navigation. A ref inside
 * the panel would throw the unlocked element away on the next page — and the
 * reply that lands there would be refused — and `speakingId` would reset, so
 * the Mute button would vanish from a reply that is still talking.
 */

/** 50ms of 8-bit PCM silence. Silence in 8-bit PCM is 128, not 0. */
const SILENT_WAV =
  'data:audio/wav;base64,' +
  'UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICA'

interface PlaybackState {
  /** The reply being spoken, or fetched to be spoken. Null when Ro is quiet. */
  speakingId: string | null
}

export const useRoPlayback = create<PlaybackState>(() => ({ speakingId: null }))

let element: HTMLAudioElement | null = null

/**
 * Bumped by anything that changes what should be playing. A play request that
 * finds the counter moved on while it waited for audio drops itself, so a muted
 * reply cannot start talking after its audio arrives, and an old reply cannot
 * talk over a newer one.
 */
let generation = 0

/**
 * Releases a reply that is waiting for one piece to finish before playing the
 * next. Pausing never fires `ended`, so without this a muted reply would wait
 * forever.
 */
let releaseWait: (() => void) | null = null

/** Moves `generation` on and releases anything waiting on the old one. */
function interrupt(): number {
  generation += 1
  releaseWait?.()
  releaseWait = null
  return generation
}

/** Resolves true when the current piece ends, false if something interrupts it first. */
function untilEnded(el: HTMLAudioElement): Promise<boolean> {
  return new Promise((resolve) => {
    releaseWait = () => resolve(false)
    el.onended = () => {
      releaseWait = null
      resolve(true)
    }
  })
}

/**
 * Every piece of one reply's audio, all requested now and in parallel. Keyed
 * per piece, so the prefetch, the arrival and a Listen tap share each request
 * and nothing is generated — or paid for — twice.
 */
function speechParts(messageId: string, text: string): Promise<RoSpeech>[] {
  return splitForSpeech(text).map((part, index) => speechFor(`${messageId}#${String(index)}`, part))
}

/** Starts making a reply's audio without playing it, so a later Listen is quick. */
export function prefetchReply(messageId: string, text: string): void {
  for (const clip of speechParts(messageId, text)) void clip.catch(() => undefined)
}

/** Replies already spoken on arrival, so a remount never reads one twice. */
const spokenOnArrival = new Set<string>()

function audio(): HTMLAudioElement {
  if (element === null) element = new Audio()
  return element
}

/**
 * Call synchronously inside a tap, before anything is awaited. Unlocks the
 * shared element on iOS and silences whatever was playing.
 */
export function primePlayback(): void {
  interrupt()
  const el = audio()
  el.pause()
  // Cleared before the primer: otherwise the silence ends, fires the old
  // handler, and wipes the state of a reply that is about to play.
  el.onended = null
  el.src = SILENT_WAV
  // Not awaited: what iOS needs is play() CALLED inside the tap. A pending
  // primer is rejected with AbortError when the real audio replaces it, which
  // is expected and not a failure.
  void el.play().catch(() => undefined)
  useRoPlayback.setState({ speakingId: null })
}

/** Mute: stops what is playing now, and anything still on its way. */
export function stopPlayback(): void {
  interrupt()
  if (element !== null) {
    element.pause()
    element.onended = null
  }
  useRoPlayback.setState({ speakingId: null })
}

/**
 * True the first time it is asked about a reply, false after. The panel calls
 * it when a reply arrives, so each reply is spoken on arrival once at most.
 */
export function claimArrival(messageId: string): boolean {
  if (spokenOnArrival.has(messageId)) return false
  spokenOnArrival.add(messageId)
  return true
}

export type PlayOutcome =
  | { kind: 'played'; trimmed: boolean }
  /** Muted, or replaced by something newer, before it could start. */
  | { kind: 'cancelled' }
  /** The browser refused to start audio without a tap. */
  | { kind: 'blocked' }
  | { kind: 'failed'; cause: unknown }

/**
 * Speaks one reply, in the pieces `splitForSpeech` makes, back to back on the
 * one unlocked element. Resolves once the LAST piece has started, so a "read the
 * first part" notice for an over-long reply shows when that part begins.
 */
export async function playReply(messageId: string, text: string): Promise<PlayOutcome> {
  const mine = interrupt()
  const el = audio()
  useRoPlayback.setState({ speakingId: messageId })

  const clips = speechParts(messageId, text)
  let trimmed = false
  for (const [index, clip] of clips.entries()) {
    let speech: RoSpeech
    try {
      speech = await clip
    } catch (cause) {
      if (mine !== generation) return { kind: 'cancelled' }
      useRoPlayback.setState({ speakingId: null })
      return { kind: 'failed', cause }
    }
    if (mine !== generation) return { kind: 'cancelled' }
    trimmed = trimmed || speech.trimmed

    const last = index === clips.length - 1
    // Set before play() so a very short piece cannot end unheard by the handler.
    const finished = last ? null : untilEnded(el)
    if (last) {
      el.onended = () => {
        if (mine === generation) useRoPlayback.setState({ speakingId: null })
      }
    }
    el.src = speech.url
    try {
      await el.play()
    } catch (cause) {
      if (mine !== generation) return { kind: 'cancelled' }
      useRoPlayback.setState({ speakingId: null })
      if (cause instanceof DOMException && cause.name === 'NotAllowedError') return { kind: 'blocked' }
      return { kind: 'failed', cause }
    }
    if (finished === null) return { kind: 'played', trimmed }
    if (!(await finished) || mine !== generation) return { kind: 'cancelled' }
  }
  return { kind: 'cancelled' }
}

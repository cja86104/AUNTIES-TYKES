/**
 * Splits one Ro reply into the pieces it is spoken in.
 *
 * Why: the voice model (Gemini TTS, voice Erinome — the owner's pick, not
 * negotiable) sends nothing until a clip is finished, and a clip costs a fixed
 * ~2.6 s to start plus ~0.014 s per character (measured 2026-10-14: 38
 * characters 3.06 s, 150 characters 4.66 s). As one clip, a 400-character
 * reply kept her waiting ~8 s for the first word. Spoken as a short first
 * sentence plus the rest, she hears Ro after ~3 s whatever the length.
 *
 * Every piece is requested at once, in parallel. A piece is ready when the one
 * before it finishes playing as long as it is no more than about five times
 * that piece's length: generation runs ~70 characters a second after the fixed
 * start, speech ~15. So the pieces grow — the first sentence, then up to five
 * times that, then whatever is left — and at most three are made.
 *
 * Splits fall only at sentence ends or line breaks, where she would pause
 * anyway, so no word is cut. Joining the pieces with a space gives back the
 * text with only its whitespace changed.
 */

/** Replies at or under this are one clip: a split would save well under a second. */
export const SPLIT_ABOVE = 160

/** A first piece shorter than this takes the next sentence too ("Sure!" alone is too thin). */
const MIN_FIRST = 15

/** A first sentence longer than this is not split off: it would not start much sooner. */
const MAX_FIRST = 220

/** The second piece may be this many times the first and still be ready in time. */
const GROWTH = 5

/**
 * A period that ends one of these is not a sentence end: "Mrs. Chen",
 * "1 p.m. pickup". Splitting there would put a seam in the middle of a sentence.
 */
const ABBREVIATION = /\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|etc|a\.m|p\.m|e\.g|i\.e)\.$/i

/** Sentences and lines, each with its own end punctuation, whitespace dropped. */
function sentences(text: string): string[] {
  const pieces = text
    .split(/(?<=[.!?…]["'”’)\]]?)\s+|\n+/)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0)
  const merged: string[] = []
  for (const piece of pieces) {
    const previous = merged[merged.length - 1]
    if (previous !== undefined && ABBREVIATION.test(previous)) merged[merged.length - 1] = `${previous} ${piece}`
    else merged.push(piece)
  }
  return merged
}

export function splitForSpeech(text: string): string[] {
  const trimmed = text.trim()
  if (trimmed.length <= SPLIT_ABOVE) return [trimmed]

  const all = sentences(trimmed)
  let index = 0
  let first = ''
  while (index < all.length && first.length < MIN_FIRST) {
    first = first.length === 0 ? (all[index] ?? '') : `${first} ${all[index] ?? ''}`
    index += 1
  }
  if (first.length > MAX_FIRST || index >= all.length) return [trimmed]

  let second = ''
  const secondLimit = first.length * GROWTH
  while (index < all.length) {
    const next = all[index] ?? ''
    const joined = second.length === 0 ? next : `${second} ${next}`
    // Always take at least one sentence, even a long one; the third piece then
    // simply has a little longer to get ready.
    if (second.length > 0 && joined.length > secondLimit) break
    second = joined
    index += 1
  }

  const rest = all.slice(index).join(' ')
  return rest.length > 0 ? [first, second, rest] : [first, second]
}

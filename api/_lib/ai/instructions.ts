/**
 * The cheap pattern-match that runs before the model — plan §6.
 *
 * §6's reasoning: rather than sending every sentence to a model to classify,
 * match the obvious instruction shapes with plain regex first and only fall
 * through to Tier 0 when nothing matches. Most of what a home-daycare owner
 * actually says fits a handful of shapes.
 *
 * Deliberately a small starting set. §6 says to expand it as real usage shows
 * what she types, not to guess the full grammar up front, so these three are the
 * three §6 itself names. Adding a shape means adding a row to PATTERNS.
 *
 * What a match does in Phase 1: nothing but inform. §6's standing instructions
 * become rows in a rules table, and that table does not exist yet, so a match
 * here is passed to the chat handler as a hint and surfaced in the response —
 * never used to short-circuit the turn. Short-circuiting would let "don't
 * message the Brooks until Friday, what's their balance?" lose its question, and
 * the system prompt already tells Ro to say plainly that it cannot save a rule
 * yet. When the rules table lands, this is the function that feeds it.
 */

export type InstructionShape = 'reminder' | 'contact_hold' | 'payment_expectation'

export interface InstructionMatch {
  shape: InstructionShape
  /** The sentence as she wrote it. */
  raw: string
  /** Named pieces, for the rules table to consume in Phase 2. */
  captures: Record<string, string>
}

interface Pattern {
  shape: InstructionShape
  expression: RegExp
  /** Capture-group names, in group order. */
  fields: string[]
}

/**
 * Order matters: the most specific shape first. "remind me to tell the Okafors
 * not to come Friday" is a reminder, not a contact hold, and whichever pattern
 * runs first decides that.
 */
const PATTERNS: Pattern[] = [
  {
    shape: 'reminder',
    expression: /\bremind\s+me\s+(?:to\s+)?(.+?)\s*[.!]?$/i,
    fields: ['what'],
  },
  {
    shape: 'contact_hold',
    expression:
      /\b(?:don'?t|do\s+not|never)\s+(?:message|contact|e-?mail|email|text|call)\s+(?:the\s+)?(.+?)(?:\s+family)?\s+(until|before|till)\s+(.+?)\s*[.!]?$/i,
    fields: ['who', 'boundary', 'when'],
  },
  {
    shape: 'payment_expectation',
    expression:
      // `(?:on\s+)?(?:the\s+)?` in sequence, not as an alternation: "paying on
      // the 15th" has to shed both words, and `(?:on|the)` would shed only one.
      /\b(?:the\s+)?([\p{L}\p{N}'\- ]+?)\s+(?:is\s+paying|are\s+paying|will\s+pay|pays|pay)\s+(?:on\s+)?(?:the\s+)?(.+?)\s*[.!]?$/iu,
    fields: ['who', 'when'],
  },
]

/**
 * Returns the first shape that matches, or null when nothing does.
 *
 * Null is the common case and is not a failure — it just means the sentence goes
 * to Tier 0 like any other.
 */
export function matchStandingInstruction(text: string): InstructionMatch | null {
  const trimmed = text.trim()
  if (trimmed.length === 0) return null

  for (const pattern of PATTERNS) {
    const found = pattern.expression.exec(trimmed)
    if (found === null) continue
    const captures: Record<string, string> = {}
    pattern.fields.forEach((field, index) => {
      const value = found[index + 1]
      if (typeof value === 'string') captures[field] = value.trim()
    })
    return { shape: pattern.shape, raw: trimmed, captures }
  }
  return null
}

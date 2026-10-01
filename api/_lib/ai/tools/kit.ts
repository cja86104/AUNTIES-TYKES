/**
 * The shape of a tool, and the argument readers every tool uses.
 *
 * Plan §3: the model gets a fixed list of named functions, each already scoped
 * and validated exactly like the UI form that calls it today. Two consequences
 * are built into the types here:
 *
 *  - A tool's arguments arrive as model output, which is untrusted input. They
 *    are read through the narrowing helpers below — never cast — the same way
 *    `api/create-parent-login.ts` reads its request body.
 *  - "If data doesn't exist, the tool returns nothing" (build handoff). A
 *    lookup that finds no row answers `{ found: false }` as a normal result, not
 *    an error. An error would invite the model to explain around it; an explicit
 *    empty result gives it nothing to fill in.
 */

import type { PostgrestError } from '@supabase/supabase-js'
import type { Caller } from '../caller.js'

/**
 * §7's confirmation tiers, plus the two read-only ones.
 *
 * `read` and `draft` change nothing. The rest do, and the tier is what an audit
 * row records as `risk_tier` — how dangerous the action was considered at the
 * time it was taken, which is the question a trail gets read for later.
 *
 * The tier does NOT decide whether an action needs her tap. That is structural:
 * a tool needing approval has no write path of its own at all, only a `propose`,
 * and its write lives in the executor registry that `api/ai/confirm.ts` is the
 * sole caller of. A boolean on this interface could be forgotten by a tool added
 * later; a missing write path cannot be.
 */
export type ToolTier = 'read' | 'draft' | 'low' | 'medium' | 'send' | 'money'

export interface ToolContext {
  caller: Caller
  /** Today at the daycare, `yyyy-MM-dd`. Never derived from the host clock. */
  today: string
  /**
   * What she typed or said this turn, verbatim, before any model touched it.
   *
   * §8 wants the audit row to carry "the instruction that caused it", and that
   * has to be her sentence rather than the model's paraphrase of it — a trail
   * recording only the tool call cannot answer why something happened. It rides
   * on the context so no tool has to be handed it separately and forget.
   */
  instruction: string
  /** Which model produced the call, for §10's tier accounting in the audit row. */
  model: string
  /**
   * Proposals already made during this turn, keyed by tool and arguments.
   *
   * Exists because a model that has just proposed something has no way to see
   * that it worked: the rule is not in the rules table, because it is only
   * proposed. A weaker model checks, finds nothing, and proposes again — which
   * would stack two identical cards in front of her for one instruction, and
   * two rows in the audit trail. Asking twice in one turn now answers once.
   *
   * Per-request by design, not a cache: a genuine second save of the same rule
   * in a later turn is a real request and gets its own card.
   */
  proposedThisTurn: Map<string, ActionPreview>
  /**
   * Read results already produced this turn, keyed by tool and arguments.
   *
   * A model with a round budget can spend it re-asking the same question — a
   * live turn ran `family.find` four times and then ran out. Reads are pure, so
   * the second identical call cannot learn anything new; it is answered from here
   * with a note saying so, which costs nothing and tells the model to stop.
   */
  seenThisTurn: Map<string, ToolOutcome>
}

export type ToolOutcome = { ok: true; data: unknown } | { ok: false; error: string }

export interface ToolSpec {
  /** Underscore-separated name (Anthropic's tool-name pattern forbids dots), matching the convention in plan §3's table. */
  name: string
  tier: ToolTier
  /** Written for the model: what it answers, and when not to reach for it. */
  description: string
  /** JSON Schema for the arguments. */
  parameters: Record<string, unknown>
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolOutcome>
}

/* ----------------------------- argument readers ---------------------------- */

export function readString(args: Record<string, unknown>, key: string): string | null {
  const value = args[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * A free-text search term, reduced to characters a name can contain.
 *
 * The term reaches PostgREST's `ilike` filter, whose value is parsed out of a
 * query string, so punctuation the model invents has no business travelling
 * there. Names keep letters, digits, spaces, apostrophes, hyphens and periods.
 */
export function readSearchTerm(args: Record<string, unknown>, key: string): string | null {
  const raw = readString(args, key)
  if (raw === null) return null
  const cleaned = raw.replace(/[^\p{L}\p{N}\s'.-]/gu, ' ').replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned.slice(0, 60) : null
}

/** A `yyyy-MM-dd` date, rejected unless it is exactly that. */
export function readDate(args: Record<string, unknown>, key: string): string | null {
  const raw = readString(args, key)
  if (raw === null || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  return raw
}

export function readInt(
  args: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const value = args[key]
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

export function readBoolean(args: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = args[key]
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

export function readEnum<T extends string>(
  args: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = readString(args, key)
  if (raw === null) return fallback
  return allowed.includes(raw as T) ? (raw as T) : fallback
}

/* -------------------------------- db helpers ------------------------------- */

/**
 * Turns a Postgres error into a tool failure.
 *
 * The message is the owner-facing one; the driver's text is logged by the
 * handler rather than handed to the model, which has no use for it and would
 * try to interpret it.
 */
export function dbFailure(label: string, error: PostgrestError): { ok: false; error: string } {
  return { ok: false, error: `Could not read ${label}: ${error.message}` }
}

/* --------------------------------- actions --------------------------------- */

/**
 * What the panel shows her before an action runs.
 *
 * §7: send, money and PII actions "always show a preview and require her tap",
 * and a rule change has to be shown "in plain English before it's saved". This
 * is that preview, and it is deliberately one shape for every action rather than
 * a bespoke card per tool — the wording differs, the gate does not.
 *
 * `id` is the audit row's id. The arguments that will execute are already stored
 * against it, so approving cannot run anything other than what this preview
 * describes.
 */
export interface ActionPreview {
  id: string
  /** The tool that proposed it, e.g. `rule.save`. */
  kind: string
  title: string
  /** The one sentence she is actually approving. */
  summary: string
  detail: { label: string; value: string }[]
  confirmLabel: string
  /**
   * Set when approving needs something only she can type at the tap — today, a
   * parent login's password. The card shows a field for it and sends it with the
   * approval, straight to `api/ai/confirm.ts`.
   *
   * The value itself is never part of a preview, a proposal's stored arguments,
   * a tool result or anything a model reads. That is why it is collected on the
   * card instead of being an argument: an argument is written to the audit log
   * and was produced by the model, and a password must be neither.
   */
  secret?: ActionSecret
}

/** What the card's secret field asks for. Describes the field; never holds a value. */
export interface ActionSecret {
  label: string
  minLength: number
  maxLength: number
  /**
   * Shown with "Copy login details" once it has worked — the same text the
   * console's account dialog copies. The password half comes from the card's own
   * field; the server never sends it back.
   */
  share: { familyName: string; email: string }
}

/**
 * The tool result that carries a proposal. `proposed` is what chat.ts keys on.
 *
 * `nextStep` is in the payload rather than left to the system prompt on purpose.
 * A tool result is the model's most recent input and the thing it reasons from
 * next, and "proposed: true" does not obviously mean "finished" to a small model
 * — it read as "not saved yet", which is how one instruction turned into a loop
 * of retries that burned the whole round budget without ever answering her.
 */
export function proposed(action: ActionPreview): { ok: true; data: unknown } {
  return {
    ok: true,
    data: {
      proposed: true,
      action,
      nextStep:
        'Done — this is now showing on her screen as a card with the details and a ' +
        'button, directly under your reply. Do NOT call this tool again for the same ' +
        'thing, and do not look it up to check: it is deliberately not saved until she ' +
        'taps. Stop using tools now and write her one short sentence saying it is ' +
        'waiting for her. Do not repeat the details — the card already shows them.',
    },
  }
}

/** A proposal already made this turn for these arguments, if there is one. */
export function alreadyProposed(ctx: ToolContext, key: string): ActionPreview | undefined {
  return ctx.proposedThisTurn.get(key)
}

/** Remembers a proposal so an immediate repeat of the same request answers once. */
export function rememberProposal(ctx: ToolContext, key: string, action: ActionPreview): void {
  ctx.proposedThisTurn.set(key, action)
}

/**
 * Reads a proposal back out of a tool result, or null if there isn't one.
 *
 * A tool's `data` is `unknown` by the time the handler sees it, and this is the
 * shape that goes on to the browser and gets rendered with a button that changes
 * something. So it is narrowed properly here rather than asserted: a malformed
 * preview must not become a card offering to run an action it cannot describe.
 */
export function readActionPreview(data: unknown): ActionPreview | null {
  if (typeof data !== 'object' || data === null) return null
  const record = data as Record<string, unknown>
  if (record.proposed !== true) return null
  if (typeof record.action !== 'object' || record.action === null) return null

  const action = record.action as Record<string, unknown>
  const text = (key: string): string | null => {
    const value = action[key]
    return typeof value === 'string' && value.length > 0 ? value : null
  }

  const id = text('id')
  const kind = text('kind')
  const title = text('title')
  const summary = text('summary')
  const confirmLabel = text('confirmLabel')
  if (id === null || kind === null || title === null || summary === null || confirmLabel === null) {
    return null
  }

  const detail: { label: string; value: string }[] = []
  const rows: unknown = action.detail
  if (Array.isArray(rows)) {
    for (const entry of rows) {
      if (typeof entry !== 'object' || entry === null) continue
      const row = entry as Record<string, unknown>
      if (typeof row.label !== 'string' || typeof row.value !== 'string') continue
      detail.push({ label: row.label, value: row.value })
    }
  }

  const secret = readActionSecret(action.secret)
  return secret === null
    ? { id, kind, title, summary, detail, confirmLabel }
    : { id, kind, title, summary, detail, confirmLabel, secret }
}

/** The secret-field description, narrowed, or null when absent or malformed. */
function readActionSecret(raw: unknown): ActionSecret | null {
  if (typeof raw !== 'object' || raw === null) return null
  const secret = raw as Record<string, unknown>
  const share = secret.share
  if (typeof share !== 'object' || share === null) return null
  const shareRecord = share as Record<string, unknown>
  if (
    typeof secret.label !== 'string' ||
    typeof secret.minLength !== 'number' ||
    typeof secret.maxLength !== 'number' ||
    typeof shareRecord.familyName !== 'string' ||
    typeof shareRecord.email !== 'string'
  ) {
    return null
  }
  return {
    label: secret.label,
    minLength: secret.minLength,
    maxLength: secret.maxLength,
    share: { familyName: shareRecord.familyName, email: shareRecord.email },
  }
}

/** A JSON Schema object with no arguments. */
export const NO_ARGS: Record<string, unknown> = {
  type: 'object',
  properties: {},
  additionalProperties: false,
}

/** Builds a JSON Schema object, closed to extra properties. */
export function schema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return { type: 'object', properties, required, additionalProperties: false }
}

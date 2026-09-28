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

/** Phase 1 ships these two only. Send/Money/PII tiers arrive in Phase 2/3. */
export type ToolTier = 'read' | 'draft'

export interface ToolContext {
  caller: Caller
  /** Today at the daycare, `yyyy-MM-dd`. Never derived from the host clock. */
  today: string
}

export type ToolOutcome = { ok: true; data: unknown } | { ok: false; error: string }

export interface ToolSpec {
  /** Dotted name, matching the convention in plan §3's table. */
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

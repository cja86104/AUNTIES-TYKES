/**
 * Standing instructions, as rows that ordinary code checks — plan §6 and §7.
 *
 * §7 is explicit that no model is involved at send time: "plain structured data,
 * evaluated by ordinary code." `blocksSends` on the row, not a judgment here, and
 * not an inference from the rule's kind. That matters in one direction
 * particularly — a check that silently stops blocking sends a message to a family
 * Melissa told Ro to leave alone.
 *
 * The rule she gave is kept verbatim in `said` alongside the plain-English
 * `summary`, so a rule can always be read back to her in her own words. §7 wants
 * the summary shown before saving; the verbatim text is what makes a later "why
 * didn't you message them?" answerable.
 */

import { prettyDate } from './clock.js'
import { uid } from './ids.js'
import type { ToolContext } from './tools/kit.js'

export type RuleKind = 'contact_hold' | 'payment_expectation' | 'reminder' | 'manual'
export type RuleChannel = 'any' | 'message' | 'announcement'

export interface StandingRule {
  id: string
  kind: RuleKind
  said: string
  summary: string
  familyId: string | null
  familyLabel: string
  channel: RuleChannel
  blocksSends: boolean
  holdUntil: string | null
  createdAt: string
}

export interface Commitment {
  id: string
  said: string
  dueOn: string | null
  familyLabel: string
  createdAt: string
}

export type RulesResult<T> = { ok: true; value: T } | { ok: false; error: string }

const RULE_COLUMNS =
  'id, kind, said, summary, family_id, family_label, channel, blocks_sends, hold_until, created_at'

function toRule(row: {
  id: string
  kind: string
  said: string
  summary: string
  family_id: string | null
  family_label: string
  channel: string
  blocks_sends: boolean
  hold_until: string | null
  created_at: string
}): StandingRule {
  return {
    id: row.id,
    kind: row.kind as RuleKind,
    said: row.said,
    summary: row.summary,
    familyId: row.family_id,
    familyLabel: row.family_label,
    channel: row.channel as RuleChannel,
    blocksSends: row.blocks_sends,
    holdUntil: row.hold_until,
    createdAt: row.created_at,
  }
}

/**
 * One rule as a single line of plain English.
 *
 * Shared by the approval preview and the system prompt on purpose: the sentence
 * she approves and the sentence Ro is later reminded of have to be the same
 * sentence, or she approves one rule and Ro operates under a differently-worded
 * one. Takes the fields a saved row and an unsaved proposal both have, so it can
 * describe a rule before it exists.
 */
export function describeRule(rule: {
  summary: string
  familyLabel: string
  channel: RuleChannel
  blocksSends: boolean
  holdUntil: string | null
}): string {
  const bits: string[] = [rule.familyLabel.length > 0 ? rule.familyLabel : 'every family']
  if (rule.channel !== 'any') bits.push(rule.channel === 'message' ? 'messages only' : 'announcements only')
  if (rule.holdUntil !== null) bits.push(`until ${prettyDate(rule.holdUntil)}`)
  bits.push(rule.blocksSends ? 'stops sends' : 'does not stop sends')
  return `${rule.summary} (${bits.join(' · ')})`
}

/** Every active rule, newest first — for the prompt and for her own list. */
export async function activeRules(ctx: ToolContext): Promise<RulesResult<StandingRule[]>> {
  const { data, error } = await ctx.caller.db
    .from('ai_standing_rules')
    .select(RULE_COLUMNS)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error !== null) return { ok: false, error: `Could not read the standing rules: ${error.message}` }
  return { ok: true, value: data.map(toRule) }
}

/** Who a send reaches, for the gate below. */
export interface SendTarget {
  /** The families it lands in front of, or 'all' when it reaches every one. */
  familyIds: string[] | 'all'
  channel: Exclude<RuleChannel, 'any'>
}

/**
 * The send-time gate. Returns the rules that forbid this send, empty if none.
 *
 * Takes an audience rather than one family, which it did not originally, and the
 * difference is not cosmetic. "Don't message the Brooks family" has to stop an
 * announcement going to everyone, because everyone includes the Brooks family. A
 * check written around a single family id silently skipped exactly that case: the
 * rule named a family, the send named none, so they never matched and the
 * announcement went out. The blast-radius rule is the one that most needs the
 * gate, so it is the one it must not miss.
 *
 * Fails CLOSED by design: if the rules cannot be read, the caller is told so and
 * must refuse the send. The alternative — treating an unreadable rules table as
 * "no rules" — turns a database hiccup into a message going to a family who was
 * meant to be left alone, which is the exact failure this table exists to stop.
 */
export async function rulesBlocking(
  ctx: ToolContext,
  target: SendTarget,
): Promise<RulesResult<StandingRule[]>> {
  // A rule with no family applies to everyone, so it cannot be filtered out in
  // SQL alongside a specific family without an `or`. Fetched, then narrowed here.
  const { data, error } = await ctx.caller.db
    .from('ai_standing_rules')
    .select(RULE_COLUMNS)
    .eq('active', true)
    .eq('blocks_sends', true)
    .limit(200)
  if (error !== null) {
    return { ok: false, error: `Could not check the standing rules: ${error.message}` }
  }

  const today = ctx.today
  const blocking = data.map(toRule).filter((rule) => {
    if (rule.channel !== 'any' && rule.channel !== target.channel) return false
    // A hold with no end date is indefinite; one with an end date covers that day.
    if (rule.holdUntil !== null && rule.holdUntil < today) return false
    // A rule with no family is about everyone, so it always applies. A rule about
    // one family applies whenever this send reaches that family — including when
    // it reaches them by reaching everybody.
    if (rule.familyId === null) return true
    return target.familyIds === 'all' || target.familyIds.includes(rule.familyId)
  })
  return { ok: true, value: blocking }
}

export interface NewRule {
  kind: RuleKind
  said: string
  summary: string
  familyId?: string | null
  familyLabel?: string
  channel?: RuleChannel
  blocksSends: boolean
  holdUntil?: string | null
}

export async function saveRule(ctx: ToolContext, rule: NewRule): Promise<RulesResult<StandingRule>> {
  const id = uid('rule')
  const { error } = await ctx.caller.db.from('ai_standing_rules').insert({
    id,
    created_by: ctx.caller.id,
    kind: rule.kind,
    said: rule.said.slice(0, 2000),
    summary: rule.summary.slice(0, 500),
    family_id: rule.familyId ?? null,
    family_label: rule.familyLabel ?? '',
    channel: rule.channel ?? 'any',
    blocks_sends: rule.blocksSends,
    hold_until: rule.holdUntil ?? null,
    // Stated rather than left to the column default. The send-time check filters
    // on `active`, so this one field decides whether a saved rule guards anything
    // — and a value this load-bearing should be visible in the insert that writes
    // it, not inferred from a line in a migration.
    active: true,
  })
  if (error !== null) return { ok: false, error: `Could not save that rule: ${error.message}` }

  return {
    ok: true,
    value: {
      id,
      kind: rule.kind,
      said: rule.said,
      summary: rule.summary,
      familyId: rule.familyId ?? null,
      familyLabel: rule.familyLabel ?? '',
      channel: rule.channel ?? 'any',
      blocksSends: rule.blocksSends,
      holdUntil: rule.holdUntil ?? null,
      createdAt: new Date().toISOString(),
    },
  }
}

/**
 * Retires a rule rather than deleting it.
 *
 * §6 calls the rules inspectable and correctable. Keeping the row means "why did
 * Ro hold off messaging them last week?" still has an answer after she has
 * turned the rule off.
 */
export async function retireRule(ctx: ToolContext, id: string): Promise<RulesResult<boolean>> {
  const { data, error } = await ctx.caller.db
    .from('ai_standing_rules')
    .update({ active: false, retired_at: new Date().toISOString() })
    .eq('id', id)
    .eq('active', true)
    .select('id')
  if (error !== null) return { ok: false, error: `Could not retire that rule: ${error.message}` }
  return { ok: true, value: data.length > 0 }
}

/* ------------------------------- commitments ------------------------------- */

export async function openCommitments(ctx: ToolContext): Promise<RulesResult<Commitment[]>> {
  const { data, error } = await ctx.caller.db
    .from('ai_commitments')
    .select('id, said, due_on, family_label, created_at')
    .eq('status', 'open')
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(50)
  if (error !== null) return { ok: false, error: `Could not read commitments: ${error.message}` }
  return {
    ok: true,
    value: data.map((row) => ({
      id: row.id,
      said: row.said,
      dueOn: row.due_on,
      familyLabel: row.family_label,
      createdAt: row.created_at,
    })),
  }
}

export async function saveCommitment(
  ctx: ToolContext,
  input: { said: string; dueOn?: string | null; familyId?: string | null; familyLabel?: string },
): Promise<RulesResult<string>> {
  const id = uid('cmt')
  const { error } = await ctx.caller.db.from('ai_commitments').insert({
    id,
    said: input.said.slice(0, 1000),
    due_on: input.dueOn ?? null,
    family_id: input.familyId ?? null,
    family_label: input.familyLabel ?? '',
  })
  if (error !== null) return { ok: false, error: `Could not save that follow-up: ${error.message}` }
  return { ok: true, value: id }
}

export async function closeCommitment(
  ctx: ToolContext,
  id: string,
  status: 'kept' | 'dropped',
  note = '',
): Promise<RulesResult<boolean>> {
  const { data, error } = await ctx.caller.db
    .from('ai_commitments')
    .update({ status, closed_at: new Date().toISOString(), closed_note: note.slice(0, 500) })
    .eq('id', id)
    .eq('status', 'open')
    .select('id')
  if (error !== null) return { ok: false, error: `Could not close that follow-up: ${error.message}` }
  return { ok: true, value: data.length > 0 }
}

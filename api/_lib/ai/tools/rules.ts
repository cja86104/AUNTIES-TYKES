/**
 * The first tools that change something — plan §6 and §7.
 *
 * Two different gates, and the difference is the point of this file:
 *
 *  - `rule.save` and `rule.retire` PROPOSE. They contain no write at all. The
 *    write for each lives in `../execute.ts`, which only `api/ai/confirm.ts`
 *    calls, so there is no code path from a model's tool call to a saved rule
 *    that does not pass through her tap. §7 requires she be shown the rule in
 *    plain English before it is saved; this is what makes that structural rather
 *    than a convention a later tool could break.
 *
 *  - `commitment.note` and `commitment.close` write directly. They touch Ro's
 *    own follow-up list and nothing else — no business record, no message, no
 *    money. Making Melissa approve Ro remembering to check back on Friday would
 *    be a confirmation dialog with nothing behind it, and §7's gate is for send,
 *    money and PII actions. Every one of these writes still lands in the audit
 *    trail, as an already-executed row.
 *
 * Why a rule change is gated at all, when it sends nothing: a standing rule is
 * what stops a later send. Saving a wrong one is quiet — the failure shows up
 * as a message that did not go out, days later, with nothing pointing at the
 * cause. Retiring one is worse, because it removes a guard she put up.
 */

import { propose, record } from '../audit.js'
import { prettyDate } from '../clock.js'
import {
  activeRules,
  describeRule,
  saveCommitment,
  closeCommitment,
  type RuleChannel,
  type RuleKind,
} from '../rules.js'
import {
  alreadyProposed,
  dbFailure,
  NO_ARGS,
  proposed,
  rememberProposal,
  readBoolean,
  readDate,
  readEnum,
  readString,
  schema,
  type ActionPreview,
  type ToolContext,
  type ToolOutcome,
  type ToolSpec,
} from './kit.js'

const RULE_KINDS: readonly RuleKind[] = ['contact_hold', 'payment_expectation', 'reminder', 'manual']
const RULE_CHANNELS: readonly RuleChannel[] = ['any', 'message', 'announcement']

/**
 * Resolves a family id to the name that gets stored on the rule.
 *
 * The label is read from the database rather than taken from the model, because
 * it is what she reads in the preview and what a later "why didn't you message
 * them?" is answered with. A label the model wrote could name a different family
 * than the id it passed, and the preview would then be a description of
 * something other than what executes.
 */
async function resolveFamily(
  ctx: ToolContext,
  familyId: string | null,
): Promise<{ ok: true; id: string | null; label: string } | { ok: false; error: string } | { missing: true }> {
  if (familyId === null) return { ok: true, id: null, label: '' }
  const family = await ctx.caller.db.from('families').select('id, name').eq('id', familyId).maybeSingle()
  if (family.error !== null) return { ok: false, error: dbFailure('that family', family.error).error }
  if (family.data === null) return { missing: true }
  return { ok: true, id: family.data.id, label: family.data.name }
}

/* --------------------------------- rule.list -------------------------------- */

const ruleList: ToolSpec = {
  name: 'rule.list',
  tier: 'read',
  description:
    'List the standing instructions the owner has given you — who not to contact, ' +
    'who is paying when, what to remind her about. You do NOT need this before ' +
    'saving a rule: every active rule, with its id, is already listed for you at ' +
    'the start of this conversation. Call it only if she asks to see the full list, ' +
    'or if you think that list is out of date because something changed mid-' +
    'conversation.',
  parameters: NO_ARGS,
  execute: async (_args, ctx): Promise<ToolOutcome> => {
    const rules = await activeRules(ctx)
    if (!rules.ok) return { ok: false, error: rules.error }
    return {
      ok: true,
      data: {
        count: rules.value.length,
        rules: rules.value.map((rule) => ({
          id: rule.id,
          kind: rule.kind,
          reads: describeRule(rule),
          said: rule.said,
          familyId: rule.familyId,
          familyLabel: rule.familyLabel,
          channel: rule.channel,
          blocksSends: rule.blocksSends,
          holdUntil: rule.holdUntil,
        })),
      },
    }
  },
}

/* --------------------------------- rule.save -------------------------------- */

export interface PendingRule {
  kind: RuleKind
  said: string
  summary: string
  familyId: string | null
  familyLabel: string
  channel: RuleChannel
  blocksSends: boolean
  holdUntil: string | null
}

/** The stored arguments, read back and re-validated. Shared with the executor. */
export function readPendingRule(args: Record<string, unknown>): PendingRule | string {
  const said = readString(args, 'said')
  const summary = readString(args, 'summary')
  if (said === null) return 'The instruction she gave is required'
  if (summary === null) return 'A plain-English summary is required'

  const kind = readEnum(args, 'kind', RULE_KINDS, 'manual')
  // A contact hold that does not stop sends is a rule that reads like a guard and
  // acts like a note. `blocks_sends` is explicit on the row for good reason — a
  // check that infers it silently stops blocking the day a kind is added — but a
  // floor in this one direction can only make a rule more protective, never less,
  // and the preview says so plainly before she approves it.
  const blocksSends = kind === 'contact_hold' ? true : readBoolean(args, 'blocksSends', false)

  return {
    kind,
    said: said.slice(0, 2000),
    summary: summary.slice(0, 500),
    familyId: readString(args, 'familyId'),
    familyLabel: readString(args, 'familyLabel') ?? '',
    channel: readEnum(args, 'channel', RULE_CHANNELS, 'any'),
    blocksSends,
    holdUntil: readDate(args, 'holdUntil'),
  }
}

function rulePreview(id: string, rule: PendingRule): ActionPreview {
  const detail: { label: string; value: string }[] = [
    { label: 'Rule', value: rule.summary },
    { label: 'Applies to', value: rule.familyLabel.length > 0 ? rule.familyLabel : 'Every family' },
  ]
  if (rule.channel !== 'any') {
    detail.push({
      label: 'Covers',
      value: rule.channel === 'message' ? 'Direct messages only' : 'Announcements only',
    })
  }
  detail.push({ label: 'Until', value: rule.holdUntil === null ? 'No end date' : prettyDate(rule.holdUntil) })
  detail.push({
    label: 'Stops sends',
    value: rule.blocksSends
      ? 'Yes — nothing goes out to them while this holds'
      : 'No — this is a note to me, it will not block anything',
  })
  detail.push({ label: 'You said', value: rule.said })

  return {
    id,
    kind: 'rule.save',
    title: 'Save a standing rule',
    summary: rule.summary,
    detail,
    confirmLabel: 'Save rule',
  }
}

const ruleSave: ToolSpec = {
  name: 'rule.save',
  tier: 'medium',
  description:
    'Save a standing instruction she has just given you, so it survives this ' +
    'conversation and is checked before anything is sent. Use this whenever she ' +
    'tells you how to handle something going forward — "don\'t message the Brooks ' +
    'family until Friday", "the Chens pay on the 5th", "remind me about the fire ' +
    'drill". This does not save immediately: it shows her the rule and waits for ' +
    'her tap. Pass her own words in `said` and your plain-English reading in ' +
    '`summary`. Set blocksSends true only when the rule must actually stop messages ' +
    'going out, and resolve a family with family.find first if the rule is about one.',
  parameters: schema(
    {
      said: { type: 'string', description: 'Her sentence, as close to verbatim as you have it' },
      summary: {
        type: 'string',
        description: 'The rule in one plain sentence, as she will read it before approving',
      },
      kind: {
        type: 'string',
        enum: RULE_KINDS,
        description:
          "contact_hold = don't contact them for now (always stops sends); " +
          'payment_expectation = when or how a family pays; reminder = something to ' +
          'raise later; manual = anything else',
      },
      familyId: { type: 'string', description: 'From family.find. Omit if the rule is about everyone' },
      channel: {
        type: 'string',
        enum: RULE_CHANNELS,
        description: 'any (default), message for direct messages only, announcement for announcements only',
      },
      blocksSends: {
        type: 'boolean',
        description: 'True when this rule must stop messages going out. Forced true for contact_hold',
      },
      holdUntil: { type: 'string', description: 'yyyy-MM-dd, the last day it applies. Omit for indefinite' },
    },
    ['said', 'summary', 'kind', 'blocksSends'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const pending = readPendingRule(args)
    if (typeof pending === 'string') return { ok: false, error: pending }

    const family = await resolveFamily(ctx, pending.familyId)
    if ('missing' in family) {
      return { ok: true, data: { saved: false, reason: 'no family has that id', familyId: pending.familyId } }
    }
    if (!family.ok) return { ok: false, error: family.error }
    pending.familyId = family.id
    pending.familyLabel = family.label

    if (pending.holdUntil !== null && pending.holdUntil < ctx.today) {
      // A hold that ended before it was made would be saved, never apply, and
      // read like a live rule in her list.
      return {
        ok: true,
        data: { saved: false, reason: 'that end date is already past', holdUntil: pending.holdUntil },
      }
    }

    // One card per instruction, however many times the model asks this turn.
    const key = `rule.save:${JSON.stringify(pending)}`
    const existing = alreadyProposed(ctx, key)
    if (existing !== undefined) return proposed(existing)

    const logged = await propose(ctx, {
      instruction: ctx.instruction,
      tool: 'rule.save',
      riskTier: 'medium',
      // Stored before she sees it, and read back at execution, so approving runs
      // exactly the rule the preview described.
      arguments: { ...pending },
      subject: { familyId: pending.familyId, familyLabel: pending.familyLabel },
      model: ctx.model,
    })
    if (!logged.ok) return { ok: false, error: logged.error }

    const preview = rulePreview(logged.value, pending)
    rememberProposal(ctx, key, preview)
    return proposed(preview)
  },
}

/* -------------------------------- rule.retire ------------------------------- */

const ruleRetire: ToolSpec = {
  name: 'rule.retire',
  tier: 'medium',
  description:
    'Turn off a standing instruction she no longer wants — "you can message the ' +
    'Brooks family again", "forget the thing about the Chens paying late". Every ' +
    'rule you were given at the start of this conversation carries its own id; use ' +
    'that, or call rule.list if you need the full set. This does not take effect ' +
    'immediately: it shows her which rule would be turned off and waits for her ' +
    'tap. The rule is kept on record afterwards, not deleted.',
  parameters: schema({ ruleId: { type: 'string', description: 'From rule.list' } }, ['ruleId']),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const ruleId = readString(args, 'ruleId')
    if (ruleId === null) return { ok: false, error: 'A ruleId is required' }

    const rules = await activeRules(ctx)
    if (!rules.ok) return { ok: false, error: rules.error }
    const rule = rules.value.find((entry) => entry.id === ruleId)
    if (rule === undefined) {
      return { ok: true, data: { retired: false, reason: 'no active rule has that id', ruleId } }
    }

    const key = `rule.retire:${ruleId}`
    const existing = alreadyProposed(ctx, key)
    if (existing !== undefined) return proposed(existing)

    const logged = await propose(ctx, {
      instruction: ctx.instruction,
      tool: 'rule.retire',
      riskTier: 'medium',
      arguments: { ruleId, reads: describeRule(rule), said: rule.said },
      subject: { familyId: rule.familyId, familyLabel: rule.familyLabel, targets: [ruleId] },
      model: ctx.model,
    })
    if (!logged.ok) return { ok: false, error: logged.error }

    const preview: ActionPreview = {
      id: logged.value,
      kind: 'rule.retire',
      title: 'Turn off a standing rule',
      summary: `Stop applying: ${rule.summary}`,
      detail: [
        { label: 'Rule', value: describeRule(rule) },
        { label: 'You said', value: rule.said },
        {
          label: 'After this',
          value: rule.blocksSends
            ? 'This will no longer stop anything from being sent.'
            : 'I will stop treating this as a standing instruction.',
        },
        { label: 'Kept on record', value: 'Yes — turned off, not deleted.' },
      ],
      confirmLabel: 'Turn it off',
    }
    rememberProposal(ctx, key, preview)
    return proposed(preview)
  },
}

/* ------------------------------- commitments -------------------------------- */

const commitmentNote: ToolSpec = {
  name: 'commitment.note',
  tier: 'low',
  description:
    "Write down something YOU said you would do, so you can raise it in a later " +
    'conversation without being asked. Use it when you tell her you will check back ' +
    'on something — "I\'ll flag it if the Chens haven\'t paid by Friday". This is your ' +
    'own note, not a task for her, and it saves straight away without needing her ' +
    'approval. Do not use it for things SHE has to do, and do not use it for standing ' +
    'instructions she gave you — those are rule.save.',
  parameters: schema(
    {
      said: { type: 'string', description: 'What you told her you would do, in your own words' },
      dueOn: { type: 'string', description: 'yyyy-MM-dd you said you would come back to it. Omit if none' },
      familyId: { type: 'string', description: 'From family.find, when it is about one family' },
    },
    ['said'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const said = readString(args, 'said')
    if (said === null) return { ok: false, error: 'Say what you are committing to' }
    const dueOn = readDate(args, 'dueOn')

    const family = await resolveFamily(ctx, readString(args, 'familyId'))
    if ('missing' in family) {
      return { ok: true, data: { noted: false, reason: 'no family has that id' } }
    }
    if (!family.ok) return { ok: false, error: family.error }

    const saved = await saveCommitment(ctx, {
      said,
      dueOn,
      familyId: family.id,
      familyLabel: family.label,
    })

    const entry = {
      instruction: ctx.instruction,
      tool: 'commitment.note',
      riskTier: 'low',
      arguments: { said, dueOn, familyId: family.id },
      subject: { familyId: family.id, familyLabel: family.label },
      model: ctx.model,
    }
    if (!saved.ok) {
      await record(ctx, entry, 'failed', { error: saved.error })
      return { ok: false, error: saved.error }
    }
    await record(ctx, { ...entry, subject: { ...entry.subject, targets: [saved.value] } }, 'executed')

    return {
      ok: true,
      data: {
        noted: true,
        id: saved.value,
        said,
        dueOn,
        familyLabel: family.label,
      },
    }
  },
}

const commitmentClose: ToolSpec = {
  name: 'commitment.close',
  tier: 'low',
  description:
    'Close out one of your own follow-ups, once it is handled or no longer ' +
    'relevant. The open ones are listed for you at the start of every conversation. ' +
    "Use 'kept' when it actually got dealt with and 'dropped' when it stopped " +
    'mattering. Saves straight away.',
  parameters: schema(
    {
      commitmentId: { type: 'string', description: 'The id from your open follow-ups' },
      status: { type: 'string', enum: ['kept', 'dropped'], description: 'kept = handled, dropped = no longer relevant' },
      note: { type: 'string', description: 'One line on how it ended' },
    },
    ['commitmentId', 'status'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const commitmentId = readString(args, 'commitmentId')
    if (commitmentId === null) return { ok: false, error: 'A commitmentId is required' }
    const status = readEnum(args, 'status', ['kept', 'dropped'] as const, 'kept')
    const note = readString(args, 'note') ?? ''

    const closed = await closeCommitment(ctx, commitmentId, status, note)
    const entry = {
      instruction: ctx.instruction,
      tool: 'commitment.close',
      riskTier: 'low',
      arguments: { commitmentId, status, note },
      subject: { targets: [commitmentId] },
      model: ctx.model,
    }
    if (!closed.ok) {
      await record(ctx, entry, 'failed', { error: closed.error })
      return { ok: false, error: closed.error }
    }
    if (!closed.value) {
      // Already closed, or never existed. Not an error — an answer.
      return { ok: true, data: { closed: false, reason: 'no open follow-up has that id', commitmentId } }
    }
    await record(ctx, entry, 'executed')
    return { ok: true, data: { closed: true, id: commitmentId, status } }
  },
}

export const ruleTools: ToolSpec[] = [ruleList, ruleSave, ruleRetire, commitmentNote, commitmentClose]

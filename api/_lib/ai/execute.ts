/**
 * The executor registry — where an approved proposal actually runs.
 *
 * This file is the single write path for every gated action, and
 * `api/ai/confirm.ts` is its only caller. That is the whole design: a tool that
 * needs her approval contains no write of its own, so there is no route from a
 * model's tool call to a changed record except through a proposal she tapped.
 * Phase 1's guarantee was "the gate is the absence of the tool"; this is the same
 * guarantee once the tools exist.
 *
 * An executor reads its arguments back out of the stored proposal rather than
 * being handed them. They were written before she saw the preview, so what runs
 * is what the preview described — the model gets no second turn between her
 * approval and the write. They come back out of jsonb as `unknown`, so they are
 * re-validated here through the same readers the tool used, not cast.
 *
 * `sendTarget` is how §7's send-time rule check becomes unskippable. Any executor
 * that puts a message in front of a family declares who it reaches, and the
 * generic path in confirm.ts checks the standing rules before dispatching. Put
 * inside each send executor instead, it would be one forgotten call away from a
 * message going to a family Melissa said to leave alone — which is the exact
 * failure `ai_standing_rules` exists to prevent.
 */

import type { Proposal } from './audit.js'
import { retireRule, saveRule } from './rules.js'
import { readPendingRule } from './tools/rules.js'
import { readString, type ToolContext } from './tools/kit.js'

export type ExecutionOutcome =
  | {
      ok: true
      /** One line for her, for the audit row and for the panel. */
      summary: string
      /** Ids of whatever was created or changed, for the audit row. */
      targets?: unknown[]
      /** How long "undo" stays offered, per §8. Omitted when undo is impossible. */
      undoMs?: number
    }
  | { ok: false; error: string }

export interface Executor {
  tool: string
  run: (ctx: ToolContext, proposal: Proposal) => Promise<ExecutionOutcome>
  /**
   * Set by anything that sends. Declaring it opts the executor into the
   * standing-rule check in confirm.ts; returning null means this particular
   * proposal reaches nobody.
   */
  sendTarget?: (proposal: Proposal) => { familyId: string | null; channel: 'message' | 'announcement' } | null
}

const saveRuleExecutor: Executor = {
  tool: 'rule.save',
  run: async (ctx, proposal) => {
    const pending = readPendingRule(proposal.arguments)
    if (typeof pending === 'string') return { ok: false, error: pending }

    const saved = await saveRule(ctx, {
      kind: pending.kind,
      said: pending.said,
      summary: pending.summary,
      familyId: pending.familyId,
      familyLabel: pending.familyLabel,
      channel: pending.channel,
      blocksSends: pending.blocksSends,
      holdUntil: pending.holdUntil,
    })
    if (!saved.ok) return { ok: false, error: saved.error }
    return { ok: true, summary: `Saved: ${pending.summary}`, targets: [saved.value.id] }
  },
}

const retireRuleExecutor: Executor = {
  tool: 'rule.retire',
  run: async (ctx, proposal) => {
    const ruleId = readString(proposal.arguments, 'ruleId')
    if (ruleId === null) return { ok: false, error: 'That action is missing the rule it referred to' }

    const retired = await retireRule(ctx, ruleId)
    if (!retired.ok) return { ok: false, error: retired.error }
    if (!retired.value) {
      // Turned off in the meantime — by her, or by a second tap on the same card.
      return { ok: false, error: 'That rule was already turned off' }
    }
    return { ok: true, summary: 'Rule turned off. It stays on record.', targets: [ruleId] }
  },
}

const executors: Executor[] = [saveRuleExecutor, retireRuleExecutor]

const byTool = new Map<string, Executor>(executors.map((executor) => [executor.tool, executor]))

/**
 * The executor for a proposed tool, or undefined.
 *
 * Undefined is a real case worth handling rather than asserting away: an audit
 * row outlives the code that wrote it, so a proposal made before a deploy can be
 * approved after one that no longer has that tool. Better to tell her the action
 * can no longer be run than to crash on her tap.
 */
export function findExecutor(tool: string): Executor | undefined {
  return byTool.get(tool)
}

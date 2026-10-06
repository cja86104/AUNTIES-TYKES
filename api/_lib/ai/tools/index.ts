/**
 * The catalog — the wall from plan §8.
 *
 * The model is handed the definitions in `toolDefinitions()` and nothing else.
 * `runToolCall()` is the only way a tool runs, and it dispatches by exact name
 * against this registry, so a tool the model invents is not "unavailable" — it
 * does not exist, and the model is told so plainly rather than being given an
 * error it could narrate around.
 *
 * Registering a tool here makes it callable; leaving it out makes it impossible,
 * whatever a prompt says. That is still true of every tool in §3's table that is
 * not listed below.
 *
 * Note what registering does NOT do. `rule_save` and `rule_retire` are in this
 * array and change nothing when called: they record a proposal and stop, and
 * their writes live in `../execute.ts` behind `api/ai/confirm.ts`. So the catalog
 * being reachable by the model and the write being reachable by the model are two
 * separate questions, and the second one always answers to her tap.
 */

import type { ToolDefinition } from '../openrouter.js'
import { accountTools } from './accounts.js'
import { billingTools } from './billing.js'
import { familyTools } from './families.js'
import { draftTools } from './drafts.js'
import { enrollmentTools } from './enrollments.js'
import { readTools } from './reads.js'
import { officeTools } from './office.js'
import { recordTools } from './records.js'
import { ruleTools } from './rules.js'
import { sendTools } from './sends.js'
import type { ToolContext, ToolOutcome, ToolSpec } from './kit.js'

export type { ToolContext, ToolOutcome, ToolSpec } from './kit.js'

/** Everything Ro can do, in the order the model sees it. */
export const roTools: ToolSpec[] = [
  ...readTools,
  ...draftTools,
  ...ruleTools,
  ...sendTools,
  ...recordTools,
  ...officeTools,
  ...billingTools,
  ...familyTools,
  ...accountTools,
  ...enrollmentTools,
]

const byName = new Map<string, ToolSpec>(roTools.map((tool) => [tool.name, tool]))

/** The catalog in OpenRouter's tool-definition shape. */
export function toolDefinitions(tools: ToolSpec[] = roTools): ToolDefinition[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

export function findTool(name: string): ToolSpec | undefined {
  return byName.get(name)
}

/** One executed call, in the shape §8's audit log needs to record. */
export interface ToolRun {
  name: string
  /** Exactly what the model asked for, before parsing. */
  rawArguments: string
  tier: ToolSpec['tier'] | null
  outcome: ToolOutcome
}

/**
 * Runs one tool call from the model.
 *
 * Arguments arrive as a JSON string the model wrote, so both the parse and the
 * shape are checked here; each tool then reads its own fields through the
 * narrowing helpers in `kit.ts`.
 */
export async function runToolCall(
  call: { name: string; arguments: string },
  ctx: ToolContext,
): Promise<ToolRun> {
  const spec = byName.get(call.name)
  if (spec === undefined) {
    return {
      name: call.name,
      rawArguments: call.arguments,
      tier: null,
      outcome: {
        ok: false,
        error:
          `There is no tool named "${call.name}". Only the tools listed are ` +
          'available, and nothing outside them can be done.',
      },
    }
  }

  let parsed: unknown
  try {
    parsed = call.arguments.trim().length === 0 ? {} : (JSON.parse(call.arguments) as unknown)
  } catch {
    return {
      name: spec.name,
      rawArguments: call.arguments,
      tier: spec.tier,
      outcome: { ok: false, error: 'Those arguments were not valid JSON' },
    }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      name: spec.name,
      rawArguments: call.arguments,
      tier: spec.tier,
      outcome: { ok: false, error: 'Arguments must be a JSON object' },
    }
  }

  // A read asked twice in one turn is answered once. Reads only, and only on an
  // exact argument match: a tool that changes something must always run, and a
  // different question is a different question.
  const key = `${spec.name}:${call.arguments.trim()}`
  if (spec.tier === 'read') {
    const seen = ctx.seenThisTurn.get(key)
    if (seen !== undefined) {
      return { name: spec.name, rawArguments: call.arguments, tier: spec.tier, outcome: repeat(seen) }
    }
  }

  const outcome = await spec.execute(parsed as Record<string, unknown>, ctx)
  if (spec.tier === 'read' && outcome.ok) ctx.seenThisTurn.set(key, outcome)
  return { name: spec.name, rawArguments: call.arguments, tier: spec.tier, outcome }
}

/**
 * The same answer again, with a note telling the model it is the same answer.
 *
 * The note is the point — handing back identical data silently would let the
 * loop keep going. The shape is preserved so nothing downstream has to know this
 * happened.
 */
function repeat(outcome: ToolOutcome): ToolOutcome {
  if (!outcome.ok) return outcome
  if (typeof outcome.data !== 'object' || outcome.data === null || Array.isArray(outcome.data)) {
    return outcome
  }
  return {
    ok: true,
    data: {
      ...(outcome.data as Record<string, unknown>),
      alreadyAsked:
        'You already called this with these exact arguments a moment ago, and this is ' +
        'the same answer. Nothing has changed. Do not call it again — answer her with ' +
        'what you have.',
    },
  }
}

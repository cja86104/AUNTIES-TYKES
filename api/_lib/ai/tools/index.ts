/**
 * The catalog — the wall from plan §8.
 *
 * The model is handed the definitions in `toolDefinitions()` and nothing else.
 * `runToolCall()` is the only way a tool runs, and it dispatches by exact name
 * against this registry, so a tool the model invents is not "unavailable" — it
 * does not exist, and the model is told so plainly rather than being given an
 * error it could narrate around.
 *
 * Phase 1 registers read and draft tools only. The Send / Money / PII tools in
 * §3's table are deliberately absent: confirmation gating them (§7) is a Phase
 * 2/3 job, and a tool that is not in this array cannot be called by any prompt.
 */

import type { ToolDefinition } from '../openrouter'
import { draftTools } from './drafts'
import { readTools } from './reads'
import type { ToolContext, ToolOutcome, ToolSpec } from './kit'

export type { ToolContext, ToolOutcome, ToolSpec } from './kit'

/** Everything Ro can do this phase, in the order the model sees it. */
export const phase1Tools: ToolSpec[] = [...readTools, ...draftTools]

const byName = new Map<string, ToolSpec>(phase1Tools.map((tool) => [tool.name, tool]))

/** The catalog in OpenRouter's tool-definition shape. */
export function toolDefinitions(tools: ToolSpec[] = phase1Tools): ToolDefinition[] {
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

  const outcome = await spec.execute(parsed as Record<string, unknown>, ctx)
  return { name: spec.name, rawArguments: call.arguments, tier: spec.tier, outcome }
}

/**
 * Wording Ro prepares that has no send behind it yet.
 *
 * `message.draft` and `announcement.draft` used to live here and were removed on
 * 2026-09-28, when `message.send` and `announcement.send` were built. A send
 * proposal already IS a draft — she reads the wording, and taps or dismisses —
 * so keeping both only gave the model a way to hand her a copy-it-yourself dead
 * end when she had asked for something to go out. That was the single thing the
 * owner said defeated the purpose of the feature.
 *
 * `dailyLog.draft` stays because there is genuinely nothing to send it with: a
 * daily log is a record, `dailyLog.write` is a later section, and until then the
 * honest offer is wording she can paste into the form herself.
 */

import {
  dbFailure,
  readString,
  schema,
  type ToolOutcome,
  type ToolSpec,
} from './kit.js'

const MAX_BODY = 4000

function readBody(args: Record<string, unknown>, key: string, limit: number): string | null {
  const raw = readString(args, key)
  if (raw === null) return null
  return raw.slice(0, limit)
}

const dailyLogDraft: ToolSpec = {
  name: 'dailyLog_draft',
  tier: 'draft',
  description:
    "Prepare the wording of a daily-log note for one child from that child's own " +
    'records, for the owner to review. This does NOT save a log. Read the ' +
    'attendance record and any existing log first; rephrase what is there and add ' +
    'nothing — no invented meals, naps, moods or activities.',
  parameters: schema(
    {
      childId: { type: 'string' },
      body: { type: 'string', description: 'The note, drawn only from real fields' },
      date: { type: 'string', description: 'yyyy-MM-dd; defaults to today' },
    },
    ['childId', 'body'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const childId = readString(args, 'childId')
    const body = readBody(args, 'body', MAX_BODY)
    if (childId === null) return { ok: false, error: 'A childId is required' }
    if (body === null) return { ok: false, error: 'A note body is required' }
    const date = readString(args, 'date')
    const onDate = date !== null && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ctx.today

    const child = await ctx.caller.db
      .from('children')
      .select('id, name, family_id')
      .eq('id', childId)
      .maybeSingle()
    if (child.error !== null) return dbFailure('that child', child.error)
    if (child.data === null) {
      return { ok: true, data: { drafted: false, reason: 'no child has that id', childId } }
    }

    return {
      ok: true,
      data: {
        drafted: true,
        saved: false,
        draft: {
          kind: 'daily_log_note',
          childId,
          familyId: child.data.family_id,
          date: onDate,
          body,
        },
      },
    }
  },
}

export const draftTools: ToolSpec[] = [dailyLogDraft]

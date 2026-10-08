/**
 * The child-record mutations — plan §3's Low tier.
 *
 * Attendance and daily logs: the two things Melissa touches most, and the two
 * she is most often holding a toddler while touching. They still propose and
 * wait for her tap. §7 allows Low actions to auto-run "once trust is
 * established", and trust is not established on day one — but the switch is
 * cheap when she wants it, because a tool that auto-runs is one that calls its
 * executor directly instead of `propose`.
 *
 * No undo on these, deliberately. §8's undo window is about sends, where the
 * damage is a parent having read something. A wrong check-in is fixed by
 * checking in again, from the card or from the attendance sheet, and offering an
 * Undo button that only re-did what the tool already does would be noise.
 *
 * Every behaviour here mirrors `useStore.ts` exactly — including the parts that
 * look like gaps. `checkOut` there maps over existing records and silently does
 * nothing when there is no record for today; that is a real edge she can hit, so
 * it is reported as an answer rather than reproduced as a silent no-op.
 */

import { propose } from '../audit.js'
import { prettyDate, timeInZone } from '../clock.js'
import { uid } from '../ids.js'
import type { Incident } from '../../../../src/types.js'
import {
  alreadyProposed,
  dbFailure,
  proposed,
  readBoolean,
  readDate,
  readEnum,
  readString,
  rememberProposal,
  schema,
  type ActionPreview,
  type ToolContext,
  type ToolOutcome,
  type ToolSpec,
} from './kit.js'

const MAX_NOTE = 500
const MAX_FIELD = 1000

type AttendanceAction = 'in' | 'out' | 'absent'
const ATTENDANCE_ACTIONS: readonly AttendanceAction[] = ['in', 'out', 'absent']

/** The child plus the family they belong to, or a plain miss. */
async function findChild(
  ctx: ToolContext,
  childId: string,
): Promise<
  | { ok: true; id: string; name: string; familyId: string; familyName: string }
  | { ok: false; error: string }
  | { missing: true }
> {
  const child = await ctx.caller.db
    .from('children')
    .select('id, name, family_id')
    .eq('id', childId)
    .maybeSingle()
  if (child.error !== null) return { ok: false, error: dbFailure('that child', child.error).error }
  if (child.data === null) return { missing: true }

  const family = await ctx.caller.db
    .from('families')
    .select('id, name')
    .eq('id', child.data.family_id)
    .maybeSingle()
  if (family.error !== null) return { ok: false, error: dbFailure('that family', family.error).error }

  return {
    ok: true,
    id: child.data.id,
    name: child.data.name,
    familyId: child.data.family_id,
    familyName: family.data?.name ?? '',
  }
}

/* ------------------------------ attendance.set ----------------------------- */

const attendanceSet: ToolSpec = {
  name: 'attendance_set',
  tier: 'low',
  description:
    'Check a child in, check them out, or mark them absent. Resolve the child ' +
    'with roster_list or family_get first. This does not take effect on its own: ' +
    'it shows the owner what would change and waits for her tap. Checking out a ' +
    'child who was never checked in is not possible — say so rather than ' +
    'checking them in first.',
  parameters: schema(
    {
      childId: { type: 'string', description: 'From roster_list or attendance_today' },
      action: {
        type: 'string',
        enum: ATTENDANCE_ACTIONS,
        description: "in = check in, out = check out, absent = mark absent for the day",
      },
      note: { type: 'string', description: 'Only used when marking absent' },
      date: { type: 'string', description: 'yyyy-MM-dd; defaults to today' },
    },
    ['childId', 'action'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const childId = readString(args, 'childId')
    if (childId === null) return { ok: false, error: 'A childId is required' }
    const action = readEnum(args, 'action', ATTENDANCE_ACTIONS, 'in')
    const date = readDate(args, 'date') ?? ctx.today
    const note = readString(args, 'note')?.slice(0, MAX_NOTE) ?? ''

    const child = await findChild(ctx, childId)
    if ('missing' in child) {
      return { ok: true, data: { changed: false, reason: 'no child has that id', childId } }
    }
    if (!child.ok) return { ok: false, error: child.error }

    const existing = await ctx.caller.db
      .from('attendance')
      .select('id, status, check_in, check_out, note')
      .eq('child_id', childId)
      .eq('date', date)
      .maybeSingle()
    if (existing.error !== null) return dbFailure('that attendance record', existing.error)

    if (action === 'out' && existing.data === null) {
      // Mirrors the console: checkOut only maps over an existing record. Reported
      // rather than quietly turning into a check-in, which would invent a arrival
      // time nobody observed.
      return {
        ok: true,
        data: {
          changed: false,
          reason: 'there is no attendance record for them that day, so there is nothing to check out of',
          childName: child.name,
          date,
        },
      }
    }
    if (action === 'out' && existing.data?.check_out !== null) {
      return {
        ok: true,
        data: { changed: false, reason: 'they are already checked out', childName: child.name, date },
      }
    }

    const was =
      existing.data === null
        ? 'nothing recorded'
        : `${existing.data.status}${existing.data.check_in === null ? '' : ` since ${existing.data.check_in}`}`

    const payload = { childId, childName: child.name, action, date, note }
    const key = `attendance.set:${JSON.stringify(payload)}`
    const seen = alreadyProposed(ctx, key)
    if (seen !== undefined) return proposed(seen)

    const logged = await propose(ctx, {
      instruction: ctx.instruction,
      tool: 'attendance.set',
      riskTier: 'low',
      arguments: payload,
      subject: {
        familyId: child.familyId,
        familyLabel: child.familyName,
        childId: child.id,
        childLabel: child.name,
      },
      model: ctx.model,
    })
    if (!logged.ok) return { ok: false, error: logged.error }

    const becomes =
      action === 'in' ? 'Checked in' : action === 'out' ? 'Checked out' : 'Absent for the day'
    const detail: { label: string; value: string }[] = [
      { label: 'Child', value: `${child.name}${child.familyName.length > 0 ? ` (${child.familyName})` : ''}` },
      { label: 'Day', value: date === ctx.today ? `Today, ${prettyDate(date)}` : prettyDate(date) },
      { label: 'Right now', value: was },
      { label: 'Becomes', value: becomes },
    ]
    if (action === 'absent' && note.length > 0) detail.push({ label: 'Note', value: note })

    const preview: ActionPreview = {
      id: logged.value,
      kind: 'attendance.set',
      title: 'Update attendance',
      summary: `${child.name} — ${becomes.toLowerCase()}`,
      detail,
      confirmLabel: becomes,
    }
    rememberProposal(ctx, key, preview)
    return proposed(preview)
  },
}

/* ------------------------------ dailyLog.write ----------------------------- */

const LOG_FIELDS = ['meals', 'naps', 'potty', 'mood', 'notes'] as const

/** The moods the console offers. Ro may still use her own words if she says something else. */
const MOOD_CHOICES = [
  'Cheerful',
  'Sleepy but sweet',
  'Busy & curious',
  'Snuggly',
  'Silly',
  'Focused',
  'Tender',
  'Grumpy',
  'Tired',
  'Feeling sick',
]

const INCIDENT_LABELS: Record<IncidentKey, string> = {
  time: 'Incident time',
  location: 'Where it happened',
  description: 'What happened',
  injury: 'Injury',
  firstAid: 'First aid given',
  witnessedBy: 'Witnessed by',
  parentNotified: 'Parent notified',
}

const dailyLogWrite: ToolSpec = {
  name: 'dailyLog_write',
  tier: 'low',
  description:
    "Write or update a child's daily log. Read dailyLog_list for that child and " +
    'day first — if a log already exists, this updates it, and anything you leave ' +
    'out keeps its current value. Fill in only what the owner actually told you or ' +
    'what the records show: never invent a meal, a nap, a mood or an activity. ' +
    'Every part is optional — the family sees only the parts that were filled in. ' +
    'Can also add, change or remove an incident / injury report. Photos and PDFs ' +
    'cannot be attached here; she adds those from the Daily logs page. ' +
    'This does not save on its own; she sees it and taps.',
  parameters: schema(
    {
      childId: { type: 'string' },
      date: { type: 'string', description: 'yyyy-MM-dd; defaults to today' },
      meals: { type: 'string' },
      naps: { type: 'string' },
      potty: { type: 'string' },
      mood: { type: 'string', description: `Usually one of: ${MOOD_CHOICES.join(', ')}` },
      notes: { type: 'string', description: 'The note home' },
      activities: { type: 'array', items: { type: 'string' }, description: 'Replaces the existing list' },
      incident: {
        type: 'object',
        description:
          'An incident or injury report on this log. Merged into any incident already ' +
          'on it. A new incident needs time, location, description and parentNotified — ' +
          'ask her for any she has not given rather than guessing. The family is asked ' +
          'to confirm they read it, and asked again if it changes.',
        properties: {
          time: { type: 'string', description: 'HH:mm, 24-hour' },
          location: { type: 'string' },
          description: { type: 'string', description: 'What happened' },
          injury: { type: 'string', description: 'The injury and body part; omit if nobody was hurt' },
          firstAid: { type: 'string' },
          witnessedBy: { type: 'string' },
          parentNotified: { type: 'string', description: 'How and when the parent was told' },
        },
        additionalProperties: false,
      },
      removeIncident: { type: 'boolean', description: 'Take the incident report off this log' },
    },
    ['childId'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const childId = readString(args, 'childId')
    if (childId === null) return { ok: false, error: 'A childId is required' }
    const date = readDate(args, 'date') ?? ctx.today

    const child = await findChild(ctx, childId)
    if ('missing' in child) {
      return { ok: true, data: { written: false, reason: 'no child has that id', childId } }
    }
    if (!child.ok) return { ok: false, error: child.error }

    const fields: Record<string, string> = {}
    for (const field of LOG_FIELDS) {
      const value = readString(args, field)
      if (value !== null) fields[field] = value.slice(0, MAX_FIELD)
    }
    const rawActivities = args.activities
    const activities = Array.isArray(rawActivities)
      ? rawActivities.filter((entry): entry is string => typeof entry === 'string').slice(0, 20)
      : null

    const incidentChanges = readIncidentArgs(args.incident)
    const removeIncident = readBoolean(args, 'removeIncident', false)
    if (removeIncident && incidentChanges !== null) {
      return { ok: false, error: 'Either change the incident or remove it, not both' }
    }

    if (Object.keys(fields).length === 0 && activities === null && incidentChanges === null && !removeIncident) {
      return { ok: false, error: 'Nothing to write — give at least one part of the log' }
    }

    const existing = await ctx.caller.db
      .from('daily_logs')
      .select('id, incident')
      .eq('child_id', childId)
      .eq('date', date)
      .maybeSingle()
    if (existing.error !== null) return dbFailure('that daily log', existing.error)

    const currentIncident = existing.data?.incident ?? null
    if (removeIncident && currentIncident === null) {
      return { ok: true, data: { written: false, reason: 'that log has no incident to remove' } }
    }
    // Checked here as well as on save, so she is asked for what is missing
    // before a card goes up rather than after she taps it.
    let incidentPreview: IncidentDetails | null = null
    if (incidentChanges !== null) {
      const merged = mergeIncident(currentIncident, incidentChanges, '')
      if (!merged.ok) {
        return {
          ok: false,
          error: `The incident report still needs: ${merged.missing.map((k) => INCIDENT_LABELS[k].toLowerCase()).join(', ')}. Ask her.`,
        }
      }
      incidentPreview = merged.incident
    }

    const payload = {
      childId,
      childName: child.name,
      date,
      fields,
      activities,
      incident: incidentChanges,
      removeIncident,
      logId: existing.data?.id ?? null,
    }
    const key = `dailyLog.write:${JSON.stringify(payload)}`
    const seen = alreadyProposed(ctx, key)
    if (seen !== undefined) return proposed(seen)

    const logged = await propose(ctx, {
      instruction: ctx.instruction,
      tool: 'dailyLog.write',
      riskTier: 'low',
      arguments: payload,
      subject: {
        familyId: child.familyId,
        familyLabel: child.familyName,
        childId: child.id,
        childLabel: child.name,
        targets: existing.data === null ? [] : [existing.data.id],
      },
      model: ctx.model,
    })
    if (!logged.ok) return { ok: false, error: logged.error }

    const detail: { label: string; value: string }[] = [
      { label: 'Child', value: child.name },
      { label: 'Day', value: date === ctx.today ? `Today, ${prettyDate(date)}` : prettyDate(date) },
    ]
    for (const field of LOG_FIELDS) {
      const value = fields[field]
      if (value !== undefined) {
        detail.push({ label: field.charAt(0).toUpperCase() + field.slice(1), value })
      }
    }
    if (activities !== null) {
      detail.push({ label: 'Activities', value: activities.length > 0 ? activities.join(', ') : 'none' })
    }
    if (incidentPreview !== null) {
      for (const key of INCIDENT_KEYS) {
        const value = incidentPreview[key]
        if (value.trim().length > 0) detail.push({ label: INCIDENT_LABELS[key], value })
      }
      detail.push({ label: 'Family', value: 'Will be asked to confirm they read the incident report.' })
    }
    if (removeIncident) {
      detail.push({ label: 'Incident', value: 'Removed from this log.' })
    }
    detail.push({
      label: existing.data === null ? 'This is' : 'Careful',
      value:
        existing.data === null
          ? "A new log — nothing exists for that day yet."
          : 'A log already exists for that day. Anything above replaces what is in it; the rest stays.',
    })

    const preview: ActionPreview = {
      id: logged.value,
      kind: 'dailyLog.write',
      title: existing.data === null ? "Write today's log" : 'Update the log',
      summary: `${child.name} — ${date === ctx.today ? 'today' : prettyDate(date)}`,
      detail,
      confirmLabel: existing.data === null ? 'Save the log' : 'Update it',
    }
    rememberProposal(ctx, key, preview)
    return proposed(preview)
  },
}

export const recordTools: ToolSpec[] = [attendanceSet, dailyLogWrite]

/* --------------------------- shared with execute --------------------------- */

export const INCIDENT_KEYS = [
  'time',
  'location',
  'description',
  'injury',
  'firstAid',
  'witnessedBy',
  'parentNotified',
] as const

type IncidentKey = (typeof INCIDENT_KEYS)[number]
export type IncidentDetails = Omit<Incident, 'recordedAt'>

/** Same rule as the console's form: these four make an incident report. */
const INCIDENT_REQUIRED: readonly IncidentKey[] = ['time', 'location', 'description', 'parentNotified']

/** The incident fields Ro supplied, trimmed and capped; null when none were. */
export function readIncidentArgs(raw: unknown): Partial<IncidentDetails> | null {
  if (typeof raw !== 'object' || raw === null) return null
  const source = raw as Record<string, unknown>
  const out: Partial<IncidentDetails> = {}
  for (const key of INCIDENT_KEYS) {
    const value = source[key]
    if (typeof value === 'string') out[key] = value.trim().slice(0, MAX_FIELD)
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * Lays the changes over the incident already on the log and checks the result
 * is a complete report. `recordedAt` — the version a parent acknowledges — is
 * kept when nothing actually changed and set to `now` when anything did, the
 * same rule the console uses, so an edit asks the family to confirm again.
 */
export function mergeIncident(
  existing: Incident | null,
  changes: Partial<IncidentDetails>,
  now: string,
): { ok: true; incident: Incident } | { ok: false; missing: IncidentKey[] } {
  const base: IncidentDetails = {
    time: existing?.time ?? '',
    location: existing?.location ?? '',
    description: existing?.description ?? '',
    injury: existing?.injury ?? '',
    firstAid: existing?.firstAid ?? '',
    witnessedBy: existing?.witnessedBy ?? '',
    parentNotified: existing?.parentNotified ?? '',
  }
  const merged: IncidentDetails = { ...base, ...changes }
  const missing = INCIDENT_REQUIRED.filter((k) => merged[k].trim().length === 0)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(merged.time) && !missing.includes('time')) missing.unshift('time')
  if (missing.length > 0) return { ok: false, missing }
  const unchanged = existing !== null && INCIDENT_KEYS.every((k) => merged[k] === base[k])
  return { ok: true, incident: { ...merged, recordedAt: unchanged ? existing.recordedAt : now } }
}

/** The time of day a check-in or check-out is stamped with, `HH:mm`. */
export function stampTime(): string {
  return timeInZone()
}

/** A fresh attendance row id, matching `uid('att')` in the console. */
export function attendanceId(): string {
  return uid('att')
}

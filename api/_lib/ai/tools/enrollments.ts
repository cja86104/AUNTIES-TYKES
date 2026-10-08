/**
 * Deciding an enrollment form — plan §3's `enrollment.decide`, Medium tier.
 *
 * Future Arrivals in the console, as a tool. A family fills in the public
 * enrollment form; the owner approves it, which puts the family and its children
 * on the roster, or declines it. Ro could already read these forms and tells her
 * when a new one arrives (`enrollment_new` in triggers.ts) — this is the part
 * that lets her act on one.
 *
 * It waits for her tap. The write is `decideEnrollmentExecutor` in
 * `../execute.ts`, behind `api/ai/confirm.ts`.
 *
 * Approving mirrors `approveEnrollment` in src/store/useStore.ts field for
 * field: the family takes the form's contact details including the secondary and
 * emergency contacts, each child starts `active` with "Auntie Melissa" as
 * teacher, and allergies and medications are split from the comma-separated text
 * the parent typed. Three things are stricter than the console, on purpose:
 *
 *  - An email already on file for a family stops the approval. A parent who
 *    submits the form twice would otherwise become two families, and the email
 *    is what their portal login is made from.
 *  - The executor claims the form with a compare-and-swap, so approving here and
 *    in the console at the same moment cannot both create the family.
 *  - If the family or a child fails to save, everything is rolled back and the
 *    form goes back to pending, instead of leaving half a family on file.
 *
 * What the card shows is a snapshot of the form taken when Ro proposed it, and
 * that snapshot — not a fresh read — is what runs. A form cannot be edited after
 * it is submitted, so the two cannot differ, but storing it keeps §7's rule
 * literal: the thing approved and the thing run are the same thing.
 */

import { formatWeeklySchedule, sanitizeWeeklySchedule } from '../../../../src/lib/schedule.js'
import type { WeeklySchedule } from '../../../../src/types.js'
import { propose } from '../audit.js'
import { prettyDate } from '../clock.js'
import { AGE_GROUPS, exactPattern, type AgeGroup } from './families.js'
import {
  alreadyProposed,
  dbFailure,
  proposed,
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

export const ENROLLMENT_DECISIONS = ['approve', 'decline'] as const
export type EnrollmentDecision = (typeof ENROLLMENT_DECISIONS)[number]

export interface SnapshotContact {
  name: string
  relation: string
  phone: string
}

export interface SnapshotChild {
  name: string
  dob: string
  ageGroup: AgeGroup
  plan: string
  /**
   * The weekly grid, sanitized. Null when the form had none or it was
   * malformed: the child arrives as "schedule not set" for her to fill in.
   * Null rather than undefined so it survives the trip through stored jsonb.
   */
  schedule: WeeklySchedule | null
  /** Empty when the form carried none; stored as NULL, as `fromChild` does. */
  startDate: string
  allergies: string[]
  medications: string[]
  notes: string
}

export interface EnrollmentSnapshot {
  familyName: string
  primaryContact: string
  relation: string
  email: string
  phone: string
  address: string
  secondary: SnapshotContact
  emergency: SnapshotContact[]
  notes: string
  acknowledgedHandbook: boolean
  children: SnapshotChild[]
}

function text(record: Record<string, unknown>, key: string, limit = 500): string {
  return readString(record, key)?.slice(0, limit) ?? ''
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readContact(value: unknown): SnapshotContact {
  const record = asRecord(value) ?? {}
  return { name: text(record, 'name', 120), relation: text(record, 'relation', 60), phone: text(record, 'phone', 40) }
}

/** "peanuts, eggs" -> ["peanuts", "eggs"], as `splitList` in useStore.ts; an array passes through. */
function readList(value: unknown): string[] {
  const items: string[] = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : typeof value === 'string'
      ? value.split(',')
      : []
  return items.map((item) => item.trim().slice(0, 120)).filter((item) => item.length > 0).slice(0, 12)
}

/**
 * Reads a form — or a stored snapshot of one — into what approval needs.
 *
 * Takes snake_case (a row from `enrollments`) and camelCase (a stored snapshot)
 * alike, because it runs on both: once on the row when proposing, and again on
 * the proposal's stored arguments when executing. Both are untrusted by the time
 * they get here — the row's jsonb was typed by a member of the public, and the
 * arguments came back out of jsonb — so nothing is cast.
 *
 * Only what the database itself requires is enforced: a child needs a name, a
 * real date of birth and a known age group, because `children` rejects a row
 * without them. Everything else is taken as the parent wrote it, the way the
 * console's Approve takes it. A string is the reason it cannot be approved.
 */
export function readEnrollmentSnapshot(source: Record<string, unknown>): EnrollmentSnapshot | string {
  const familyName = text(source, 'familyName', 120) || text(source, 'family_name', 120)
  if (familyName.length === 0) return 'the form has no family name'
  const email = text(source, 'email', 254)
  if (email.length === 0) return 'the form has no email address'

  const rawChildren = source.children
  const childList: unknown[] = Array.isArray(rawChildren) ? rawChildren : []
  const children: SnapshotChild[] = []
  for (const [index, entry] of childList.entries()) {
    const record = asRecord(entry)
    const which = `child ${String(index + 1)}`
    if (record === null) return `${which} on the form could not be read`
    const name = text(record, 'name', 120)
    if (name.length === 0) return `${which} on the form has no name`
    const dob = readDate(record, 'dob')
    if (dob === null) return `${name} has no date of birth on the form`
    const rawGroup = readString(record, 'ageGroup')
    const ageGroup = AGE_GROUPS.find((group) => group === rawGroup)
    if (ageGroup === undefined) return `${name} has no age group on the form`
    children.push({
      name,
      dob,
      ageGroup,
      plan: text(record, 'plan', 120),
      schedule: sanitizeWeeklySchedule(record.schedule) ?? null,
      startDate: readDate(record, 'startDate') ?? '',
      allergies: readList(record.allergies),
      medications: readList(record.medications),
      notes: text(record, 'notes'),
    })
  }

  const rawEmergency = source.emergency
  const emergency = (Array.isArray(rawEmergency) ? rawEmergency : [])
    .slice(0, 6)
    .map(readContact)
    .filter((contact) => contact.name.length > 0 || contact.phone.length > 0)

  const acknowledged = source.acknowledgedHandbook ?? source.acknowledged_handbook
  return {
    familyName,
    primaryContact: text(source, 'primaryContact', 120) || text(source, 'primary_contact', 120),
    relation: text(source, 'relation', 60),
    email,
    phone: text(source, 'phone', 40),
    address: text(source, 'address'),
    secondary: readContact(source.secondary),
    emergency,
    notes: text(source, 'notes'),
    acknowledgedHandbook: acknowledged === true,
    children,
  }
}

/** The family already using this email, if there is one. */
export async function familyWithEmail(
  ctx: ToolContext,
  email: string,
): Promise<{ ok: true; value: { id: string; name: string } | null } | { ok: false; error: string }> {
  const hit = await ctx.caller.db
    .from('families')
    .select('id, name')
    .ilike('email', exactPattern(email))
    .limit(1)
  if (hit.error !== null) return dbFailure('families', hit.error)
  return { ok: true, value: hit.data[0] ?? null }
}

const ENROLLMENT_FORM_COLUMNS =
  'id, submitted_at, status, family_name, primary_contact, relation, email, phone, address, secondary, emergency, children, notes, acknowledged_handbook'

/* ----------------------------- enrollment.decide --------------------------- */

const enrollmentDecide: ToolSpec = {
  name: 'enrollment_decide',
  tier: 'medium',
  description:
    'Approve or decline one enrollment form from Future Arrivals. Approving adds ' +
    'the family and the children on the form to the roster, exactly as the form ' +
    'was filled in; declining just marks it declined. Find the form with ' +
    'enrollment_list first. This does not happen on its own: she sees the whole ' +
    'form on a card and taps. Only do this when she has said which way to decide ' +
    '— never approve or decline because a form looks complete or looks like a ' +
    'duplicate; tell her what you see and let her say. Neither choice tells the ' +
    'family anything: this app sends no email, so she lets them know herself. ' +
    'Approving does not create a parent login — that is parent_login_create, ' +
    'afterwards.',
  parameters: schema(
    {
      enrollmentId: { type: 'string', description: 'From enrollment_list' },
      decision: { type: 'string', enum: ENROLLMENT_DECISIONS },
    },
    ['enrollmentId', 'decision'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const enrollmentId = readString(args, 'enrollmentId')
    if (enrollmentId === null) return { ok: false, error: 'An enrollmentId is required' }
    const rawDecision = readString(args, 'decision')
    if (rawDecision === null || !ENROLLMENT_DECISIONS.some((option) => option === rawDecision)) {
      return { ok: false, error: "decision must be 'approve' or 'decline'" }
    }
    const decision = readEnum(args, 'decision', ENROLLMENT_DECISIONS, 'decline')

    const form = await ctx.caller.db
      .from('enrollments')
      .select(ENROLLMENT_FORM_COLUMNS)
      .eq('id', enrollmentId)
      .maybeSingle()
    if (form.error !== null) return dbFailure('that enrollment form', form.error)
    if (form.data === null) {
      return { ok: true, data: { decided: false, reason: 'no enrollment form has that id', enrollmentId } }
    }
    if (form.data.status !== 'pending') {
      return {
        ok: true,
        data: { decided: false, reason: `that form was already ${form.data.status}`, enrollmentId },
      }
    }

    const snapshot = readEnrollmentSnapshot(form.data)
    if (decision === 'approve') {
      if (typeof snapshot === 'string') {
        return {
          ok: true,
          data: {
            decided: false,
            reason: `this form cannot be approved as it is: ${snapshot}`,
            tellHer:
              'Say exactly what is missing. She can add the family herself with the ' +
              'right details, or decline the form.',
          },
        }
      }
      const clash = await familyWithEmail(ctx, snapshot.email)
      if (!clash.ok) return { ok: false, error: clash.error }
      if (clash.value !== null) {
        return {
          ok: true,
          data: {
            decided: false,
            reason: `${snapshot.email} is already on file for ${clash.value.name}`,
            existingFamilyId: clash.value.id,
            tellHer:
              'Say which family already has that email and that this may be a repeat ' +
              'of a form she already approved. Let her decide whether to decline it.',
          },
        }
      }
    }

    const familyName = typeof snapshot === 'string' ? form.data.family_name : snapshot.familyName
    // A decline needs nothing from the form but its id; an approval carries the
    // snapshot that will be written.
    const payload: Record<string, unknown> =
      decision === 'approve' && typeof snapshot !== 'string'
        ? { enrollmentId, decision, ...snapshot }
        : { enrollmentId, decision, familyName }

    const key = `enrollment.decide:${enrollmentId}:${decision}`
    const seen = alreadyProposed(ctx, key)
    if (seen !== undefined) return proposed(seen)

    const logged = await propose(ctx, {
      instruction: ctx.instruction,
      tool: 'enrollment.decide',
      riskTier: 'medium',
      arguments: payload,
      subject: { familyLabel: familyName, targets: [enrollmentId] },
      model: ctx.model,
    })
    if (!logged.ok) return { ok: false, error: logged.error }

    const sent = prettyDate(form.data.submitted_at.slice(0, 10))
    let preview: ActionPreview

    if (decision === 'decline' || typeof snapshot === 'string') {
      preview = {
        id: logged.value,
        kind: 'enrollment.decide',
        title: 'Decline an enrollment form',
        summary: `Decline ${familyName}`,
        detail: [
          { label: 'Form from', value: familyName },
          { label: 'Sent', value: sent },
          {
            label: 'What happens',
            value:
              'Marks the form declined. Nothing is added to the roster. The family is ' +
              'not told — this app sends no email, so let them know yourself. A declined ' +
              'form cannot be approved afterwards.',
          },
        ],
        confirmLabel: 'Decline the form',
      }
    } else {
      const detail: { label: string; value: string }[] = [
        { label: 'Family', value: snapshot.familyName },
        {
          label: 'Main contact',
          value:
            snapshot.relation.length > 0
              ? `${snapshot.primaryContact} (${snapshot.relation})`
              : snapshot.primaryContact,
        },
        { label: 'Email', value: snapshot.email },
        { label: 'Phone', value: snapshot.phone },
        { label: 'Address', value: snapshot.address },
      ]
      for (const child of snapshot.children) {
        const parts = [`born ${prettyDate(child.dob)}`, child.ageGroup]
        if (child.plan.length > 0) parts.push(child.plan)
        if (child.startDate.length > 0) parts.push(`starts ${prettyDate(child.startDate)}`)
        detail.push({ label: child.name, value: parts.join(' · ') })
        if (child.schedule !== null) {
          detail.push({ label: `${child.name} — schedule`, value: formatWeeklySchedule(child.schedule, 'en-US') })
        }
        detail.push({
          label: `${child.name} — allergies`,
          value: child.allergies.length > 0 ? child.allergies.join(', ') : 'None recorded',
        })
        if (child.medications.length > 0) {
          detail.push({ label: `${child.name} — medications`, value: child.medications.join(', ') })
        }
        if (child.notes.length > 0) detail.push({ label: `${child.name} — notes`, value: child.notes })
      }
      if (snapshot.children.length === 0) {
        detail.push({ label: 'Children', value: 'None on the form.' })
      }
      detail.push({
        label: 'Emergency',
        value:
          snapshot.emergency.length > 0
            ? snapshot.emergency.map((contact) => `${contact.name} ${contact.phone}`.trim()).join('; ')
            : 'None on the form',
      })
      detail.push({ label: 'Handbook', value: snapshot.acknowledgedHandbook ? 'Acknowledged' : 'Not acknowledged' })
      if (snapshot.notes.length > 0) detail.push({ label: 'Their notes', value: snapshot.notes })
      detail.push({ label: 'Sent', value: sent })
      detail.push({
        label: 'What happens',
        value:
          'Adds the family and the children above to your roster as active, and marks ' +
          'the form approved. No parent login is made and the family is not told — ' +
          'this app sends no email.',
      })

      const count = snapshot.children.length
      preview = {
        id: logged.value,
        kind: 'enrollment.decide',
        title: 'Approve an enrollment form',
        summary:
          count === 0
            ? snapshot.familyName
            : `${snapshot.familyName} with ${count === 1 ? snapshot.children[0]?.name ?? '1 child' : `${String(count)} children`}`,
        detail,
        confirmLabel: 'Approve and enroll',
      }
    }

    rememberProposal(ctx, key, preview)
    return proposed(preview)
  },
}

export const enrollmentTools: ToolSpec[] = [enrollmentDecide]

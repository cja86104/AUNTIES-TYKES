/**
 * Changing an existing family or child — plan §3's `family.mutate`, the "change"
 * half. The "add" half is `family_add` in ./families.ts.
 *
 * These are the "Edit details" dialogs on a family's page and a child's page, as
 * tools. Both wait for her tap; the writes are `updateFamilyExecutor` and
 * `updateChildExecutor` in `../execute.ts`, behind `api/ai/confirm.ts`.
 *
 * How they differ from the dialogs, and why:
 *
 *  - Only what she names changes. The dialog saves the whole form; a tool that
 *    did that would put back every field the model left out. So the proposal
 *    stores each changed column's value before and after, and the card shows
 *    exactly those lines.
 *  - The executor checks that each "before" is still what is on file, and saves
 *    nothing if one moved. The card may sit for a while, and the console can edit
 *    the same family in the meantime; writing over that would undo her own edit
 *    without a word.
 *  - Lists are changed by adding and removing, never replaced. Allergies,
 *    medications and emergency contacts are the safety fields; a model asked to
 *    "add eggs" that rewrote the list from memory could drop a peanut allergy. A
 *    removal names the item, and the card calls it out on its own line.
 *  - Writes are column updates on the same columns the dialogs write — the jsonb
 *    `secondary` and `emergency`, not migration 0005's `family_contacts`, which
 *    nothing in the app reads (plan §3's schema note).
 *
 * Deliberately NOT here:
 *  - A child's weekly schedule. The child dialog edits it in place, and parents
 *    get no "New" marker for that. Ro changes schedules through
 *    `schedule_plan_set` and `schedule_change_set`, which the parent portal does
 *    flag — the owner's rule is that anything new for a parent comes with a way
 *    to notice it.
 *  - Moving a child to another family. That changes which parent login can see
 *    the child — the family-isolation boundary — and stays in the console.
 *  - The parent login's own email. Changing the family's email does not change
 *    the address they sign in with, and the card says so.
 *
 * Every validation rule is the console's: `validateFamilyForm` in
 * src/components/FamilyForm.tsx and `validateChildForm` in
 * src/components/ChildForm.tsx, applied to the record as it would be after the
 * change. FamilyForm's limit of four emergency contacts holds here too.
 */

import type { Contact } from '../../../../src/types.js'
import type { ChildRow, FamilyRow } from '../../../../src/lib/database.types.js'
import { propose } from '../audit.js'
import { prettyDate } from '../clock.js'
import { money } from '../projection.js'
import { toCents } from './billing.js'
import { AGE_GROUPS, CHILD_STATUSES, EMAIL, exactPattern, pick, readList, RELATIONS } from './families.js'
import {
  alreadyProposed,
  dbFailure,
  proposed,
  readBoolean,
  readDate,
  readString,
  rememberProposal,
  schema,
  type ActionPreview,
  type ToolContext,
  type ToolOutcome,
  type ToolSpec,
} from './kit.js'

const MAX_NAME = 120
const MAX_TEXT = 500
/** FamilyForm hides "Add contact" at four. */
const MAX_EMERGENCY = 4
/** The same cap readList applies when a child is added. */
const MAX_LIST_ITEMS = 12

/* --------------------------------- shared ---------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * JSON with object keys sorted, so the same value read twice compares equal.
 * Postgres hands jsonb back in its own key order, not the order it was written.
 */
export function canonical(value: unknown): string {
  if (value === undefined) return 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function text(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value.trim().slice(0, MAX_NAME) : ''
}

/** A contact from untrusted JSON, or null when it is not one. */
function readContact(raw: unknown): Contact | null {
  if (!isRecord(raw)) return null
  return { name: text(raw, 'name'), relation: text(raw, 'relation'), phone: text(raw, 'phone') }
}

const blankContact = (contact: Contact): boolean =>
  contact.name.length === 0 && contact.relation.length === 0 && contact.phone.length === 0

function describeContact(contact: Contact): string {
  if (blankContact(contact)) return 'none'
  const relation = contact.relation.length > 0 ? ` (${contact.relation})` : ''
  const phone = contact.phone.length > 0 ? ` · ${contact.phone}` : ''
  return `${contact.name.length > 0 ? contact.name : 'No name'}${relation}${phone}`
}

function describeContacts(contacts: readonly Contact[]): string {
  const real = contacts.filter((contact) => !blankContact(contact))
  return real.length === 0 ? 'none' : real.map(describeContact).join('; ')
}

const describeList = (items: readonly string[]): string => (items.length === 0 ? 'none' : items.join(', '))
const describeText = (value: string): string => (value.length === 0 ? '(blank)' : value)

/** A dollar amount of 0 or more, from a number or a numeric string. */
function readRate(value: unknown): number | null {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[$,\s]/g, '')) : NaN
  return Number.isFinite(parsed) && parsed >= 0 ? toCents(parsed) : null
}

/**
 * A list with removals and additions applied. Removal matches case-insensitively
 * and must find the item — a removal that matches nothing is refused with what
 * is on file, rather than silently doing nothing. Removals run first, so an item
 * can be removed and re-added with new wording in one call.
 */
export function editList(
  current: readonly string[],
  add: readonly string[],
  remove: readonly string[],
  what: string,
): { list: string[]; removed: string[] } | string {
  const list = [...current]
  const removed: string[] = []
  for (const item of remove) {
    const at = list.findIndex((entry) => entry.toLowerCase() === item.toLowerCase())
    if (at === -1) return `"${item}" is not in the ${what} on file (on file: ${describeList(current)})`
    const [gone] = list.splice(at, 1)
    removed.push(gone ?? item)
  }
  for (const item of add) {
    if (!list.some((entry) => entry.toLowerCase() === item.toLowerCase())) list.push(item)
  }
  if (list.length > MAX_LIST_ITEMS) return `That is more than ${String(MAX_LIST_ITEMS)} ${what}`
  return { list, removed }
}

/** One line on the card. */
interface CardLine {
  label: string
  value: string
}

/* ------------------------------ family.update ------------------------------ */

const FAMILY_TEXT = ['name', 'primary_contact', 'relation', 'email', 'phone', 'address', 'notes'] as const
type FamilyTextColumn = (typeof FAMILY_TEXT)[number]

/** The family columns this tool can change — the ones the Edit details dialog writes. */
export type FamilyChanges = Partial<
  Pick<FamilyRow, FamilyTextColumn | 'custom_weekly_rate' | 'secondary' | 'emergency'>
>

const FAMILY_LABELS: Record<keyof FamilyChanges, string> = {
  name: 'Family name',
  primary_contact: 'Main contact',
  relation: 'Relation',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  notes: 'Notes',
  custom_weekly_rate: 'Weekly rate',
  secondary: 'Second guardian',
  emergency: 'Emergency contacts',
}

function describeFamilyValue(column: keyof FamilyChanges, changes: FamilyChanges): string {
  switch (column) {
    case 'custom_weekly_rate': {
      const rate = changes.custom_weekly_rate
      return rate === null || rate === undefined ? 'none on file' : `${money(rate)} per child per week`
    }
    case 'secondary':
      return changes.secondary === undefined ? 'none' : describeContact(changes.secondary)
    case 'emergency':
      return describeContacts(changes.emergency ?? [])
    default:
      return describeText(changes[column] ?? '')
  }
}

/**
 * Family changes read back out of a stored proposal. A string is what is wrong.
 * Only the columns above are accepted, each with its own type.
 */
export function readFamilyChanges(raw: unknown): FamilyChanges | string {
  if (!isRecord(raw)) return 'the changes are not readable'
  const out: FamilyChanges = {}
  for (const column of FAMILY_TEXT) {
    if (!(column in raw)) continue
    const value = raw[column]
    if (typeof value !== 'string') return `${column} is not text`
    out[column] = value
  }
  if ('custom_weekly_rate' in raw) {
    const value = raw.custom_weekly_rate
    if (value === null) out.custom_weekly_rate = null
    else if (typeof value === 'number' && Number.isFinite(value) && value >= 0) out.custom_weekly_rate = value
    else return 'the weekly rate is not a valid amount'
  }
  if ('secondary' in raw) {
    const contact = readContact(raw.secondary)
    if (contact === null) return 'the second guardian is not readable'
    out.secondary = contact
  }
  if ('emergency' in raw) {
    const list = raw.emergency
    if (!Array.isArray(list) || list.length > MAX_EMERGENCY) return 'the emergency contacts are not readable'
    const contacts: Contact[] = []
    for (const entry of list) {
      const contact = readContact(entry)
      if (contact === null) return 'an emergency contact is not readable'
      contacts.push(contact)
    }
    out.emergency = contacts
  }
  return out
}

/** The values on file now, for each column being changed. */
export function familyBefore(row: FamilyRow, after: FamilyChanges): FamilyChanges {
  const before: FamilyChanges = {}
  for (const column of FAMILY_TEXT) if (column in after) before[column] = row[column]
  if ('custom_weekly_rate' in after) before.custom_weekly_rate = row.custom_weekly_rate
  if ('secondary' in after) before.secondary = row.secondary
  if ('emergency' in after) before.emergency = row.emergency
  return before
}

/** validateFamilyForm, on the family as it would be after the change. */
function familyProblem(merged: FamilyRow): string | null {
  if (merged.name.trim().length < 2) return 'The family needs a name of at least 2 characters'
  if (merged.primary_contact.trim().length < 2) return 'The family needs a main contact'
  if (!EMAIL.test(merged.email.trim())) return 'The family needs a valid email address'
  if (merged.phone.trim().length < 7) return 'The family needs a phone number of at least 7 characters'
  if (merged.address.trim().length < 6) return 'The family needs a home address'
  return null
}

/** The name of another family already using this email, or null. */
export async function familyUsingEmail(
  ctx: ToolContext,
  email: string,
  exceptFamilyId: string,
): Promise<{ ok: true; name: string | null } | { ok: false; error: string }> {
  const clash = await ctx.caller.db
    .from('families')
    .select('id, name')
    .ilike('email', exactPattern(email))
    .neq('id', exceptFamilyId)
    .limit(1)
  if (clash.error !== null) return { ok: false, error: `Could not check that email: ${clash.error.message}` }
  return { ok: true, name: clash.data[0]?.name ?? null }
}

const familyUpdate: ToolSpec = {
  name: 'family_update',
  tier: 'medium',
  description:
    "Change an existing family's details — the same as Edit details on their page: " +
    'name, main contact, relation, email, phone, address, notes, the weekly tuition ' +
    'rate, the second guardian and emergency contacts. Find the family with ' +
    'family_find, and read it with family_get first. Pass ONLY what she asked to ' +
    'change; everything else stays as it is. It does not save on its own: she sees ' +
    'each change as before → after and taps. notes replaces the whole note, so to ' +
    'add to it, include the existing text. Emergency contacts are added and removed ' +
    'by name, never retyped: to change one, remove it and add it again in the same ' +
    'call. Use weeklyRate only with an amount she said. For a child, use child_update.',
  parameters: schema(
    {
      familyId: { type: 'string', description: 'From family_find' },
      name: { type: 'string' },
      primaryContact: { type: 'string' },
      relation: { type: 'string', enum: RELATIONS },
      email: { type: 'string', description: 'Does not change the email their portal login signs in with' },
      phone: { type: 'string' },
      address: { type: 'string' },
      notes: { type: 'string', description: 'Replaces the whole note' },
      weeklyRate: { type: 'number', description: 'Dollars per child per week, as she said it' },
      clearWeeklyRate: { type: 'boolean', description: 'True to remove the rate on file' },
      secondary: {
        type: 'object',
        description: 'Second guardian; fields left out keep what is on file',
        properties: { name: { type: 'string' }, relation: { type: 'string' }, phone: { type: 'string' } },
        additionalProperties: false,
      },
      clearSecondary: { type: 'boolean', description: 'True to remove the second guardian' },
      addEmergencyContacts: {
        type: 'array',
        maxItems: MAX_EMERGENCY,
        items: schema(
          { name: { type: 'string' }, relation: { type: 'string' }, phone: { type: 'string' } },
          ['name', 'phone'],
        ),
      },
      removeEmergencyContacts: {
        type: 'array',
        items: { type: 'string' },
        description: 'Names of emergency contacts to take off, as on file',
      },
    },
    ['familyId'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const familyId = readString(args, 'familyId')
    if (familyId === null) return { ok: false, error: 'A familyId is required' }

    const read = await ctx.caller.db.from('families').select('*').eq('id', familyId).maybeSingle()
    if (read.error !== null) return dbFailure('that family', read.error)
    if (read.data === null) return { ok: true, data: { updated: false, reason: 'no family has that id', familyId } }
    const row: FamilyRow = read.data

    const after: FamilyChanges = {}
    const setText = (arg: string, column: FamilyTextColumn, max: number): void => {
      const value = readString(args, arg)?.slice(0, max)
      if (value !== undefined && value !== row[column]) after[column] = value
    }
    setText('name', 'name', MAX_NAME)
    setText('primaryContact', 'primary_contact', MAX_NAME)
    setText('email', 'email', 254)
    setText('phone', 'phone', 40)
    setText('address', 'address', MAX_TEXT)
    setText('notes', 'notes', MAX_TEXT)

    const relationRaw = readString(args, 'relation')
    if (relationRaw !== null) {
      const relation = pick(relationRaw, RELATIONS)
      if (relation === null) return { ok: false, error: `The relation must be one of: ${RELATIONS.join(', ')}` }
      if (relation !== row.relation) after.relation = relation
    }

    const clearRate = readBoolean(args, 'clearWeeklyRate', false)
    if (clearRate && args.weeklyRate !== undefined) {
      return { ok: false, error: 'Give a new weeklyRate or clearWeeklyRate, not both' }
    }
    if (args.weeklyRate !== undefined) {
      const rate = readRate(args.weeklyRate)
      if (rate === null) return { ok: false, error: 'The weekly rate must be $0 or more' }
      if (rate !== row.custom_weekly_rate) after.custom_weekly_rate = rate
    } else if (clearRate && row.custom_weekly_rate !== null) {
      after.custom_weekly_rate = null
    }

    const clearSecondary = readBoolean(args, 'clearSecondary', false)
    if (clearSecondary && args.secondary !== undefined) {
      return { ok: false, error: 'Give the second guardian or clearSecondary, not both' }
    }
    if (args.secondary !== undefined) {
      if (!isRecord(args.secondary)) return { ok: false, error: 'The second guardian is not readable' }
      const given = args.secondary
      const merged: Contact = {
        name: 'name' in given ? text(given, 'name') : row.secondary.name,
        relation: 'relation' in given ? text(given, 'relation') : row.secondary.relation,
        phone: 'phone' in given ? text(given, 'phone') : row.secondary.phone,
      }
      if (canonical(merged) !== canonical(row.secondary)) after.secondary = merged
    } else if (clearSecondary && !blankContact(row.secondary)) {
      after.secondary = { name: '', relation: '', phone: '' }
    }

    // Emergency contacts. The dialog can leave a blank row behind; it is not a
    // contact, so it is dropped when the list is rewritten.
    const removeNames = readList(args.removeEmergencyContacts)
    const addRaw = args.addEmergencyContacts
    if (addRaw !== undefined && !Array.isArray(addRaw)) {
      return { ok: false, error: 'addEmergencyContacts must be a list' }
    }
    const addList: unknown[] = Array.isArray(addRaw) ? addRaw : []
    const removedContacts: Contact[] = []
    if (removeNames.length > 0 || addList.length > 0) {
      const list = row.emergency.filter((contact) => !blankContact(contact))
      for (const name of removeNames) {
        const at = list.findIndex((contact) => contact.name.toLowerCase() === name.toLowerCase())
        if (at === -1) {
          return {
            ok: false,
            error: `There is no emergency contact called "${name}" (on file: ${describeContacts(row.emergency)})`,
          }
        }
        const [gone] = list.splice(at, 1)
        if (gone !== undefined) removedContacts.push(gone)
      }
      for (const entry of addList) {
        const contact = readContact(entry)
        if (contact === null || contact.name.length < 2 || contact.phone.length < 7) {
          return { ok: false, error: 'Each new emergency contact needs a name and a phone number' }
        }
        if (list.some((existing) => existing.name.toLowerCase() === contact.name.toLowerCase())) {
          return {
            ok: false,
            error: `${contact.name} is already an emergency contact — to change them, remove and add them in the same call`,
          }
        }
        list.push(contact)
      }
      if (list.length > MAX_EMERGENCY) {
        return { ok: false, error: `A family can have at most ${String(MAX_EMERGENCY)} emergency contacts` }
      }
      if (canonical(list) !== canonical(row.emergency)) after.emergency = list
    }

    const columns = Object.keys(after) as (keyof FamilyChanges)[]
    if (columns.length === 0) {
      return {
        ok: true,
        data: { updated: false, reason: 'nothing she asked for differs from what is on file', familyId },
      }
    }

    const problem = familyProblem({ ...row, ...after })
    if (problem !== null) return { ok: false, error: `${problem} — ask her for it.` }

    if (after.email !== undefined) {
      const clash = await familyUsingEmail(ctx, after.email, familyId)
      if (!clash.ok) return { ok: false, error: clash.error }
      if (clash.name !== null) {
        return { ok: true, data: { updated: false, reason: `${clash.name} already uses ${after.email}`, familyId } }
      }
    }

    const before = familyBefore(row, after)
    const payload = { familyId, familyLabel: row.name, before, after }
    const key = `family.update:${canonical(payload)}`
    const seen = alreadyProposed(ctx, key)
    if (seen !== undefined) return proposed(seen)

    const touchesRate = 'custom_weekly_rate' in after
    const logged = await propose(ctx, {
      instruction: ctx.instruction,
      tool: 'family.update',
      // §3 files a rate change under Money: a quiet edit there is a price change.
      riskTier: touchesRate ? 'money' : 'medium',
      arguments: payload,
      subject: { familyId, familyLabel: row.name, targets: [familyId] },
      model: ctx.model,
    })
    if (!logged.ok) return { ok: false, error: logged.error }

    const detail: CardLine[] = [{ label: 'Family', value: row.name }]
    for (const column of columns) {
      detail.push({
        label: FAMILY_LABELS[column],
        value: `${describeFamilyValue(column, before)} → ${describeFamilyValue(column, after)}`,
      })
    }
    if (removedContacts.length > 0) {
      detail.push({
        label: 'Careful',
        value: `Takes ${removedContacts.map((contact) => contact.name).join(' and ')} off their emergency contacts.`,
      })
    }
    if (after.email !== undefined) {
      detail.push({
        label: 'Careful',
        value:
          'This changes the email on file only. If they already have a portal login, they still ' +
          'sign in with the old one.',
      })
    }
    if (touchesRate) {
      detail.push({
        label: 'Careful',
        value: 'Invoice prefill uses the new rate from now on. Invoices already issued keep their amounts.',
      })
    }
    detail.push({
      label: 'What happens',
      value: 'Updates their details — the same as Edit details on their page. Nothing is sent to them.',
    })

    const preview: ActionPreview = {
      id: logged.value,
      kind: 'family.update',
      title: 'Update a family',
      summary: `${row.name}: ${columns.map((column) => FAMILY_LABELS[column].toLowerCase()).join(', ')}`,
      detail,
      confirmLabel: 'Save the changes',
    }
    rememberProposal(ctx, key, preview)
    return proposed(preview)
  },
}

/* ------------------------------- child.update ------------------------------ */

const CHILD_TEXT = ['name', 'dob', 'age_group', 'status', 'start_date', 'teacher', 'notes'] as const

/** The child columns this tool can change — the dialog's, less schedule and family. */
export type ChildChanges = Partial<
  Pick<
    ChildRow,
    'name' | 'dob' | 'age_group' | 'status' | 'start_date' | 'teacher' | 'notes' | 'allergies' | 'medications'
  >
>

const CHILD_LABELS: Record<keyof ChildChanges, string> = {
  name: 'Name',
  dob: 'Date of birth',
  age_group: 'Age group',
  status: 'Status',
  start_date: 'Start date',
  teacher: 'Teacher',
  notes: 'Notes',
  allergies: 'Allergies',
  medications: 'Medications',
}

function describeChildValue(column: keyof ChildChanges, changes: ChildChanges): string {
  switch (column) {
    case 'allergies':
      return describeList(changes.allergies ?? [])
    case 'medications':
      return describeList(changes.medications ?? [])
    case 'dob':
      return changes.dob === undefined ? '(blank)' : prettyDate(changes.dob)
    case 'start_date':
      return changes.start_date === null || changes.start_date === undefined
        ? '(blank)'
        : prettyDate(changes.start_date)
    case 'status':
      return changes.status === 'waitlist' ? 'Waitlist' : 'Active'
    default:
      return describeText(changes[column] ?? '')
  }
}

function readStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const items: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') return null
    items.push(entry)
  }
  return items.length > MAX_LIST_ITEMS ? null : items
}

/** Child changes read back out of a stored proposal. A string is what is wrong. */
export function readChildChanges(raw: unknown): ChildChanges | string {
  if (!isRecord(raw)) return 'the changes are not readable'
  const out: ChildChanges = {}
  for (const column of CHILD_TEXT) {
    if (!(column in raw)) continue
    const value = raw[column]
    if (column === 'start_date' && value === null) {
      out.start_date = null
      continue
    }
    if (typeof value !== 'string') return `${column} is not text`
    if (column === 'age_group') {
      const group = pick(value, AGE_GROUPS)
      if (group === null) return 'the age group is not one of the options'
      out.age_group = group
    } else if (column === 'status') {
      const status = pick(value, CHILD_STATUSES)
      if (status === null) return 'the status is not one of the options'
      out.status = status
    } else {
      out[column] = value
    }
  }
  for (const column of ['allergies', 'medications'] as const) {
    if (!(column in raw)) continue
    const list = readStringList(raw[column])
    if (list === null) return `${column} is not a list`
    out[column] = list
  }
  return out
}

/** The values on file now, for each column being changed. */
export function childBefore(row: ChildRow, after: ChildChanges): ChildChanges {
  const before: ChildChanges = {}
  if ('name' in after) before.name = row.name
  if ('dob' in after) before.dob = row.dob
  if ('age_group' in after) before.age_group = row.age_group
  if ('status' in after) before.status = row.status
  if ('start_date' in after) before.start_date = row.start_date
  if ('teacher' in after) before.teacher = row.teacher
  if ('notes' in after) before.notes = row.notes
  if ('allergies' in after) before.allergies = row.allergies
  if ('medications' in after) before.medications = row.medications
  return before
}

/** validateChildForm, on the child as they would be after the change. */
function childProblem(merged: ChildRow, today: string): string | null {
  if (merged.name.trim().length < 2) return 'The child needs a name of at least 2 characters'
  if (merged.dob.length === 0) return 'The child needs a date of birth'
  if (merged.dob > today) return 'That date of birth is in the future'
  if (merged.start_date === null || merged.start_date.length === 0) return 'The child needs a start date'
  return null
}

const childUpdate: ToolSpec = {
  name: 'child_update',
  tier: 'medium',
  description:
    "Change an existing child's details — the same as Edit details on their page: " +
    'name, date of birth, age group, status (active, or waitlist), start date, ' +
    'teacher, notes, allergies and medications. Find the child with roster_list or ' +
    'family_get first. Pass ONLY what she asked to change. It does not save on its ' +
    'own: she sees each change as before → after and taps. Allergies and ' +
    'medications are added and removed by name, never retyped — only add or remove ' +
    'what she said. notes replaces the whole note, so to add to it, include the ' +
    'existing text. Do NOT use this for the days or times a child comes: use ' +
    'schedule_plan_set for a new usual week from a later date, or ' +
    'schedule_change_set for one date. A child cannot be moved to another family here.',
  parameters: schema(
    {
      childId: { type: 'string', description: 'From roster_list or family_get' },
      name: { type: 'string' },
      dob: { type: 'string', description: 'Date of birth, yyyy-MM-dd' },
      ageGroup: { type: 'string', enum: AGE_GROUPS },
      status: { type: 'string', enum: CHILD_STATUSES, description: 'waitlist takes them off the expected roster' },
      startDate: { type: 'string', description: 'yyyy-MM-dd' },
      teacher: { type: 'string' },
      notes: { type: 'string', description: 'Replaces the whole note' },
      addAllergies: { type: 'array', items: { type: 'string' } },
      removeAllergies: { type: 'array', items: { type: 'string' } },
      addMedications: { type: 'array', items: { type: 'string' } },
      removeMedications: { type: 'array', items: { type: 'string' } },
    },
    ['childId'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const childId = readString(args, 'childId')
    if (childId === null) return { ok: false, error: 'A childId is required' }

    const read = await ctx.caller.db.from('children').select('*').eq('id', childId).maybeSingle()
    if (read.error !== null) return dbFailure('that child', read.error)
    if (read.data === null) return { ok: true, data: { updated: false, reason: 'no child has that id', childId } }
    const row: ChildRow = read.data

    const after: ChildChanges = {}
    const name = readString(args, 'name')?.slice(0, MAX_NAME)
    if (name !== undefined && name !== row.name) after.name = name
    const teacher = readString(args, 'teacher')?.slice(0, MAX_NAME)
    if (teacher !== undefined && teacher !== row.teacher) after.teacher = teacher
    const notes = readString(args, 'notes')?.slice(0, MAX_TEXT)
    if (notes !== undefined && notes !== row.notes) after.notes = notes

    if (args.dob !== undefined) {
      const dob = readDate(args, 'dob')
      if (dob === null) return { ok: false, error: 'The date of birth must be yyyy-MM-dd' }
      if (dob !== row.dob) after.dob = dob
    }
    if (args.startDate !== undefined) {
      const startDate = readDate(args, 'startDate')
      if (startDate === null) return { ok: false, error: 'The start date must be yyyy-MM-dd' }
      if (startDate !== row.start_date) after.start_date = startDate
    }
    const groupRaw = readString(args, 'ageGroup')
    if (groupRaw !== null) {
      const group = pick(groupRaw, AGE_GROUPS)
      if (group === null) return { ok: false, error: `The age group must be one of: ${AGE_GROUPS.join(', ')}` }
      if (group !== row.age_group) after.age_group = group
    }
    const statusRaw = readString(args, 'status')
    if (statusRaw !== null) {
      const status = pick(statusRaw, CHILD_STATUSES)
      if (status === null) return { ok: false, error: `The status must be one of: ${CHILD_STATUSES.join(', ')}` }
      if (status !== row.status) after.status = status
    }

    const allergies = editList(row.allergies, readList(args.addAllergies), readList(args.removeAllergies), 'allergies')
    if (typeof allergies === 'string') return { ok: false, error: allergies }
    if (canonical(allergies.list) !== canonical(row.allergies)) after.allergies = allergies.list
    const medications = editList(
      row.medications,
      readList(args.addMedications),
      readList(args.removeMedications),
      'medications',
    )
    if (typeof medications === 'string') return { ok: false, error: medications }
    if (canonical(medications.list) !== canonical(row.medications)) after.medications = medications.list

    const columns = Object.keys(after) as (keyof ChildChanges)[]
    if (columns.length === 0) {
      return {
        ok: true,
        data: { updated: false, reason: 'nothing she asked for differs from what is on file', childId },
      }
    }

    const problem = childProblem({ ...row, ...after }, ctx.today)
    if (problem !== null) return { ok: false, error: `${problem} — ask her for it.` }

    const family = await ctx.caller.db.from('families').select('name').eq('id', row.family_id).maybeSingle()
    if (family.error !== null) return dbFailure('their family', family.error)
    const familyLabel = family.data?.name ?? ''

    const before = childBefore(row, after)
    const payload = { childId, childLabel: row.name, familyId: row.family_id, before, after }
    const key = `child.update:${canonical(payload)}`
    const seen = alreadyProposed(ctx, key)
    if (seen !== undefined) return proposed(seen)

    const logged = await propose(ctx, {
      instruction: ctx.instruction,
      tool: 'child.update',
      riskTier: 'medium',
      arguments: payload,
      subject: { familyId: row.family_id, familyLabel, childId, childLabel: row.name, targets: [childId] },
      model: ctx.model,
    })
    if (!logged.ok) return { ok: false, error: logged.error }

    const detail: CardLine[] = [
      { label: 'Child', value: familyLabel.length > 0 ? `${row.name} — ${familyLabel}` : row.name },
    ]
    for (const column of columns) {
      detail.push({
        label: CHILD_LABELS[column],
        value: `${describeChildValue(column, before)} → ${describeChildValue(column, after)}`,
      })
    }
    const removedSafety = [...allergies.removed, ...medications.removed]
    if (removedSafety.length > 0) {
      detail.push({
        label: 'Careful',
        value:
          `Takes ${removedSafety.join(' and ')} off ${row.name}'s profile. It will no longer show ` +
          `anywhere ${row.name}'s allergies and medications are listed.`,
      })
    }
    if (after.status === 'waitlist') {
      detail.push({
        label: 'Careful',
        value:
          `${row.name} will no longer be expected on the attendance page or in today's headcount ` +
          'until set back to active.',
      })
    }
    detail.push({
      label: 'What happens',
      value: 'Updates their profile — the same as Edit details on their page. Nothing is sent to the family.',
    })

    const preview: ActionPreview = {
      id: logged.value,
      kind: 'child.update',
      title: 'Update a child',
      summary: `${row.name}: ${columns.map((column) => CHILD_LABELS[column].toLowerCase()).join(', ')}`,
      detail,
      confirmLabel: 'Save the changes',
    }
    rememberProposal(ctx, key, preview)
    return proposed(preview)
  },
}

export const familyEditTools: ToolSpec[] = [familyUpdate, childUpdate]

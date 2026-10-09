/**
 * Adding a family — plan §3's `family.mutate`, the "add" half.
 *
 * Exists so a parent login can be made from Ro: a login hangs off a family, and
 * a new family could only be created from the console until now. This is the
 * "Add family" dialog on the Families page, as a tool — the family record plus,
 * optionally, its children in the same step, exactly as that dialog offers.
 *
 * It waits for her tap like every Medium-tier action; the write is
 * `addFamilyExecutor` in `../execute.ts`, behind `api/ai/confirm.ts`.
 *
 * Every rule here is copied from the console rather than invented:
 *  - `validateFamilyForm` in src/components/FamilyForm.tsx — name and main
 *    contact at least 2 characters, a valid email, phone at least 7, address at
 *    least 6.
 *  - `validateChildForm` / `formToChild` in src/components/ChildForm.tsx — name
 *    at least 2, a date of birth and a start date, teacher defaulting to
 *    "Auntie Melissa", and a weekly schedule that is optional: left out, the
 *    child is "schedule not set", never guessed. The legacy `plan` text is no
 *    longer written.
 *  - The age groups and relations are the same option lists those forms
 *    offer. If one list changes, change both.
 *
 * Deliberately NOT here: the secondary contact, emergency contacts and a custom
 * weekly rate — a card that tries to show all of it at once stops being readable.
 * They are filled in afterwards with `family_update`, which is also where every
 * change to an existing family or child lives (./familyEdits.ts).
 */

import type { WeeklySchedule } from '../../../../src/types.js'
import { formatWeeklySchedule } from '../../../../src/lib/schedule.js'
import { propose } from '../audit.js'
import { prettyDate } from '../clock.js'
import {
  alreadyProposed,
  dbFailure,
  proposed,
  readDate,
  readString,
  rememberProposal,
  schema,
  type ActionPreview,
  type ToolOutcome,
  type ToolSpec,
} from './kit.js'
import { readWeek, WEEK_SCHEMA } from './schedules.js'

/** Mirrors AGE_GROUPS in src/components/ChildForm.tsx and the `age_group` enum. */
export const AGE_GROUPS = ['Infant', 'Toddler', 'Preschool'] as const
export type AgeGroup = (typeof AGE_GROUPS)[number]

/** Mirrors the `child_status` enum. */
export const CHILD_STATUSES = ['active', 'waitlist'] as const
export type ChildStatus = (typeof CHILD_STATUSES)[number]

/** Mirrors the relation options in src/components/FamilyForm.tsx. */
export const RELATIONS = ['Mother', 'Father', 'Grandparent', 'Legal guardian', 'Other'] as const

/** formToChild's default teacher. */
export const DEFAULT_TEACHER = 'Auntie Melissa'

/** Mirrors CHILD_HUES in src/store/useStore.ts — the avatar gradients, in order. */
const CHILD_HUES = [
  'from-[#3F8570] to-[#7DA0F0]',
  'from-[#D98B9B] to-[#8FE0C9]',
  'from-[#F5B942] to-[#F9D28A]',
  'from-[#E86A6A] to-[#F49C9C]',
  'from-[#8B6ED9] to-[#B49CEE]',
  'from-[#4FB0C6] to-[#8FD7E4]',
] as const

/** Mirrors `pickHue` in src/store/useStore.ts: cycled by how many children exist. */
export function pickHue(index: number): string {
  return CHILD_HUES[index % CHILD_HUES.length] ?? CHILD_HUES[0]
}

/**
 * A value for an `ilike` filter that matches only itself.
 *
 * `%` and `_` are wildcards there, and `_` is common in email addresses — an
 * unescaped `j_doe@x.com` would also match `jxdoe@x.com` and report a clash that
 * is not one.
 */
export function exactPattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

/** The console's email check, character for character. */
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** More than this many children in one family is a misread, not a family. */
const MAX_CHILDREN = 6
const MAX_TEXT = 500
const MAX_LIST_ITEMS = 12

export interface PendingChild {
  name: string
  dob: string
  ageGroup: AgeGroup
  /** Null = not given; the child is added as "schedule not set". */
  schedule: WeeklySchedule | null
  startDate: string
  status: ChildStatus
  allergies: string[]
  medications: string[]
  notes: string
}

export interface PendingFamily {
  name: string
  primaryContact: string
  relation: string
  email: string
  phone: string
  address: string
  notes: string
  children: PendingChild[]
}

/** Case-insensitive match against a fixed option list, returning its spelling. */
export function pick<T extends string>(raw: string | null, options: readonly T[]): T | null {
  if (raw === null) return null
  return options.find((option) => option.toLowerCase() === raw.toLowerCase()) ?? null
}

/** A list of short strings — from an array, or from "peanuts, eggs" text. */
export function readList(value: unknown): string[] {
  const items: string[] = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : typeof value === 'string'
      ? value.split(',')
      : []
  return items
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, MAX_LIST_ITEMS)
    .map((item) => item.slice(0, 120))
}

/**
 * Reads one child, applying ChildForm's rules. A string is the reason it fails.
 *
 * Used twice: on the model's arguments when proposing, and on the stored
 * proposal when executing. Both are untrusted by the time they arrive here — one
 * is model output, the other came back out of jsonb — so neither is cast.
 */
function readChild(raw: unknown, index: number, today: string): PendingChild | string {
  const which = `Child ${String(index + 1)}`
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return `${which} is not readable`
  const args = raw as Record<string, unknown>

  const name = readString(args, 'name')?.slice(0, 120) ?? ''
  if (name.length < 2) return `${which} needs a name`
  const dob = readDate(args, 'dob')
  if (dob === null) return `${name} needs a date of birth (yyyy-MM-dd)`
  if (dob > today) return `${name}'s date of birth is in the future`
  const startDate = readDate(args, 'startDate')
  if (startDate === null) return `${name} needs a start date (yyyy-MM-dd)`
  const ageGroup = pick(readString(args, 'ageGroup'), AGE_GROUPS)
  if (ageGroup === null) return `${name} needs an age group: ${AGE_GROUPS.join(', ')}`
  let schedule: WeeklySchedule | null = null
  if (args.schedule !== undefined && args.schedule !== null) {
    const week = readWeek(args.schedule)
    if (typeof week === 'string') return `${name}: ${week}`
    schedule = week
  }
  const status = pick(readString(args, 'status'), CHILD_STATUSES) ?? 'active'

  return {
    name,
    dob,
    ageGroup,
    schedule,
    startDate,
    status,
    allergies: readList(args.allergies),
    medications: readList(args.medications),
    notes: readString(args, 'notes')?.slice(0, MAX_TEXT) ?? '',
  }
}

/** Reads a whole family, applying FamilyForm's rules. A string is the reason it fails. */
export function readPendingFamily(args: Record<string, unknown>, today: string): PendingFamily | string {
  const name = readString(args, 'name')?.slice(0, 120) ?? ''
  if (name.length < 2) return 'Give the family a name'
  const primaryContact = readString(args, 'primaryContact')?.slice(0, 120) ?? ''
  if (primaryContact.length < 2) return 'Who is the main contact?'
  const email = readString(args, 'email')?.slice(0, 254) ?? ''
  if (!EMAIL.test(email)) return 'A valid email address is required'
  const phone = readString(args, 'phone')?.slice(0, 40) ?? ''
  if (phone.length < 7) return 'A phone number is required'
  const address = readString(args, 'address')?.slice(0, MAX_TEXT) ?? ''
  if (address.length < 6) return 'A home address is required'

  // Optional, and blank rather than guessed when she did not say. The console
  // form pre-selects "Mother"; a tool has no business assuming that.
  const relation = pick(readString(args, 'relation'), RELATIONS) ?? ''

  const rawChildren = args.children
  const childList: unknown[] = Array.isArray(rawChildren) ? rawChildren : []
  if (childList.length > MAX_CHILDREN) return `That is more than ${String(MAX_CHILDREN)} children for one family`
  const children: PendingChild[] = []
  for (const [index, entry] of childList.entries()) {
    const child = readChild(entry, index, today)
    if (typeof child === 'string') return child
    children.push(child)
  }

  return {
    name,
    primaryContact,
    relation,
    email,
    phone,
    address,
    notes: readString(args, 'notes')?.slice(0, MAX_TEXT) ?? '',
    children,
  }
}

/* -------------------------------- family.add ------------------------------- */

const familyAdd: ToolSpec = {
  name: 'family_add',
  tier: 'medium',
  description:
    'Add a new family, and optionally their children, the same as "Add family" in ' +
    'the console. Use it when the owner wants a family on file — for example ' +
    'before setting up their parent login. Check family_find first so you do not ' +
    'add a family that is already there. It does not save on its own: she sees ' +
    'everything and taps. Use ONLY what she told you. If the main contact, email, ' +
    'phone or home address is missing, or a child is missing a date of birth, ' +
    'start date or age group, ask her for it in one question — never fill ' +
    'in something plausible. Give a child\'s weekly schedule only if she said the ' +
    'days and times; otherwise leave it out and the child shows as "schedule not ' +
    'set" for her to fill in. Allergies and medications go in only if she said ' +
    'them; leave them out otherwise, and the card will show none recorded.',
  parameters: schema(
    {
      name: { type: 'string', description: 'Family name as she says it, e.g. "The Chen Family" or "Chen"' },
      primaryContact: { type: 'string', description: 'Main parent or guardian, full name' },
      relation: { type: 'string', enum: RELATIONS, description: "Main contact's relation to the children" },
      email: { type: 'string', description: 'Also what their parent login will use' },
      phone: { type: 'string' },
      address: { type: 'string', description: 'Home address' },
      notes: { type: 'string' },
      children: {
        type: 'array',
        maxItems: MAX_CHILDREN,
        items: schema(
          {
            name: { type: 'string', description: "Child's full name" },
            dob: { type: 'string', description: 'Date of birth, yyyy-MM-dd' },
            ageGroup: { type: 'string', enum: AGE_GROUPS },
            schedule: {
              ...WEEK_SCHEMA,
              description:
                'Only if she gave days and times: keyed mon…sun, each a list of {start, end} ' +
                'in 24-hour HH:mm. A day left out is a day they do not come',
            },
            startDate: { type: 'string', description: 'yyyy-MM-dd' },
            status: { type: 'string', enum: CHILD_STATUSES, description: 'Defaults to active' },
            allergies: { type: 'array', items: { type: 'string' } },
            medications: { type: 'array', items: { type: 'string' } },
            notes: { type: 'string' },
          },
          ['name', 'dob', 'ageGroup', 'startDate'],
        ),
      },
    },
    ['name', 'primaryContact', 'email', 'phone', 'address'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const pending = readPendingFamily(args, ctx.today)
    if (typeof pending === 'string') return { ok: false, error: pending }

    // An email already on file is refused outright: it is what the parent login
    // is made from, and two families sharing one would put the second family's
    // login in front of the first family's children.
    const sameEmail = await ctx.caller.db
      .from('families')
      .select('id, name')
      .ilike('email', exactPattern(pending.email))
      .limit(1)
    if (sameEmail.error !== null) return dbFailure('families', sameEmail.error)
    const clash = sameEmail.data[0]
    if (clash !== undefined) {
      return {
        ok: true,
        data: {
          added: false,
          reason: `that email is already on file for ${clash.name}`,
          existingFamilyId: clash.id,
          tellHer: 'Say which family already has it and ask whether she meant that family.',
        },
      }
    }

    // A matching name is only a warning: two unrelated families can share a
    // surname. It goes on the card so she decides with it in front of her.
    const sameName = await ctx.caller.db
      .from('families')
      .select('name')
      .ilike('name', exactPattern(pending.name))
      .limit(3)
    if (sameName.error !== null) return dbFailure('families', sameName.error)

    const key = `family.add:${JSON.stringify(pending)}`
    const seen = alreadyProposed(ctx, key)
    if (seen !== undefined) return proposed(seen)

    const logged = await propose(ctx, {
      instruction: ctx.instruction,
      tool: 'family.add',
      riskTier: 'medium',
      arguments: { ...pending },
      subject: { familyLabel: pending.name },
      model: ctx.model,
    })
    if (!logged.ok) return { ok: false, error: logged.error }

    const detail: { label: string; value: string }[] = [
      { label: 'Family', value: pending.name },
      {
        label: 'Main contact',
        value: pending.relation.length > 0 ? `${pending.primaryContact} (${pending.relation})` : pending.primaryContact,
      },
      { label: 'Email', value: `${pending.email} — their parent login will use this` },
      { label: 'Phone', value: pending.phone },
      { label: 'Address', value: pending.address },
    ]
    if (pending.notes.length > 0) detail.push({ label: 'Notes', value: pending.notes })
    if (sameName.data.length > 0) {
      detail.push({
        label: 'Careful',
        value: `There is already a family called ${sameName.data.map((row) => row.name).join(', ')}. Make sure this is a different one.`,
      })
    }
    for (const child of pending.children) {
      const parts = [
        `born ${prettyDate(child.dob)}`,
        child.ageGroup,
        child.schedule === null ? 'schedule not set' : formatWeeklySchedule(child.schedule, 'en-US'),
        `starts ${prettyDate(child.startDate)}`,
      ]
      if (child.status === 'waitlist') parts.push('waitlist')
      detail.push({ label: child.name, value: parts.join(' · ') })
      detail.push({
        label: `${child.name} — allergies`,
        value: child.allergies.length > 0 ? child.allergies.join(', ') : 'None recorded',
      })
      if (child.medications.length > 0) {
        detail.push({ label: `${child.name} — medications`, value: child.medications.join(', ') })
      }
      if (child.notes.length > 0) detail.push({ label: `${child.name} — notes`, value: child.notes })
    }
    if (pending.children.length === 0) {
      detail.push({ label: 'Children', value: 'None yet — they can be added from the Children page.' })
    }
    detail.push({
      label: 'What happens',
      value:
        'Adds them to Families. No parent login is made and nothing is sent to them — ' +
        'a login is a separate step.',
    })

    const count = pending.children.length
    const preview: ActionPreview = {
      id: logged.value,
      kind: 'family.add',
      title: 'Add a new family',
      summary:
        count === 0
          ? pending.name
          : `${pending.name} with ${count === 1 ? pending.children[0]?.name ?? '1 child' : `${String(count)} children`}`,
      detail,
      confirmLabel: 'Add the family',
    }
    rememberProposal(ctx, key, preview)
    return proposed(preview)
  },
}

export const familyTools: ToolSpec[] = [familyAdd]

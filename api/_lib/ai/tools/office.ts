/**
 * The office-side mutations — the calendar, leads, the waitlist, and document
 * visibility. Plan §3's remaining Low tier.
 *
 * NOTHING HERE DELETES, and that is the section's one deliberate line. §3 already
 * flags deletions as gated regardless of tier because this app has no trash, and
 * §8's undo window covers sends rather than deletes. Every tool below adds or
 * changes; removing a calendar event, a document or a waitlist row stays in the
 * console until it gets a pass of its own with wording that says plainly it
 * cannot be taken back. Ro not being able to delete is a feature until then.
 *
 * `waitlist.mutate` IS NOT HERE, and §3's table listing it is wrong. The table it
 * would write to, `waitlist_prospects`, is orphaned: `setWaitlist` exists in
 * `useStore.ts` and nothing calls it, and no page reads that table. The app's real
 * waitlist is a child whose `status` is 'waitlist', which `AdminChildren.tsx`
 * filters on. A tool writing to `waitlist_prospects` would look like it worked and
 * be invisible to Melissa forever — worse than not having the tool. Putting a
 * child on the waitlist means changing their status, which belongs to the child
 * mutations in the Money/PII pass, not here.
 *
 * (Worth noting how that got into the plan: §3's table was derived from the store's
 * action surface, and a store action existing is not the same as the app using it.
 * `setWaitlist` is the second orphan found this way, after migration 0005's
 * `family_contacts` / `pickup_authorizations` / `pickup_events`.)
 *
 * Document upload is absent for a simpler reason: it needs a file, and Ro has no
 * file. Only visibility is reachable.
 */

import { propose } from '../audit.js'
import { prettyDate } from '../clock.js'
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

const MAX_TEXT = 1000
const MAX_TITLE = 200

const CALENDAR_KINDS = ['closure', 'early_close', 'activity', 'reminder'] as const

/** Every tool here follows the same three steps, so they share one. */
async function offer(
  ctx: ToolContext,
  tool: string,
  payload: Record<string, unknown>,
  preview: Omit<ActionPreview, 'id'>,
  subject: { familyId?: string | null; familyLabel?: string; targets?: unknown[] } = {},
): Promise<ToolOutcome> {
  const key = `${tool}:${JSON.stringify(payload)}`
  const seen = alreadyProposed(ctx, key)
  if (seen !== undefined) return proposed(seen)

  const logged = await propose(ctx, {
    instruction: ctx.instruction,
    tool,
    riskTier: 'low',
    arguments: payload,
    subject,
    model: ctx.model,
  })
  if (!logged.ok) return { ok: false, error: logged.error }

  const full: ActionPreview = { id: logged.value, ...preview }
  rememberProposal(ctx, key, full)
  return proposed(full)
}

/* ----------------------------- calendar.mutate ----------------------------- */

const calendarMutate: ToolSpec = {
  name: 'calendar_mutate',
  tier: 'low',
  description:
    'Put a closure, early close, activity or reminder on the family calendar, or ' +
    'change one that is already there. Call calendar_upcoming first to see what ' +
    'exists and to get an id for a change. This cannot remove an event — say so if ' +
    'she asks, and point her at the calendar page. Nothing happens until she taps.',
  parameters: schema(
    {
      eventId: { type: 'string', description: 'From calendar_upcoming. Omit to add a new event' },
      kind: { type: 'string', enum: CALENDAR_KINDS },
      title: { type: 'string' },
      note: { type: 'string' },
      startsOn: { type: 'string', description: 'yyyy-MM-dd' },
      endsOn: { type: 'string', description: 'yyyy-MM-dd, for a multi-day event' },
      closesAt: { type: 'string', description: 'HH:mm, only for an early_close' },
      visibleToParents: { type: 'boolean' },
    },
    [],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const eventId = readString(args, 'eventId')
    const title = readString(args, 'title')?.slice(0, MAX_TITLE) ?? null
    const note = readString(args, 'note')?.slice(0, MAX_TEXT) ?? null
    const startsOn = readDate(args, 'startsOn')
    const endsOn = readDate(args, 'endsOn')
    const closesAt = readString(args, 'closesAt')
    const visible = args.visibleToParents
    const kind = 'kind' in args ? readEnum(args, 'kind', CALENDAR_KINDS, 'closure') : null

    if (closesAt !== null && !/^\d{2}:\d{2}$/.test(closesAt)) {
      return { ok: false, error: 'closesAt must look like 14:30' }
    }
    if (endsOn !== null && startsOn !== null && endsOn < startsOn) {
      return { ok: false, error: 'That event would end before it starts' }
    }

    if (eventId === null) {
      // A new event needs enough to be meaningful on its own.
      if (title === null) return { ok: false, error: 'A new event needs a title' }
      if (startsOn === null) return { ok: false, error: 'A new event needs a start date' }
      if (kind === null) return { ok: false, error: 'A new event needs a kind' }
    } else {
      const existing = await ctx.caller.db
        .from('calendar_events')
        .select('id, title, starts_on')
        .eq('id', eventId)
        .maybeSingle()
      if (existing.error !== null) return dbFailure('that event', existing.error)
      if (existing.data === null) {
        return { ok: true, data: { changed: false, reason: 'no event has that id', eventId } }
      }
    }

    const payload = { eventId, kind, title, note, startsOn, endsOn, closesAt, visibleToParents: typeof visible === 'boolean' ? visible : null }
    const detail: { label: string; value: string }[] = []
    if (title !== null) detail.push({ label: 'Title', value: title })
    if (kind !== null) detail.push({ label: 'Kind', value: kind.replace('_', ' ') })
    if (startsOn !== null) {
      detail.push({
        label: 'When',
        value: endsOn === null ? prettyDate(startsOn) : `${prettyDate(startsOn)} to ${prettyDate(endsOn)}`,
      })
    }
    if (closesAt !== null) detail.push({ label: 'Closing at', value: closesAt })
    if (note !== null) detail.push({ label: 'Note', value: note })
    if (typeof visible === 'boolean') {
      detail.push({ label: 'Parents see it', value: visible ? 'Yes' : 'No — owner only' })
    }
    if (eventId !== null) {
      detail.push({ label: 'Careful', value: 'This changes an event already on the calendar.' })
    }

    return offer(
      ctx,
      'calendar.mutate',
      payload,
      {
        kind: 'calendar.mutate',
        title: eventId === null ? 'Add to the calendar' : 'Change a calendar event',
        summary: title ?? 'Update that event',
        detail,
        confirmLabel: eventId === null ? 'Add it' : 'Change it',
      },
      { targets: eventId === null ? [] : [eventId] },
    )
  },
}

/* ------------------------------- lead.mutate ------------------------------- */

const leadMutate: ToolSpec = {
  name: 'lead_mutate',
  tier: 'low',
  description:
    'Record a new enquiry from a prospective family, or update one — a tour date, ' +
    'a status, a note. Nothing happens until the owner taps. This cannot remove a ' +
    'lead.',
  parameters: schema(
    {
      leadId: { type: 'string', description: 'Omit to record a new enquiry' },
      parentName: { type: 'string' },
      email: { type: 'string' },
      phone: { type: 'string' },
      childAges: { type: 'string', description: 'In her words — "2 and 4"' },
      message: { type: 'string', description: 'What they asked' },
      tourDate: { type: 'string', description: 'yyyy-MM-dd' },
      status: { type: 'string', description: 'Her own wording, e.g. "Tour booked"' },
    },
    [],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const leadId = readString(args, 'leadId')
    const parentName = readString(args, 'parentName')?.slice(0, MAX_TITLE) ?? null
    const email = readString(args, 'email')?.slice(0, MAX_TITLE) ?? null
    const phone = readString(args, 'phone')?.slice(0, 40) ?? null
    const childAges = readString(args, 'childAges')?.slice(0, MAX_TITLE) ?? null
    const message = readString(args, 'message')?.slice(0, MAX_TEXT) ?? null
    const tourDate = readDate(args, 'tourDate')
    const status = readString(args, 'status')?.slice(0, MAX_TITLE) ?? null

    if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      // Same shape the enrollment form and create-parent-login already enforce.
      return { ok: false, error: 'That email address does not look right' }
    }

    if (leadId === null) {
      if (parentName === null) return { ok: false, error: 'A new enquiry needs the parent name' }
    } else {
      const existing = await ctx.caller.db.from('leads').select('id, parent_name').eq('id', leadId).maybeSingle()
      if (existing.error !== null) return dbFailure('that enquiry', existing.error)
      if (existing.data === null) {
        return { ok: true, data: { changed: false, reason: 'no enquiry has that id', leadId } }
      }
    }

    const payload = { leadId, parentName, email, phone, childAges, message, tourDate, status }
    const detail: { label: string; value: string }[] = []
    if (parentName !== null) detail.push({ label: 'Parent', value: parentName })
    if (email !== null) detail.push({ label: 'Email', value: email })
    if (phone !== null) detail.push({ label: 'Phone', value: phone })
    if (childAges !== null) detail.push({ label: 'Children', value: childAges })
    if (tourDate !== null) detail.push({ label: 'Tour', value: prettyDate(tourDate) })
    if (status !== null) detail.push({ label: 'Status', value: status })
    if (message !== null) detail.push({ label: 'They said', value: message })

    return offer(
      ctx,
      'lead.mutate',
      payload,
      {
        kind: 'lead.mutate',
        title: leadId === null ? 'Record an enquiry' : 'Update an enquiry',
        summary: parentName ?? 'Update that enquiry',
        detail,
        confirmLabel: leadId === null ? 'Save it' : 'Update it',
      },
      { targets: leadId === null ? [] : [leadId] },
    )
  },
}

/* ----------------------------- document.manage ---------------------------- */

const documentManage: ToolSpec = {
  name: 'document_manage',
  tier: 'low',
  description:
    'Show a document to parents, or hide it from them. Call document_list first ' +
    'for the id. You cannot upload a document — that needs a file, which you do ' +
    'not have — and you cannot delete one. Nothing happens until the owner taps.',
  parameters: schema(
    {
      documentId: { type: 'string', description: 'From document_list' },
      visibleToParents: { type: 'boolean', description: 'true shows it to parents, false hides it' },
    },
    ['documentId', 'visibleToParents'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const documentId = readString(args, 'documentId')
    if (documentId === null) return { ok: false, error: 'A documentId is required' }
    const visible = args.visibleToParents
    if (typeof visible !== 'boolean') {
      return { ok: false, error: 'Say whether parents should see it: true or false' }
    }

    const document = await ctx.caller.db
      .from('documents')
      .select('id, title, visible_to_parents, requires_ack')
      .eq('id', documentId)
      .maybeSingle()
    if (document.error !== null) return dbFailure('that document', document.error)
    if (document.data === null) {
      return { ok: true, data: { changed: false, reason: 'no document has that id', documentId } }
    }
    if (document.data.visible_to_parents === visible) {
      return {
        ok: true,
        data: {
          changed: false,
          reason: visible ? 'parents can already see it' : 'it is already hidden from parents',
          title: document.data.title,
        },
      }
    }

    const detail: { label: string; value: string }[] = [
      { label: 'Document', value: document.data.title },
      { label: 'Becomes', value: visible ? 'Visible to parents' : 'Hidden from parents' },
    ]
    if (visible && document.data.requires_ack) {
      // Worth surfacing: showing it starts asking families to sign it off.
      detail.push({ label: 'Note', value: 'This one asks parents to acknowledge it once they can see it.' })
    }

    return offer(
      ctx,
      'document.manage',
      { documentId, visibleToParents: visible },
      {
        kind: 'document.manage',
        title: visible ? 'Show a document to parents' : 'Hide a document',
        summary: `${document.data.title} — ${visible ? 'visible to parents' : 'hidden'}`,
        detail,
        confirmLabel: visible ? 'Show it' : 'Hide it',
      },
      { targets: [documentId] },
    )
  },
}

export const officeTools: ToolSpec[] = [calendarMutate, leadMutate, documentManage]

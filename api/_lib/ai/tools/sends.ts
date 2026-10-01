/**
 * The send tier — plan §3, §7 and §8.
 *
 * These are the tools the whole build exists for: Melissa says "tell the Chens
 * pickup is at four", taps once, and it is in their portal. Everything before
 * this produced wording she had to copy somewhere herself.
 *
 * Like the rule tools, neither of these contains a write. They resolve the
 * recipients, check her standing rules, record a proposal and stop; the writes
 * live in `../execute.ts` behind `api/ai/confirm.ts`. §7 is explicit that send
 * actions "always show a preview and require her tap — no exceptions in v1,
 * including send actions the rules engine itself triggers", and a spoken "send
 * it" is not an exception either.
 *
 * WHAT SENDING MEANS HERE, because it decides the wording: a send is a row in
 * `threads`/`thread_messages` or `announcements`, and nothing else. There is no
 * email integration in this codebase — `RESEND_API_KEY` sits in `.env.local` and
 * nothing reads it. The parent sees the message when they open their portal,
 * live, since those tables are in the realtime publication. The admin UI already
 * words its own toast that way ("will see it in their portal"), and Ro must not
 * promise more than that. It is also why undo works completely here: nothing has
 * left the building to be recalled.
 *
 * The validations mirror `AdminMessages.tsx` exactly — a family, a subject, and
 * at least a sentence — because §3's promise is that a tool is "already scoped
 * and already validated exactly like the UI form that calls it today".
 */

import { propose } from '../audit.js'
import { rulesBlocking } from '../rules.js'
import {
  alreadyProposed,
  dbFailure,
  proposed,
  readString,
  rememberProposal,
  schema,
  type ActionPreview,
  type ToolOutcome,
  type ToolSpec,
} from './kit.js'

/** Mirrors AdminMessages.tsx: "Write at least a sentence". */
const MIN_BODY = 5
const MAX_BODY = 4000
const MAX_SUBJECT = 200
/**
 * Above this many families, the preview says so in its own line rather than
 * leaving the number to be read off a detail row. §8's blast-radius concern is
 * that a wide send is easy to approve without noticing how wide it is.
 */
const LARGE_AUDIENCE = 4

function readBody(args: Record<string, unknown>, key: string, limit: number): string | null {
  const raw = readString(args, key)
  if (raw === null) return null
  return raw.slice(0, limit)
}

/** The line every send preview carries, so "sent" is never overstated. */
const DELIVERY_NOTE = 'Posts to their parent portal. No email goes out — this app does not send any.'

/* ------------------------------- message.send ------------------------------ */

const messageSend: ToolSpec = {
  name: 'message_send',
  tier: 'send',
  description:
    'Write a message to one family and put it in front of the owner to send. ' +
    'This is what you use whenever she wants a family contacted — it does NOT ' +
    'send on its own: she sees the wording and taps once, and then it is in their ' +
    'portal. Resolve the family with family_find first. Pass threadId to reply ' +
    'inside an existing conversation, or omit it and give a subject to start a ' +
    'new one. Write only what the records actually say: never state something ' +
    "about a child that isn't in a daily log, an attendance record or an invoice.",
  parameters: schema(
    {
      familyId: { type: 'string', description: 'From family_find or roster_list' },
      body: { type: 'string', description: "The message, in the owner's voice" },
      subject: { type: 'string', description: 'Required when starting a new conversation' },
      threadId: { type: 'string', description: 'From thread_list, to reply in an existing one' },
    },
    ['familyId', 'body'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const familyId = readString(args, 'familyId')
    const body = readBody(args, 'body', MAX_BODY)
    if (familyId === null) return { ok: false, error: 'A familyId is required' }
    if (body === null) return { ok: false, error: 'A message body is required' }
    if (body.length < MIN_BODY) return { ok: false, error: 'Write at least a sentence' }

    const family = await ctx.caller.db.from('families').select('id, name').eq('id', familyId).maybeSingle()
    if (family.error !== null) return dbFailure('that family', family.error)
    if (family.data === null) {
      return { ok: true, data: { sent: false, reason: 'no family has that id', familyId } }
    }

    const threadId = readString(args, 'threadId')
    let subject = readBody(args, 'subject', MAX_SUBJECT)

    if (threadId !== null) {
      const thread = await ctx.caller.db
        .from('threads')
        .select('id, family_id, subject')
        .eq('id', threadId)
        .maybeSingle()
      if (thread.error !== null) return dbFailure('that thread', thread.error)
      if (thread.data === null) {
        return { ok: true, data: { sent: false, reason: 'no thread has that id', threadId } }
      }
      if (thread.data.family_id !== familyId) {
        // Refused rather than quietly re-addressed: a reply landing in another
        // family's thread is the cross-family leak RLS exists to stop.
        return {
          ok: true,
          data: { sent: false, reason: 'that thread belongs to a different family', threadId, familyId },
        }
      }
      subject = thread.data.subject
    } else if (subject === null) {
      return { ok: false, error: 'A subject is required to start a new conversation' }
    }

    // Her own rules, checked before the send is even offered. The enforcing check
    // runs again at her tap — rules can change in between — but refusing here is
    // what lets Ro say "you told me to leave them alone until Friday" instead of
    // presenting a button that would fail.
    const blocking = await rulesBlocking(ctx, { familyIds: [familyId], channel: 'message' })
    if (!blocking.ok) return { ok: false, error: blocking.error }
    if (blocking.value.length > 0) {
      return {
        ok: true,
        data: {
          sent: false,
          reason: 'one of her own standing rules says not to contact them',
          blockedBy: blocking.value.map((rule) => rule.summary),
          tellHer: 'Say which rule it is and let her decide. Do not offer to send anyway.',
        },
      }
    }

    // recipientCount is explicit even at 1, so §8's hourly ceiling reads one
    // field for every kind of send instead of inferring a default per tool.
    const payload = { familyId, familyLabel: family.data.name, threadId, subject, body, recipientCount: 1 }
    const key = `message.send:${JSON.stringify(payload)}`
    const existing = alreadyProposed(ctx, key)
    if (existing !== undefined) return proposed(existing)

    const logged = await propose(ctx, {
      instruction: ctx.instruction,
      tool: 'message.send',
      riskTier: 'send',
      arguments: payload,
      subject: {
        familyId,
        familyLabel: family.data.name,
        targets: threadId === null ? [] : [threadId],
      },
      model: ctx.model,
    })
    if (!logged.ok) return { ok: false, error: logged.error }

    const preview: ActionPreview = {
      id: logged.value,
      kind: 'message.send',
      title: threadId === null ? 'Send a new message' : 'Reply in this conversation',
      summary: `To ${family.data.name} — ${subject ?? ''}`.trim(),
      detail: [
        { label: 'To', value: `${family.data.name} (1 family)` },
        { label: 'Subject', value: subject ?? '' },
        { label: 'Message', value: body },
        { label: 'What happens', value: DELIVERY_NOTE },
      ],
      confirmLabel: 'Send it',
    }
    rememberProposal(ctx, key, preview)
    return proposed(preview)
  },
}

/* ---------------------------- announcement.send ---------------------------- */

const announcementSend: ToolSpec = {
  name: 'announcement_send',
  tier: 'send',
  description:
    'Write an announcement and put it in front of the owner to post — to every ' +
    'family, or to one. This does NOT post on its own: she sees the wording and ' +
    'the exact list of who it reaches, and taps once. Use a message instead when ' +
    'it is really about one family; an announcement is for something everyone ' +
    'needs. State only what the records support.',
  parameters: schema(
    {
      title: { type: 'string' },
      body: { type: 'string' },
      audience: { type: 'string', description: "The literal 'all', or a single family id" },
    },
    ['title', 'body', 'audience'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const title = readBody(args, 'title', MAX_SUBJECT)
    const body = readBody(args, 'body', MAX_BODY)
    const audience = readString(args, 'audience')
    if (title === null) return { ok: false, error: 'A title is required' }
    if (body === null) return { ok: false, error: 'A body is required' }
    if (body.length < MIN_BODY) return { ok: false, error: 'Write at least a sentence' }
    if (audience === null) return { ok: false, error: "An audience is required ('all' or a family id)" }

    let recipients: string[]
    let audienceLabel: string

    if (audience === 'all') {
      const families = await ctx.caller.db.from('families').select('id, name').limit(500)
      if (families.error !== null) return dbFailure('families', families.error)
      if (families.data.length === 0) {
        return { ok: true, data: { sent: false, reason: 'there are no families to announce to' } }
      }
      recipients = families.data.map((row) => row.name)
      audienceLabel = `Every family (${String(families.data.length)})`
    } else {
      const family = await ctx.caller.db.from('families').select('id, name').eq('id', audience).maybeSingle()
      if (family.error !== null) return dbFailure('that family', family.error)
      if (family.data === null) {
        return { ok: true, data: { sent: false, reason: 'no family has that id', audience } }
      }
      recipients = [family.data.name]
      audienceLabel = `${family.data.name} only`
    }

    const blocking = await rulesBlocking(ctx, {
      // 'all' matters here: a hold on one family still blocks an announcement
      // that reaches everybody, because everybody includes them.
      familyIds: audience === 'all' ? 'all' : [audience],
      channel: 'announcement',
    })
    if (!blocking.ok) return { ok: false, error: blocking.error }
    if (blocking.value.length > 0) {
      return {
        ok: true,
        data: {
          sent: false,
          reason: 'one of her own standing rules covers someone this would reach',
          blockedBy: blocking.value.map((rule) => rule.summary),
          tellHer: 'Say which rule it is and let her decide. Do not offer to post anyway.',
        },
      }
    }

    const payload = { audience, title, body, recipientCount: recipients.length }
    const key = `announcement.send:${JSON.stringify(payload)}`
    const existing = alreadyProposed(ctx, key)
    if (existing !== undefined) return proposed(existing)

    const logged = await propose(ctx, {
      instruction: ctx.instruction,
      tool: 'announcement.send',
      riskTier: 'send',
      arguments: payload,
      subject: {
        familyId: audience === 'all' ? null : audience,
        familyLabel: audience === 'all' ? 'every family' : recipients[0] ?? '',
      },
      model: ctx.model,
    })
    if (!logged.ok) return { ok: false, error: logged.error }

    const detail: { label: string; value: string }[] = [
      { label: 'Goes to', value: audienceLabel },
    ]
    if (recipients.length > LARGE_AUDIENCE) {
      // Spelled out rather than counted, so a wide send cannot be approved
      // without seeing how wide. §8's blast-radius concern, in the preview.
      detail.push({ label: 'That is', value: recipients.join(', ') })
    }
    detail.push({ label: 'Title', value: title })
    detail.push({ label: 'Announcement', value: body })
    detail.push({ label: 'What happens', value: DELIVERY_NOTE })

    const preview: ActionPreview = {
      id: logged.value,
      kind: 'announcement.send',
      title: 'Post an announcement',
      summary: `${title} — to ${audienceLabel.toLowerCase()}`,
      detail,
      confirmLabel: recipients.length > 1 ? `Post to ${String(recipients.length)} families` : 'Post it',
    }
    rememberProposal(ctx, key, preview)
    return proposed(preview)
  },
}

export const sendTools: ToolSpec[] = [messageSend, announcementSend]

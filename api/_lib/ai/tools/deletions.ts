/**
 * The deletions pass — the deletions Ro can make: an announcement, and a whole
 * conversation with a family.
 *
 * Plan §3 gates every deletion regardless of tier, because this app has no trash
 * and §8's undo window covers sends rather than deletes. So, like the send tools,
 * nothing here deletes. `announcement_delete` finds the announcement, records a
 * proposal and stops; the delete lives in `announcement.delete` in `../execute.ts`
 * behind `api/ai/confirm.ts` and her tap.
 *
 * The card says plainly that it cannot be taken back. Each does the same as the
 * Delete button on the admin Messages page: an announcement's row goes, then its
 * attached file; a conversation goes with every message in it (the database
 * cascades them). Nothing is sent to any family.
 */

import { propose } from '../audit.js'
import { prettyDate, todayInZone } from '../clock.js'
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

const announcementDelete: ToolSpec = {
  name: 'announcement_delete',
  tier: 'medium',
  description:
    'Put the deletion of ONE already-posted announcement in front of the owner. This ' +
    'does NOT delete anything on its own: she sees which announcement it is and who ' +
    'had it, and taps once. A delete cannot be taken back — there is no trash and no ' +
    'Undo — so be sure it is the one she means. Get the announcementId from ' +
    'announcement_list, and if more than one could be what she meant, ask her which ' +
    'before calling this.',
  parameters: schema(
    { announcementId: { type: 'string', description: 'From announcement_list' } },
    ['announcementId'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const announcementId = readString(args, 'announcementId')
    if (announcementId === null) {
      return { ok: false, error: 'Which announcement? Give the announcementId from announcement_list' }
    }

    const found = await ctx.caller.db
      .from('announcements')
      .select('id, title, body, audience_family_id, date, attachment_file_name')
      .eq('id', announcementId)
      .maybeSingle()
    if (found.error !== null) return dbFailure('that announcement', found.error)
    if (found.data === null) {
      return {
        ok: true,
        data: {
          deleted: false,
          reason: 'no announcement has that id — look it up with announcement_list',
          announcementId,
        },
      }
    }
    const row = found.data

    let audienceLabel = 'Every family'
    let familyLabel = 'every family'
    if (row.audience_family_id !== null) {
      const family = await ctx.caller.db
        .from('families')
        .select('name')
        .eq('id', row.audience_family_id)
        .maybeSingle()
      if (family.error !== null) return dbFailure('that family', family.error)
      familyLabel = family.data?.name ?? 'one family'
      audienceLabel = `${familyLabel} only`
    }

    const payload = { announcementId: row.id, title: row.title, audienceLabel }
    const key = `announcement.delete:${JSON.stringify(payload)}`
    const existing = alreadyProposed(ctx, key)
    if (existing !== undefined) return proposed(existing)

    const logged = await propose(ctx, {
      instruction: ctx.instruction,
      tool: 'announcement.delete',
      riskTier: 'medium',
      arguments: payload,
      subject: { familyId: row.audience_family_id, familyLabel, targets: [row.id] },
      model: ctx.model,
    })
    if (!logged.ok) return { ok: false, error: logged.error }

    const detail: { label: string; value: string }[] = [
      { label: 'Title', value: row.title },
      { label: 'Announcement', value: row.body },
      { label: 'Went to', value: audienceLabel },
      { label: 'Posted', value: prettyDate(todayInZone(new Date(row.date))) },
    ]
    if (row.attachment_file_name !== null && row.attachment_file_name !== '') {
      detail.push({ label: 'Attached file', value: `${row.attachment_file_name} — deleted too` })
    }
    detail.push({
      label: 'Careful',
      value: 'This cannot be undone. There is no trash and no Undo for a delete.',
    })
    detail.push({
      label: 'What happens',
      value:
        row.audience_family_id === null
          ? 'It disappears from every family’s parent portal right away. Nothing is sent to anyone.'
          : `It disappears from ${familyLabel}’s parent portal right away. Nothing is sent to anyone.`,
    })

    const preview: ActionPreview = {
      id: logged.value,
      kind: 'announcement.delete',
      title: 'Delete an announcement',
      summary: `${row.title} — ${audienceLabel.toLowerCase()}`,
      detail,
      confirmLabel: 'Delete it for good',
    }
    rememberProposal(ctx, key, preview)
    return proposed(preview)
  },
}

/* ------------------------------ thread.delete ------------------------------ */

const threadDelete: ToolSpec = {
  name: 'thread_delete',
  tier: 'medium',
  description:
    'Put the deletion of ONE whole conversation with a family in front of the owner — ' +
    'the thread and every message in it, hers and theirs. This does NOT delete ' +
    'anything on its own: she sees which conversation it is and taps once. A delete ' +
    'cannot be taken back — there is no trash and no Undo — and the family loses the ' +
    'conversation from their portal. Get the threadId from thread_list, and if more ' +
    'than one could be what she meant, ask her which before calling this.',
  parameters: schema({ threadId: { type: 'string', description: 'From thread_list' } }, ['threadId']),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const threadId = readString(args, 'threadId')
    if (threadId === null) return { ok: false, error: 'Which conversation? Give the threadId from thread_list' }

    const found = await ctx.caller.db
      .from('threads')
      .select('id, family_id, subject, updated_at')
      .eq('id', threadId)
      .maybeSingle()
    if (found.error !== null) return dbFailure('that conversation', found.error)
    if (found.data === null) {
      return {
        ok: true,
        data: { deleted: false, reason: 'no conversation has that id — look it up with thread_list', threadId },
      }
    }
    const row = found.data

    const family = await ctx.caller.db.from('families').select('name').eq('id', row.family_id).maybeSingle()
    if (family.error !== null) return dbFailure('that family', family.error)
    const familyName = family.data?.name ?? 'the family'

    const messages = await ctx.caller.db
      .from('thread_messages')
      .select('from_role, body, at')
      .eq('thread_id', row.id)
      .order('at', { ascending: false })
    if (messages.error !== null) return dbFailure('its messages', messages.error)
    const count = messages.data.length
    const last = messages.data[0]

    const payload = { threadId: row.id, subject: row.subject, familyName, messageCount: count }
    const key = `thread.delete:${JSON.stringify(payload)}`
    const existing = alreadyProposed(ctx, key)
    if (existing !== undefined) return proposed(existing)

    const logged = await propose(ctx, {
      instruction: ctx.instruction,
      tool: 'thread.delete',
      riskTier: 'medium',
      arguments: payload,
      subject: { familyId: row.family_id, familyLabel: familyName, targets: [row.id] },
      model: ctx.model,
    })
    if (!logged.ok) return { ok: false, error: logged.error }

    const detail: { label: string; value: string }[] = [
      { label: 'Conversation', value: row.subject },
      { label: 'With', value: familyName },
      { label: 'Messages', value: `${String(count)} — all of them are deleted` },
    ]
    if (last !== undefined) {
      detail.push({
        label: 'Last message',
        value: `${last.from_role === 'parent' ? familyName : 'You'}, ${prettyDate(todayInZone(new Date(last.at)))}: ${last.body.slice(0, 200)}`,
      })
    }
    detail.push({
      label: 'Careful',
      value: 'This cannot be undone. There is no trash and no Undo for a delete.',
    })
    detail.push({
      label: 'What happens',
      value: `The whole conversation disappears from ${familyName}’s parent portal right away. Nothing is sent to anyone.`,
    })

    const preview: ActionPreview = {
      id: logged.value,
      kind: 'thread.delete',
      title: 'Delete a conversation',
      summary: `${row.subject} — ${familyName}`,
      detail,
      confirmLabel: 'Delete it for good',
    }
    rememberProposal(ctx, key, preview)
    return proposed(preview)
  },
}

export const deletionTools: ToolSpec[] = [announcementDelete, threadDelete]

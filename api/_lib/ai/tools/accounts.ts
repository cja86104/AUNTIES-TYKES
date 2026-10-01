/**
 * Setting up a parent's portal login — plan §3's `account.create`, Money/PII.
 *
 * The same thing as "Create parent login" on a family's page, with one part
 * moved: the password. Ro never handles it. This tool proposes the account —
 * family, guardian, email, portal language — and the card asks Melissa to type
 * the password herself, right there, at the moment she approves. It goes from
 * that field to `api/ai/confirm.ts` to `createParentAccount`, and nowhere else:
 * not into this tool's arguments, the audit log, the chat history, or anything
 * a model reads. The console's rule that the owner always chooses the password
 * holds unchanged.
 *
 * The write is `createParentLoginExecutor` in `../execute.ts`, behind her tap,
 * and it creates the account through `api/_lib/parentLogin.ts` — the one
 * implementation the console's endpoint uses too.
 */

import { propose } from '../audit.js'
import {
  EMAIL_PATTERN,
  MAX_PASSWORD,
  MIN_PASSWORD,
  PORTAL_LANGUAGES,
  type PortalLanguage,
} from '../../parentLogin.js'
import { exactPattern } from './families.js'
import {
  alreadyProposed,
  dbFailure,
  proposed,
  readString,
  rememberProposal,
  schema,
  type ActionPreview,
  type ToolContext,
  type ToolOutcome,
  type ToolSpec,
} from './kit.js'

const LANGUAGE_NAMES: Record<PortalLanguage, string> = {
  en: 'English',
  vi: 'Vietnamese',
  es: 'Spanish',
}

/** What the card's password field asks for. Shared with the executor's declaration. */
export const LOGIN_SECRET = { minLength: MIN_PASSWORD, maxLength: MAX_PASSWORD } as const

export interface PendingLogin {
  familyId: string
  familyName: string
  name: string
  email: string
  preferredLanguage: PortalLanguage
}

/**
 * Reads a stored proposal back for the executor. A string is why it cannot run.
 * The same checks as `readPayload` in api/create-parent-login.ts, minus the
 * password, which is not part of a proposal.
 */
export function readPendingLogin(args: Record<string, unknown>): PendingLogin | string {
  const familyId = readString(args, 'familyId')
  const familyName = readString(args, 'familyName') ?? ''
  const name = readString(args, 'name') ?? ''
  const email = readString(args, 'email') ?? ''
  const language = readString(args, 'preferredLanguage') ?? 'en'
  if (familyId === null) return 'A family is required'
  if (name.length < 2) return "The guardian's name is required"
  if (!EMAIL_PATTERN.test(email)) return 'A valid email address is required'
  const preferredLanguage = PORTAL_LANGUAGES.find((code) => code === language)
  if (preferredLanguage === undefined) return 'Unsupported language'
  return { familyId, familyName, name, email, preferredLanguage }
}

/** Whether any portal account already uses this email. */
export async function emailInUse(
  ctx: ToolContext,
  email: string,
): Promise<{ ok: true; value: boolean } | { ok: false; error: string }> {
  const taken = await ctx.caller.db
    .from('profiles')
    .select('id')
    .ilike('email', exactPattern(email))
    .limit(1)
  if (taken.error !== null) return dbFailure('portal accounts', taken.error)
  return { ok: true, value: taken.data.length > 0 }
}

/* ------------------------------ account.create ----------------------------- */

const parentLoginCreate: ToolSpec = {
  name: 'parent_login_create',
  tier: 'money',
  description:
    "Set up a parent's login to the family portal, for a family that is already " +
    'on file — add the family first with family_add if it is not. Resolve the ' +
    'family with family_find. Name and email default to the family\'s main contact ' +
    'and email, which is what the console suggests too. This does not create ' +
    'anything on its own: she sees the details and types the password herself on ' +
    'the card when she approves. NEVER ask her for a password, never put one in ' +
    'your reply, and never pass one to any tool. If she says one out loud, do not ' +
    'repeat it — tell her to type it on the card instead. No email is sent to the ' +
    'parent; she gives them the login herself.',
  parameters: schema(
    {
      familyId: { type: 'string', description: 'From family_find or roster_list' },
      name: { type: 'string', description: "The parent's full name. Defaults to the family's main contact" },
      email: { type: 'string', description: "Defaults to the family's email" },
      preferredLanguage: {
        type: 'string',
        enum: PORTAL_LANGUAGES,
        description: 'Language the portal shows them in: en, vi or es. Defaults to en',
      },
    },
    ['familyId'],
  ),
  execute: async (args, ctx): Promise<ToolOutcome> => {
    const familyId = readString(args, 'familyId')
    if (familyId === null) return { ok: false, error: 'A familyId is required' }

    const family = await ctx.caller.db
      .from('families')
      .select('id, name, primary_contact, email')
      .eq('id', familyId)
      .maybeSingle()
    if (family.error !== null) return dbFailure('that family', family.error)
    if (family.data === null) {
      return { ok: true, data: { created: false, reason: 'no family has that id', familyId } }
    }

    const pending = readPendingLogin({
      familyId,
      familyName: family.data.name,
      name: readString(args, 'name') ?? family.data.primary_contact,
      email: readString(args, 'email') ?? family.data.email,
      preferredLanguage: readString(args, 'preferredLanguage') ?? 'en',
    })
    if (typeof pending === 'string') {
      return {
        ok: true,
        data: {
          created: false,
          reason: pending,
          tellHer: 'Ask her for what is missing in one question.',
        },
      }
    }

    // Refused here so she is told now, not after her tap: an email that already
    // signs someone in cannot be given to a second account.
    const taken = await emailInUse(ctx, pending.email)
    if (!taken.ok) return { ok: false, error: taken.error }
    if (taken.value) {
      return {
        ok: true,
        data: {
          created: false,
          reason: `a portal login already uses ${pending.email}`,
          tellHer: 'Say so, and ask whether a different email should be used.',
        },
      }
    }

    // Not refused — a family can have more than one parent with a login — but
    // shown on the card, the way the console's dialog lists existing accounts.
    const existing = await ctx.caller.db
      .from('profiles')
      .select('name, email')
      .eq('family_id', familyId)
      .eq('role', 'parent')
      .limit(10)
    if (existing.error !== null) return dbFailure('portal accounts', existing.error)

    const payload = { ...pending }
    const key = `account.create:${JSON.stringify(payload)}`
    const seen = alreadyProposed(ctx, key)
    if (seen !== undefined) return proposed(seen)

    const logged = await propose(ctx, {
      instruction: ctx.instruction,
      tool: 'account.create',
      riskTier: 'money',
      arguments: payload,
      subject: { familyId, familyLabel: pending.familyName },
      model: ctx.model,
    })
    if (!logged.ok) return { ok: false, error: logged.error }

    const detail: { label: string; value: string }[] = [
      { label: 'Family', value: pending.familyName },
      { label: 'Parent', value: pending.name },
      { label: 'Signs in with', value: pending.email },
      { label: 'Portal in', value: LANGUAGE_NAMES[pending.preferredLanguage] },
    ]
    if (existing.data.length > 0) {
      detail.push({
        label: 'Already has',
        value: existing.data.map((row) => `${row.name} (${row.email})`).join(', '),
      })
    }
    detail.push({
      label: 'Password',
      value:
        'You type it below. I never see it, and it is not kept anywhere except their login.',
    })
    detail.push({
      label: 'What happens',
      value:
        'Creates their login. No email goes out — give them the email and password ' +
        'yourself. A copy button appears once it is made.',
    })

    const preview: ActionPreview = {
      id: logged.value,
      kind: 'account.create',
      title: 'Create a parent login',
      summary: `${pending.name} — ${pending.familyName}`,
      detail,
      confirmLabel: 'Create the login',
      secret: {
        label: 'Password for them',
        ...LOGIN_SECRET,
        share: { familyName: pending.familyName, email: pending.email },
      },
    }
    rememberProposal(ctx, key, preview)
    return proposed(preview)
  },
}

export const accountTools: ToolSpec[] = [parentLoginCreate]

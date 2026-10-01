import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types.js'

/**
 * Creating a parent portal account — the one implementation.
 *
 * Two callers, one code path: `api/create-parent-login.ts` (the console's
 * "Create parent login" dialog) and Ro's `account.create` executor. Both verify
 * the caller is the owner BEFORE reaching here; this file only does the part
 * that needs the service-role key — creating the Supabase Auth user and its
 * profile — so the roll-back below cannot drift between the two.
 *
 * The service-role key is read here and nowhere near the browser. It must never
 * be VITE_-prefixed, or Vite would inline it into the client bundle.
 *
 * The password is used for exactly one call, `auth.admin.createUser`, and is not
 * returned, logged or stored by anything in this file.
 *
 * This lives under api/_lib/, which Vercel does not turn into an endpoint.
 */

export const PORTAL_LANGUAGES = ['en', 'vi', 'es'] as const
export type PortalLanguage = (typeof PORTAL_LANGUAGES)[number]

/** The console's checks, shared so both callers refuse the same things. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const MIN_PASSWORD = 8
/** Generous, but bounded: this string goes to Supabase Auth and nowhere else. */
export const MAX_PASSWORD = 200

export interface NewParentAccount {
  familyId: string
  name: string
  email: string
  password: string
  preferredLanguage: PortalLanguage
}

export type ParentAccountResult =
  | { ok: true; id: string; email: string }
  | { ok: false; status: number; error: string }

/**
 * Creates the auth user, then the profile that attaches it to a family.
 *
 * email_confirm skips the verification email: the owner hands these credentials
 * over in person or by phone, and this app sends no email at all.
 */
export async function createParentAccount(input: NewParentAccount): Promise<ParentAccountResult> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return { ok: false, status: 500, error: 'Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }
  }

  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  })
  if (createError || !created.user) {
    const taken = /already|exists|registered/i.test(createError?.message ?? '')
    return {
      ok: false,
      status: taken ? 409 : 500,
      error: taken
        ? 'An account already uses that email address'
        : (createError?.message ?? 'Could not create the account'),
    }
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    name: input.name,
    email: input.email,
    role: 'parent',
    family_id: input.familyId,
    preferred_language: input.preferredLanguage,
  })
  if (profileError) {
    // Roll the auth user back. Left behind, it would block every retry with
    // "already exists" while having no profile to sign in against.
    await admin.auth.admin.deleteUser(created.user.id)
    return { ok: false, status: 500, error: profileError.message }
  }

  return { ok: true, id: created.user.id, email: input.email }
}

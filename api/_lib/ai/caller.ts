/**
 * Who is asking, and the database handle their questions run under.
 *
 * Every Ro read goes through a Supabase client built from the caller's own
 * access token and the anon key — never the service-role key. That is the whole
 * point: the `admin_all` / `own_*` policies in supabase/migrations/0001_init.sql
 * are then what decides which rows come back, so the AI read path inherits the
 * family boundary from the same RLS the portals already run on instead of
 * reimplementing it. A service-role client would bypass RLS entirely and put
 * that boundary back into application code, which is exactly what
 * `useFamilyScope.ts` and its mirrored policies exist to avoid.
 *
 * `api/create-parent-login.ts` does use the service-role key, because creating
 * an Auth user is not something any JWT may do. Reads have no such excuse.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../src/lib/database.types'

export type AiDb = SupabaseClient<Database>

export interface Caller {
  id: string
  /** The owner's display name, for the system prompt's "who Melissa is". */
  name: string
  db: AiDb
}

export type CallerResult =
  | { ok: true; caller: Caller }
  | { ok: false; status: number; error: string }

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY

/** Pulls the bearer token out of an Authorization header. */
export function bearerToken(header: string | undefined): string {
  if (typeof header !== 'string') return ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

/**
 * Verifies the caller is the signed-in owner and returns a database handle
 * scoped to them.
 *
 * Ro is reachable only from the admin console, so a parent token is refused
 * here rather than being handed a narrower tool set — there is no parent-facing
 * half of this feature to fall back to.
 */
export async function authenticateAdmin(header: string | undefined): Promise<CallerResult> {
  if (url === undefined || anonKey === undefined) {
    return {
      ok: false,
      status: 500,
      error: 'Server is missing SUPABASE_URL or SUPABASE_ANON_KEY',
    }
  }

  const token = bearerToken(header)
  if (token.length === 0) {
    return { ok: false, status: 401, error: 'Not signed in' }
  }

  const db = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: authData, error: authError } = await db.auth.getUser(token)
  if (authError !== null || authData.user === null) {
    return { ok: false, status: 401, error: 'Your session has expired — sign in again' }
  }

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('name, role')
    .eq('id', authData.user.id)
    .single()

  if (profileError !== null || profile === null) {
    return { ok: false, status: 403, error: 'That account has no profile' }
  }
  if (profile.role !== 'admin') {
    return { ok: false, status: 403, error: 'Ro is only available to the owner' }
  }

  return { ok: true, caller: { id: authData.user.id, name: profile.name, db } }
}

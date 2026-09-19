import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/lib/database.types'

/**
 * Creates a parent portal account.
 *
 * This runs on the server because it needs the service-role key: creating a
 * Supabase Auth user is not something the browser may do. That key must never
 * be VITE_-prefixed, or Vite would inline it into the client bundle.
 *
 * The caller's own access token is verified here and their profile checked for
 * role = 'admin'. Without that, anyone who found this URL could create logins.
 */

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const LANGUAGES = ['en', 'vi', 'es'] as const
type Language = (typeof LANGUAGES)[number]

interface Payload {
  familyId: string
  name: string
  email: string
  password: string
  preferredLanguage: Language
}

function readPayload(raw: unknown): Payload | string {
  if (typeof raw !== 'object' || raw === null) return 'Malformed request body'
  const body = raw as Record<string, unknown>
  const familyId = typeof body.familyId === 'string' ? body.familyId.trim() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const lang = typeof body.preferredLanguage === 'string' ? body.preferredLanguage : 'en'

  if (!familyId) return 'A family is required'
  if (name.length < 2) return "The guardian's name is required"
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'A valid email address is required'
  if (password.length < 8) return 'The password must be at least 8 characters'
  if (!LANGUAGES.includes(lang as Language)) return 'Unsupported language'

  return { familyId, name, email, password, preferredLanguage: lang as Language }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!url || !serviceKey) {
    res.status(500).json({ error: 'Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
    return
  }

  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) {
    res.status(401).json({ error: 'Not signed in' })
    return
  }

  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1. Who is calling?
  const { data: caller, error: callerError } = await admin.auth.getUser(token)
  if (callerError || !caller.user) {
    res.status(401).json({ error: 'Your session has expired — sign in again' })
    return
  }

  // 2. Are they the owner? RLS does not apply to the service-role client, so
  //    this check is the only thing standing between this route and anyone.
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.user.id)
    .single()
  if (profile?.role !== 'admin') {
    res.status(403).json({ error: 'Only the owner can create portal accounts' })
    return
  }

  const payload = readPayload(req.body)
  if (typeof payload === 'string') {
    res.status(400).json({ error: payload })
    return
  }

  // 3. Create the auth user. email_confirm skips the verification email: the
  //    owner hands these credentials over in person or by phone.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
  })
  if (createError || !created.user) {
    const taken = /already|exists|registered/i.test(createError?.message ?? '')
    res.status(taken ? 409 : 500).json({
      error: taken
        ? 'An account already uses that email address'
        : (createError?.message ?? 'Could not create the account'),
    })
    return
  }

  // 4. Attach the app-level profile.
  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    name: payload.name,
    email: payload.email,
    role: 'parent',
    family_id: payload.familyId,
    preferred_language: payload.preferredLanguage,
  })
  if (profileError) {
    // Roll the auth user back. Left behind, it would block every retry with
    // "already exists" while having no profile to sign in against.
    await admin.auth.admin.deleteUser(created.user.id)
    res.status(500).json({ error: profileError.message })
    return
  }

  res.status(200).json({ id: created.user.id, email: payload.email })
}

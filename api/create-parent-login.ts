import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/lib/database.types.js'
import {
  createParentAccount,
  EMAIL_PATTERN,
  MAX_PASSWORD,
  MIN_PASSWORD,
  PORTAL_LANGUAGES,
  type PortalLanguage,
} from './_lib/parentLogin.js'

/**
 * Creates a parent portal account.
 *
 * This runs on the server because it needs the service-role key: creating a
 * Supabase Auth user is not something the browser may do. That key must never
 * be VITE_-prefixed, or Vite would inline it into the client bundle.
 *
 * The caller's own access token is verified here and their profile checked for
 * role = 'admin'. Without that, anyone who found this URL could create logins.
 *
 * The account itself is made by `createParentAccount` in `_lib/parentLogin.ts`,
 * which Ro's approval path also uses, so the two cannot create logins differently.
 */

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

interface Payload {
  familyId: string
  name: string
  email: string
  password: string
  preferredLanguage: PortalLanguage
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
  if (!EMAIL_PATTERN.test(email)) return 'A valid email address is required'
  if (password.length < MIN_PASSWORD) return `The password must be at least ${String(MIN_PASSWORD)} characters`
  if (password.length > MAX_PASSWORD) return 'That password is too long'
  if (!PORTAL_LANGUAGES.includes(lang as PortalLanguage)) return 'Unsupported language'

  return { familyId, name, email, password, preferredLanguage: lang as PortalLanguage }
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

  // 3. Create the auth user and attach its profile, rolling back on failure.
  const result = await createParentAccount(payload)
  if (!result.ok) {
    res.status(result.status).json({ error: result.error })
    return
  }

  res.status(200).json({ id: result.id, email: result.email })
}

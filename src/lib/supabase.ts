import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

/**
 * The browser Supabase client.
 *
 * Only the two VITE_-prefixed values may appear here — anything imported into
 * this file ships to the browser. The service-role key and the OpenRouter key
 * are server-only and must never be referenced from `src/`.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to ' +
      '.env.local and fill both in, then restart the dev server.',
  )
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

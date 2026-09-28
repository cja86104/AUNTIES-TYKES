/**
 * Server-side id generation, matching `uid()` in src/lib/helpers.ts.
 *
 * The client helper is imported by browser code and reaches for `crypto` with a
 * Safari fallback; a serverless function needs neither branch and must not pull
 * a browser module into its bundle. Same prefix_uuid shape, so an id written by
 * a function is indistinguishable from one written by the app — which matters
 * because these are the text primary keys every table has used since 0003.
 */
import { randomUUID } from 'node:crypto'

export function uid(prefix = 'id'): string {
  return `${prefix}_${randomUUID()}`
}

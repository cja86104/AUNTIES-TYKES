/**
 * A child's status, as the owner sees it: every value, and its label.
 *
 * Mirrors the `child_status` enum (migrations 0001, 0025 and 0026). Which statuses
 * count as enrolled — on the roster, in daily reports, in invoice prefill and
 * in Ro's lists — is decided in src/lib/schedule.ts (`isEnrolled`), next to
 * the resolver that decides who is expected.
 *
 * Dependency-free (type imports are erased) so Ro's serverless functions in
 * api/ can import it.
 */
import type { Child, ChildStatus } from '../types'

/** Every status, in the order the status dropdown lists them. */
export const CHILD_STATUSES = ['active', 'summer_camp', 'waitlist', 'unenrolled'] as const satisfies readonly ChildStatus[]

/** What the owner reads. Keyed by every status, so a new one cannot go unlabeled. */
export const CHILD_STATUS_LABELS: Record<ChildStatus, string> = {
  active: 'Active',
  summer_camp: 'Summer Camp',
  waitlist: 'Waitlist',
  unenrolled: 'Unenrolled',
}

/**
 * A family is unenrolled when it has children and every one of them is
 * unenrolled. Status lives on the child, so this is read, never stored.
 */
export function isFamilyUnenrolled(kids: readonly Pick<Child, 'status'>[]): boolean {
  return kids.length > 0 && kids.every((k) => k.status === 'unenrolled')
}

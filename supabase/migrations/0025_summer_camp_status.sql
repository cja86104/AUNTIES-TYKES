-- ============================================================================
-- 0025 — "Summer Camp" as a child status.
--
-- The owner also runs a summer camp. A camp child is enrolled exactly like an
-- active one: expected on their scheduled days, written daily reports, billed
-- by invoice prefill and listed by Ro. Only the label differs, so she can tell
-- camp children apart and filter them on the Children page.
--
-- Which statuses count as enrolled is decided in ONE place in the app,
-- `ENROLLED_STATUSES` / `isEnrolled` in src/lib/schedule.ts. Nothing in the
-- database (RLS, functions, constraints) reads children.status, so adding the
-- value is the whole schema change.
--
-- Additive only: no existing row changes. Idempotent: safe to run more than
-- once. `add value` cannot run inside a transaction block on older Postgres,
-- so run this file on its own.
-- ============================================================================

alter type public.child_status add value if not exists 'summer_camp' before 'waitlist';

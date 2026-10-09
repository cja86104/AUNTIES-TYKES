-- ============================================================================
-- 0022 — a "seen" marker for the Ro Guide.
--
-- section_views gains 'ro_guide', so the console can show a "New" pill on the
-- Ro Guide link in the sidebar until the owner opens it — and again whenever
-- the guide is updated (RO_GUIDE_UPDATED_AT in src/data/roGuide.ts), since Ro
-- keeps gaining things she can do. Same marker table, same per-account
-- behaviour as every other section: opening it on a phone clears it on a
-- laptop.
--
-- Until this runs, opening the guide simply cannot record the marker: the write
-- fails quietly (markSectionSeen in useStore.ts swallows it), the page still
-- works, and the pill stays lit. Nothing else depends on it.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

alter table public.section_views drop constraint if exists section_views_section_check;

alter table public.section_views
  add constraint section_views_section_check
  check (section in ('documents', 'messages', 'daily_reports', 'inquiries', 'schedule_changes', 'ro_guide'));

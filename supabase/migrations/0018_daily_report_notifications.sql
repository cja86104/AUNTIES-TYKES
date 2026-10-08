-- ============================================================================
-- "New" markers for daily reports.
--
-- section_views (0008) records when each person last opened a section; the app
-- compares that against each report's created_at to badge the reports a
-- parent has not seen yet. The table only accepted 'documents' and
-- 'messages', so 'daily_reports' is added to its check constraint.
--
-- Incidents waiting for a parent's acknowledgement are counted separately in
-- the app and do NOT clear when the section is opened — only acknowledging
-- clears them.
-- ============================================================================

alter table public.section_views drop constraint if exists section_views_section_check;

alter table public.section_views
  add constraint section_views_section_check
  check (section in ('documents', 'messages', 'daily_reports'));

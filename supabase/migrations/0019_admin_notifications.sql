-- ============================================================================
-- 0019 — notifications for what comes in to the owner.
--
-- 1. section_views gains 'inquiries', so the console can badge contact-form
--    inquiries that arrived since she last opened the inquiry inbox.
-- 2. `leads` joins the supabase_realtime publication. It was left out of 0012
--    because no portal reads it, the same gap 0014 closed for enrollments: an
--    inquiry sent while the console is open only appeared after a reload.
--    Realtime runs each row through the table's RLS SELECT policy, and only
--    admin_all grants SELECT on leads, so no parent or visitor is sent one.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

alter table public.section_views drop constraint if exists section_views_section_check;

alter table public.section_views
  add constraint section_views_section_check
  check (section in ('documents', 'messages', 'daily_reports', 'inquiries'));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'leads'
  ) then
    alter publication supabase_realtime add table public.leads;
  end if;
end $$;

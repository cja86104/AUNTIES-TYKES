-- ============================================================================
-- 0014 — deliver enrollment submissions live.
--
-- 0012 put every table both portals read into the supabase_realtime
-- publication. `enrollments` was left out because no portal reads it — but the
-- owner's console does, and Future Arrivals now carries a badge counting the
-- submissions waiting on her. Without this, a family submitting the public form
-- while she has the console open shows up only after a reload.
--
-- Safe as it stands: Realtime runs every row through the table's own RLS SELECT
-- policy for the subscriber's JWT. Only `admin_all` grants SELECT on
-- enrollments; the public form's anon role may insert and cannot read back, so a
-- parent's or a visitor's client is never sent a submission.
--
-- Idempotent, like 0012: safe to run more than once.
-- ============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'enrollments'
  ) then
    alter publication supabase_realtime add table public.enrollments;
  end if;
end $$;

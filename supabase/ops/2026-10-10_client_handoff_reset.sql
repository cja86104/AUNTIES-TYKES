-- =============================================================================
-- Client handoff reset — Aunties Tykes
-- Written 2026-10-10. Run ONCE, by hand, in the Supabase SQL Editor for the
-- Aunties Tykes project. This is NOT a migration: it lives outside
-- supabase/migrations on purpose so it can never run as part of a deploy.
--
-- What it does
--   1. Refuses to run unless auntieschool28@gmail.com is the ONLY Auth user.
--   2. Empties every app data table (families, children, attendance, logs,
--      invoices, payments, messages, documents metadata, calendar, pickups,
--      schedules, enrollments, inquiries, waitlist, Ro history, ...).
--   3. Resets the invoice counter so the first invoice is INV-1045
--      (the floor set in 0015_invoice_number_counter.sql).
--   4. Creates the owner's profile with role = 'admin'.
--
-- What it keeps
--   - public.settings (business name, address, phone, email, hours, rates).
--   - All tables, functions, RLS policies and the storage bucket itself.
--
-- What it cannot do
--   Supabase blocks deleting Storage files through SQL. Empty the `documents`
--   bucket in the dashboard (Storage -> documents -> select all -> Delete).
--   The check at the bottom reports how many files remain.
--
-- Steps 1-4 run inside one DO block, which is atomic: if any statement fails,
-- nothing is changed. TRUNCATE is deliberately WITHOUT CASCADE, so a table
-- that is not listed here but references one that is makes the whole block
-- fail instead of being wiped silently.
-- =============================================================================

do $$
declare
  owner_email constant text := 'auntieschool28@gmail.com';
  owner_id    uuid;
  user_count  bigint;
begin
  select count(*) into user_count from auth.users;

  select id into owner_id
    from auth.users
   where lower(email) = owner_email;

  if owner_id is null then
    raise exception 'No Auth user with email %. Create her login in Authentication -> Users first. Nothing was changed.', owner_email;
  end if;

  if user_count <> 1 then
    raise exception 'Expected exactly 1 Auth user, found %. Delete every other user first. Nothing was changed.', user_count;
  end if;

  truncate table
    public.ai_audit_log,
    public.ai_commitments,
    public.ai_standing_rules,
    public.announcements,
    public.attendance,
    public.attendance_visits,
    public.calendar_events,
    public.child_schedule_changes,
    public.child_schedule_plans,
    public.children,
    public.daily_logs,
    public.document_acknowledgements,
    public.documents,
    public.enrollments,
    public.families,
    public.family_contacts,
    public.incident_acknowledgements,
    public.invoices,
    public.leads,
    public.payments,
    public.pickup_authorizations,
    public.pickup_events,
    public.profiles,
    public.section_views,
    public.thread_messages,
    public.threads,
    public.waitlist_prospects;

  -- is_called = true: 1044 counts as issued, so nextval() returns 1045.
  perform setval('public.invoice_number_seq', 1044, true);

  insert into public.profiles (id, name, email, role, family_id, title, preferred_language)
  select u.id, 'Auntie', u.email, 'admin', null, null, 'en'
    from auth.users u
   where u.id = owner_id;
end $$;

-- =============================================================================
-- Verification — read-only. Run after the block above.
-- Expected: every table 0 rows except `profiles` (1) and `settings` (1).
-- Any other non-zero row means something was not wiped.
-- =============================================================================
select t.table_name,
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from public.%I', t.table_name),
                           false, true, '')))[1]::text::bigint as row_count
  from information_schema.tables t
 where t.table_schema = 'public'
   and t.table_type = 'BASE TABLE'
union all
select 'storage: documents bucket files',
       (select count(*) from storage.objects where bucket_id = 'documents')
union all
select 'auth.users', (select count(*) from auth.users)
order by 1;

-- Her profile — expect one row: role = admin, name = Auntie.
select p.id, p.name, p.email, p.role, p.family_id
  from public.profiles p;

-- Next invoice number — expect last_value 1044, is_called true (next = INV-1045).
select last_value, is_called from public.invoice_number_seq;

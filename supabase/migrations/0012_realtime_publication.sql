-- ============================================================================
-- Enable Realtime (Postgres Changes) for every table the admin dashboard and
-- the family portal keep on screen while signed in.
--
-- Today, two tabs open at once -- an admin console and a family's portal,
-- say -- do not see each other's writes. The client only re-fetches on
-- login, on app bootstrap, and when a parent account is created; nothing
-- re-fetches when another session writes a row. A family that leaves a tab
-- open (or never signs back out) can miss an announcement, a chat reply, a
-- new invoice, today's check-in -- indefinitely, until they happen to
-- reload.
--
-- This migration only turns on the *broadcast* side: it adds these tables to
-- the supabase_realtime publication, which is what lets a subscribed client
-- hear about a row changing at all. It does not touch who is allowed to see
-- what -- a subscriber's Realtime connection is authenticated with their own
-- JWT, and Supabase re-runs each table's existing RLS SELECT policy against
-- that JWT before delivering a row's change to that particular client. Every
-- table below already has RLS enabled (see 0001_init.sql), so the same
-- boundaries that already apply to a normal SELECT apply to its Realtime
-- feed: a parent's connection is filtered exactly like their ordinary reads
-- are, and hears about their own family's rows only; a signed-in owner
-- (is_admin()) hears about everything, as they can already read everything.
--
-- Scoped to tables a signed-in tab can actually be looking at: the admin
-- dashboard and the parent portal. Left out on purpose: `profiles` (a
-- person's own row barely changes after signup), `enrollments`, `leads`, and
-- `waitlist_prospects` (the owner's internal pipeline -- nothing subscribes
-- to these live today), and `section_views` (private per-user bookkeeping,
-- never shown to anyone else). Adding a table later is one more line here,
-- run again.
--
-- Wrapped in a guard against re-adding a table that's already a publication
-- member, since ALTER PUBLICATION ... ADD TABLE has no "IF NOT EXISTS" and
-- this project's migrations are applied by hand (no supabase/config.toml, no
-- migration-runner script in package.json) -- safe to paste into the SQL
-- editor twice by accident.
-- ============================================================================

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'families',
    'children',
    'attendance',
    'daily_logs',
    'invoices',
    'payments',
    'documents',
    'document_acknowledgements',
    'announcements',
    'threads',
    'thread_messages',
    'calendar_events'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;

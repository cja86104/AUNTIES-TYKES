-- ============================================================================
-- Incident / injury reports on a daily report, with parent acknowledgement.
--
-- daily_logs.incident is NULL when nothing happened. Otherwise it holds
--   { "time", "location", "description", "injury", "firstAid",
--     "witnessedBy", "parentNotified", "recordedAt" }
-- `recordedAt` is restamped by the app every time the details change. It is
-- the incident's version.
--
-- A parent acknowledges one version. If the owner later edits the incident,
-- the earlier acknowledgement no longer matches `recordedAt` and the parent is
-- asked again, so a record never shows a parent "read" wording they never saw.
-- Rows are insert-only: a parent cannot rewrite when they acknowledged.
-- ============================================================================

alter table public.daily_logs
  add column if not exists incident jsonb;

create table if not exists public.incident_acknowledgements (
  log_id           text        not null references public.daily_logs(id) on delete cascade,
  profile_id       uuid        not null references public.profiles(id) on delete cascade,
  incident_version text        not null,
  acknowledged_at  timestamptz not null default now(),
  primary key (log_id, profile_id, incident_version)
);

alter table public.incident_acknowledgements enable row level security;

drop policy if exists admin_all             on public.incident_acknowledgements;
drop policy if exists own_incident_acks_select on public.incident_acknowledgements;
drop policy if exists own_incident_acks_insert on public.incident_acknowledgements;

create policy admin_all on public.incident_acknowledgements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy own_incident_acks_select on public.incident_acknowledgements
  for select to authenticated using (profile_id = auth.uid());

-- A parent may acknowledge only as themselves, only a report about a child in
-- their own family, and only the version of the incident that is current.
create policy own_incident_acks_insert on public.incident_acknowledgements
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.daily_logs l
      join public.children c on c.id = l.child_id
      where l.id = incident_acknowledgements.log_id
        and c.family_id = public.current_family_id()
        and l.incident is not null
        and l.incident ->> 'recordedAt' = incident_acknowledgements.incident_version
    )
  );

-- Live updates, matching 0012_realtime_publication.sql.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'incident_acknowledgements'
  ) then
    alter publication supabase_realtime add table public.incident_acknowledgements;
  end if;
end $$;

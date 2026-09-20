-- ============================================================================
-- "You have something new" markers.
--
-- One row per person per section, holding the moment they last opened it.
-- Anything newer than that is new to them. Kept per account rather than per
-- browser so checking on a phone also clears it on a laptop.
--
-- Deliberately its own table rather than columns on public.profiles: profiles
-- already carries role and family_id, and widening what a parent may write to
-- that row is not worth it for a timestamp. This mirrors
-- public.document_acknowledgements, which solves the same shape of problem.
-- ============================================================================

create table if not exists public.section_views (
  profile_id uuid        not null references public.profiles(id) on delete cascade,
  section    text        not null check (section in ('documents', 'messages')),
  seen_at    timestamptz not null default now(),
  primary key (profile_id, section)
);

alter table public.section_views enable row level security;

-- Everyone, owner and parent alike, reads and writes only their own markers.
-- There is nothing here worth showing one person about another, so there is
-- deliberately no admin-wide policy.

drop policy if exists own_section_views_select on public.section_views;
drop policy if exists own_section_views_insert on public.section_views;
drop policy if exists own_section_views_update on public.section_views;

create policy own_section_views_select on public.section_views
  for select to authenticated using (profile_id = auth.uid());

create policy own_section_views_insert on public.section_views
  for insert to authenticated with check (profile_id = auth.uid());

-- The app upserts this marker on every visit, so the conflict path needs an
-- UPDATE policy as well as the INSERT one.
create policy own_section_views_update on public.section_views
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

grant select, insert, update, delete on public.section_views to authenticated;

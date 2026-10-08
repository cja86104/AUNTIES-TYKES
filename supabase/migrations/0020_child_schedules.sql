-- ============================================================================
-- 0020 — real per-day child schedules, one-off schedule changes, and one row
-- per visit for split-day attendance.
--
-- 1. children.schedule — the weekly pattern. jsonb, NULLABLE:
--      { "mon": [{"start":"07:00","end":"09:00"},{"start":"15:00","end":"18:00"}],
--        "sat": [{"start":"09:00","end":"13:00"}] }
--    Keys mon..sun, each an array of blocks. A missing or empty day = not in.
--    NULL  = never set (every child that existed before this migration).
--    {}    = set, and explicitly no scheduled days.
--    The two must stay distinguishable: NULL is "schedule unknown", never
--    "not expected". `plan` is left exactly as it is (live data, additive only).
--
-- 2. child_schedule_changes — one row per child per date overriding the weekly
--    pattern for that date. `blocks = []` means not coming that day. Parents
--    see their own children's changes (mirrors `visible_calendar` in 0004,
--    minus the visible_to_parents flag: the owner decided parents always see
--    these).
--
-- 3. attendance_visits — one row per arrival/departure. `attendance` stays the
--    day-level summary (status, first check-in, latest check-out); before this,
--    a second check-in on the same day overwrote the first visit's times.
--    Backfilled with one visit per existing attendance row that has a check-in.
--
-- 4. section_views gains 'schedule_changes' for the parent "New" badge.
-- 5. Both new tables join the supabase_realtime publication (pattern of 0012).
--
-- Block rules, enforced here AND in the app: 24h HH:mm, end > start (so no
-- block crosses midnight), blocks sorted and non-overlapping, at most 3 a day.
--
-- Idempotent: safe to run more than once.
-- APPLY THIS BEFORE deploying the app code that writes children.schedule.
-- ============================================================================

-- ------------------------------ validators ----------------------------------

create or replace function public.valid_schedule_blocks(blocks jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  block    jsonb;
  b_start  text;
  b_end    text;
  prev_end text := null;
begin
  if blocks is null or jsonb_typeof(blocks) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(blocks) > 3 then
    return false;
  end if;

  for block in
    select t.value from jsonb_array_elements(blocks) with ordinality as t(value, idx) order by t.idx
  loop
    if jsonb_typeof(block) <> 'object' then
      return false;
    end if;
    if (select count(*) from jsonb_object_keys(block)) <> 2 then
      return false;
    end if;
    b_start := block ->> 'start';
    b_end   := block ->> 'end';
    if b_start is null or b_end is null
       or b_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or b_end   !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      return false;
    end if;
    -- Zero-padded HH:mm compares correctly as text.
    if b_end <= b_start then
      return false;
    end if;
    -- Sorted and non-overlapping. Touching (09:00–12:00, 12:00–15:00) is allowed.
    if prev_end is not null and b_start < prev_end then
      return false;
    end if;
    prev_end := b_end;
  end loop;

  return true;
end;
$$;

create or replace function public.valid_weekly_schedule(schedule jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  day_key text;
begin
  if schedule is null or jsonb_typeof(schedule) <> 'object' then
    return false;
  end if;
  for day_key in select jsonb_object_keys(schedule) loop
    if day_key not in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun') then
      return false;
    end if;
    if not public.valid_schedule_blocks(schedule -> day_key) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- --------------------------- 1. children.schedule ---------------------------

alter table public.children
  add column if not exists schedule jsonb;

alter table public.children drop constraint if exists children_schedule_ck;
alter table public.children
  add constraint children_schedule_ck
  check (schedule is null or public.valid_weekly_schedule(schedule));

-- ------------------------ 2. child_schedule_changes -------------------------

create table if not exists public.child_schedule_changes (
  id         text        primary key,
  child_id   text        not null references public.children(id) on delete cascade,
  date       date        not null,
  -- ScheduleBlock[]; empty = not coming that day.
  blocks     jsonb       not null default '[]'::jsonb,
  note       text        not null default '',
  created_at timestamptz not null default now(),
  -- Restamped by the app on every edit, so an edited change shows as new to
  -- the parent again rather than silently moving their child's times.
  updated_at timestamptz not null default now(),
  created_by uuid        references public.profiles(id) on delete set null,
  unique (child_id, date)
);

alter table public.child_schedule_changes drop constraint if exists child_schedule_changes_blocks_ck;
alter table public.child_schedule_changes
  add constraint child_schedule_changes_blocks_ck
  check (public.valid_schedule_blocks(blocks));

create index if not exists child_schedule_changes_date_idx on public.child_schedule_changes (date);

alter table public.child_schedule_changes enable row level security;

drop policy if exists admin_all            on public.child_schedule_changes;
drop policy if exists own_schedule_changes on public.child_schedule_changes;

create policy admin_all on public.child_schedule_changes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- A parent sees a change only for a child in their own family. Without this,
-- "Johnny is off Tuesday" would be readable by every other family.
create policy own_schedule_changes on public.child_schedule_changes
  for select to authenticated using (
    exists (
      select 1 from public.children c
      where c.id = child_schedule_changes.child_id
        and c.family_id = public.current_family_id()
    )
  );

grant select, insert, update, delete on public.child_schedule_changes to authenticated;

-- --------------------------- 3. attendance_visits ---------------------------

create table if not exists public.attendance_visits (
  id         text        primary key,
  child_id   text        not null references public.children(id) on delete cascade,
  date       date        not null,
  check_in   time        not null,
  -- NULL while the child is still here on this visit.
  check_out  time,
  created_at timestamptz not null default now()
);

alter table public.attendance_visits drop constraint if exists attendance_visits_order_ck;
alter table public.attendance_visits
  add constraint attendance_visits_order_ck
  check (check_out is null or check_out >= check_in);

create index if not exists attendance_visits_child_date_idx on public.attendance_visits (child_id, date);
create index if not exists attendance_visits_date_idx on public.attendance_visits (date);

-- At most one open visit per child per day: a second check-in while the first
-- visit is still open is a mistake, not a new visit.
create unique index if not exists attendance_visits_one_open_idx
  on public.attendance_visits (child_id, date)
  where check_out is null;

alter table public.attendance_visits enable row level security;

drop policy if exists admin_all             on public.attendance_visits;
drop policy if exists own_attendance_visits on public.attendance_visits;

create policy admin_all on public.attendance_visits
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Mirrors own_attendance on public.attendance.
create policy own_attendance_visits on public.attendance_visits
  for select to authenticated using (
    exists (
      select 1 from public.children c
      where c.id = attendance_visits.child_id
        and c.family_id = public.current_family_id()
    )
  );

grant select, insert, update, delete on public.attendance_visits to authenticated;

-- Backfill: one visit per existing attendance row that has a check-in. Refuses
-- to run rather than drop or alter a row whose times are out of order, so no
-- recorded time is ever silently lost.
do $$
declare
  bad integer;
begin
  select count(*) into bad
  from public.attendance a
  where a.check_in is not null
    and a.check_out is not null
    and a.check_out < a.check_in;

  if bad > 0 then
    raise exception
      '0020: % attendance row(s) have check_out earlier than check_in. Fix those rows, then run this migration again.',
      bad;
  end if;

  insert into public.attendance_visits (id, child_id, date, check_in, check_out, created_at)
  select 'vis_' || gen_random_uuid()::text, a.child_id, a.date, a.check_in, a.check_out, a.created_at
  from public.attendance a
  where a.check_in is not null
    and not exists (
      select 1 from public.attendance_visits v
      where v.child_id = a.child_id and v.date = a.date
    );
end $$;

-- ------------------------- 4. section_views marker --------------------------

alter table public.section_views drop constraint if exists section_views_section_check;

alter table public.section_views
  add constraint section_views_section_check
  check (section in ('documents', 'messages', 'daily_reports', 'inquiries', 'schedule_changes'));

-- --------------------------- 5. realtime delivery ---------------------------
-- Realtime runs each row through the table's RLS SELECT policy for the
-- subscriber's JWT, so a parent's tab only hears about their own children.

do $$
declare
  tbl text;
begin
  foreach tbl in array array['child_schedule_changes', 'attendance_visits']
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

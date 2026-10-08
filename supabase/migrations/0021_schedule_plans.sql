-- ============================================================================
-- 0021 — weekly schedules that start on a future date.
--
-- children.schedule (0020) is the weekly pattern in force now. A family often
-- knows a lasting change ahead of time ("from the 20th, Mon/Wed/Fri"), so this
-- holds a NEW weekly pattern with the date it starts:
--
--   child_schedule_plans — one row per child per start date. `schedule` uses
--   the same shape and the same validator as children.schedule.
--
-- The app's resolver (src/lib/schedule.ts) uses, for any date, the latest plan
-- that has started, else children.schedule, so attendance, the parent portal
-- and Ro are right on the start date even if nobody opens anything that day.
--
-- promote_due_schedule_plans(today) then folds started plans into the child
-- record, so children.schedule always shows what is in force and editing the
-- profile edits the real schedule. Owner only; one transaction; called when the
-- console loads and when Ro starts. No scheduled job.
--
-- Parents read their own children's plans (mirrors child_schedule_changes) and
-- see them through the existing 'schedule_changes' "New" marker.
--
-- Idempotent: safe to run more than once. Requires 0020.
-- ============================================================================

create table if not exists public.child_schedule_plans (
  id         text        primary key,
  child_id   text        not null references public.children(id) on delete cascade,
  starts_on  date        not null,
  -- WeeklySchedule, never empty: a plan with no days is not a schedule.
  schedule   jsonb       not null,
  note       text        not null default '',
  created_at timestamptz not null default now(),
  -- Restamped by the app on every edit, so an edited plan shows as new again.
  updated_at timestamptz not null default now(),
  created_by uuid        references public.profiles(id) on delete set null,
  unique (child_id, starts_on)
);

-- True when at least one day has a time. A function because Postgres does not
-- allow a subquery directly inside a check constraint.
create or replace function public.schedule_has_days(schedule jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_each(schedule) as day(key, blocks)
    where jsonb_typeof(day.blocks) = 'array' and jsonb_array_length(day.blocks) > 0
  )
$$;

alter table public.child_schedule_plans drop constraint if exists child_schedule_plans_schedule_ck;
alter table public.child_schedule_plans
  add constraint child_schedule_plans_schedule_ck
  check (public.valid_weekly_schedule(schedule) and public.schedule_has_days(schedule));

create index if not exists child_schedule_plans_starts_on_idx on public.child_schedule_plans (starts_on);

alter table public.child_schedule_plans enable row level security;

drop policy if exists admin_all          on public.child_schedule_plans;
drop policy if exists own_schedule_plans on public.child_schedule_plans;

create policy admin_all on public.child_schedule_plans
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy own_schedule_plans on public.child_schedule_plans
  for select to authenticated using (
    exists (
      select 1 from public.children c
      where c.id = child_schedule_plans.child_id
        and c.family_id = public.current_family_id()
    )
  );

grant select, insert, update, delete on public.child_schedule_plans to authenticated;

-- ------------------------------- promotion ----------------------------------
-- `today` comes from the caller, in the daycare's time zone (America/New_York):
-- the database clock is UTC and would start a plan at 8 pm the evening before.

create or replace function public.promote_due_schedule_plans(today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  promoted integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only the owner can apply schedule plans';
  end if;

  -- For each child, the most recent plan that has started becomes the schedule.
  with latest as (
    select distinct on (p.child_id) p.child_id, p.schedule
    from public.child_schedule_plans p
    where p.starts_on <= today
    order by p.child_id, p.starts_on desc
  )
  update public.children c
  set schedule = latest.schedule
  from latest
  where c.id = latest.child_id;
  get diagnostics promoted = row_count;

  -- Every started plan is now history: the newest is on the child, older ones were superseded.
  delete from public.child_schedule_plans where starts_on <= today;

  return promoted;
end;
$$;

revoke execute on function public.promote_due_schedule_plans(date) from public;
grant  execute on function public.promote_due_schedule_plans(date) to authenticated;

-- ------------------------------- realtime -----------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'child_schedule_plans'
  ) then
    alter publication supabase_realtime add table public.child_schedule_plans;
  end if;
end $$;

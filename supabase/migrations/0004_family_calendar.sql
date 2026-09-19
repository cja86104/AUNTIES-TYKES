-- ============================================================================
-- Family Calendar
--
-- Holds only AUTHORED events. Birthdays are derived from children.dob and
-- payment due dates from invoices.due_date — storing those would mean
-- re-entering birthdays every year and letting them drift when a date of
-- birth is corrected.
-- ============================================================================

create type public.calendar_event_kind as enum (
  'closure',            -- closed all day: holiday, vacation day
  'early_close',        -- open, but care ends early
  'activity',           -- picture day, pajama day, theme day
  'reminder',           -- dated note: "bring a change of clothes"
  'schedule_exception'  -- one child only: "Johnny is not coming Tuesday"
);

create table public.calendar_events (
  id                 text primary key,
  kind               public.calendar_event_kind not null,
  title              text not null,
  note               text not null default '',
  starts_on          date not null,
  /** NULL means a single day; set for a vacation week and the like. */
  ends_on            date,
  /** Only for early_close: the time care actually ends that day. */
  closes_at          time,
  /** Only for schedule_exception. NULL means the event is daycare-wide. */
  child_id           text references public.children(id) on delete cascade,
  visible_to_parents boolean not null default true,
  created_at         timestamptz not null default now(),
  created_by         uuid references public.profiles(id) on delete set null,

  constraint calendar_events_range_ck
    check (ends_on is null or ends_on >= starts_on),
  -- A schedule exception is meaningless without a child, and every other kind
  -- is daycare-wide, so a stray child_id would quietly narrow who can see it.
  constraint calendar_events_child_ck
    check (
      (kind = 'schedule_exception' and child_id is not null)
      or (kind <> 'schedule_exception' and child_id is null)
    ),
  constraint calendar_events_closes_ck
    check (kind = 'early_close' or closes_at is null)
);

create index calendar_events_starts_on_idx on public.calendar_events (starts_on);
create index calendar_events_child_id_idx on public.calendar_events (child_id);

alter table public.calendar_events enable row level security;

create policy admin_all on public.calendar_events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- A parent sees an event only if it is shared AND it is either daycare-wide or
-- about their own child. Without the second half, "Johnny is not coming
-- Tuesday" would be readable by every other family.
create policy visible_calendar on public.calendar_events
  for select to authenticated using (
    visible_to_parents
    and (
      child_id is null
      or exists (
        select 1 from public.children c
        where c.id = calendar_events.child_id
          and c.family_id = public.current_family_id()
      )
    )
  );

grant select, insert, update, delete on public.calendar_events to authenticated;

-- ----------------------------------------------------------------------------
-- The dashboard "Waitlist priority" card was the only thing reading
-- waitlist_prospects. The table is left in place rather than dropped, since
-- dropping cannot be undone. Once you are sure, run:
--
--   drop table public.waitlist_prospects;
-- ----------------------------------------------------------------------------

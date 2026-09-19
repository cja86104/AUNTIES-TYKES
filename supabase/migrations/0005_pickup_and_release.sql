-- ============================================================================
-- Pickup and release controls
--
-- One contact list per family, with flags, replacing the emergency contacts
-- that lived in families.emergency as jsonb. Each person is entered once, and
-- the periodic review is one list to walk rather than two that drift.
--
-- families.emergency and families.secondary are LEFT IN PLACE by this
-- migration and backfilled from, not dropped. Removing them is a separate,
-- irreversible step — see the note at the bottom.
-- ============================================================================

create table public.family_contacts (
  id           text primary key,
  family_id    text not null references public.families(id) on delete cascade,
  name         text not null,
  relation     text not null default '',
  phone        text not null default '',

  /** Call this person in an emergency. */
  is_emergency boolean not null default false,
  /** This person may collect the child. A deliberate, separate decision. */
  can_pick_up  boolean not null default false,
  /** Cleared without deleting, so pickup history keeps pointing somewhere. */
  active       boolean not null default true,

  /** Free text: "photo on file", "always check ID". Not a document store. */
  id_note      text not null default '',
  photo_path   text,

  /** Set when the owner last confirmed this person is still current. */
  reviewed_at  date,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index family_contacts_family_id_idx on public.family_contacts (family_id);
create index family_contacts_pickup_idx on public.family_contacts (family_id) where can_pick_up and active;

-- ---------------------------------------------------------------------------
-- Backfill from the existing jsonb. Idempotent: deterministic ids plus
-- ON CONFLICT DO NOTHING, so re-running changes nothing.
--
-- can_pick_up is FALSE for every backfilled row, on purpose. Being an
-- emergency contact is not the same as being approved to take a child home,
-- and inheriting that flag would silently authorise people nobody approved.
-- The owner ticks the box per person.
-- ---------------------------------------------------------------------------
insert into public.family_contacts
  (id, family_id, name, relation, phone, is_emergency, can_pick_up, sort_order)
select
  f.id || '_em' || (t.ord - 1)::text,
  f.id,
  coalesce(t.c ->> 'name', ''),
  coalesce(t.c ->> 'relation', ''),
  coalesce(t.c ->> 'phone', ''),
  true,
  false,
  (t.ord - 1)::int
from public.families f
cross join lateral jsonb_array_elements(f.emergency) with ordinality as t(c, ord)
where coalesce(t.c ->> 'name', '') <> ''
on conflict (id) do nothing;

insert into public.family_contacts
  (id, family_id, name, relation, phone, is_emergency, can_pick_up, sort_order)
select
  f.id || '_sec',
  f.id,
  f.secondary ->> 'name',
  coalesce(f.secondary ->> 'relation', ''),
  coalesce(f.secondary ->> 'phone', ''),
  false,
  false,
  -1
from public.families f
where coalesce(f.secondary ->> 'name', '') <> ''
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Temporary authorisations: "my sister is collecting on Thursday".
-- ---------------------------------------------------------------------------
create type public.pickup_auth_status as enum ('pending', 'approved', 'declined', 'expired');

create table public.pickup_authorizations (
  id           text primary key,
  child_id     text not null references public.children(id) on delete cascade,
  family_id    text not null references public.families(id) on delete cascade,
  /** Either an existing contact, or a one-off person named inline. */
  contact_id   text references public.family_contacts(id) on delete set null,
  person_name  text not null default '',
  person_phone text not null default '',
  relation     text not null default '',
  starts_on    date not null,
  ends_on      date not null,
  note         text not null default '',
  status       public.pickup_auth_status not null default 'pending',
  requested_by uuid references public.profiles(id) on delete set null,
  reviewed_by  uuid references public.profiles(id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),

  constraint pickup_auth_range_ck check (ends_on >= starts_on),
  -- Must identify somebody, one way or the other.
  constraint pickup_auth_person_ck check (contact_id is not null or person_name <> '')
);

create index pickup_auth_child_idx on public.pickup_authorizations (child_id, starts_on);
create index pickup_auth_family_idx on public.pickup_authorizations (family_id);

-- ---------------------------------------------------------------------------
-- History: who actually collected, when, and who recorded it.
-- ---------------------------------------------------------------------------
create table public.pickup_events (
  id               text primary key,
  child_id         text not null references public.children(id) on delete cascade,
  picked_up_at     timestamptz not null default now(),
  contact_id       text references public.family_contacts(id) on delete set null,
  /** Kept as text as well, so history survives a contact being removed. */
  person_name      text not null,
  relation         text not null default '',
  authorization_id text references public.pickup_authorizations(id) on delete set null,
  recorded_by      uuid references public.profiles(id) on delete set null,
  note             text not null default '',
  created_at       timestamptz not null default now()
);

create index pickup_events_child_idx on public.pickup_events (child_id, picked_up_at desc);

-- ------------------------------ row level security --------------------------
alter table public.family_contacts        enable row level security;
alter table public.pickup_authorizations  enable row level security;
alter table public.pickup_events          enable row level security;

create policy admin_all on public.family_contacts       for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.pickup_authorizations for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.pickup_events         for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Parents read their own family's list; approving a contact stays the owner's.
create policy own_contacts on public.family_contacts
  for select to authenticated using (family_id = public.current_family_id());

create policy own_authorizations on public.pickup_authorizations
  for select to authenticated using (family_id = public.current_family_id());

-- A parent may raise a request, but only for their own family, only for their
-- own child, and only as 'pending'. Without the status check a parent could
-- insert a row already marked approved and authorise their own pickup.
create policy request_authorization on public.pickup_authorizations
  for insert to authenticated with check (
    status = 'pending'
    and family_id = public.current_family_id()
    and exists (
      select 1 from public.children c
      where c.id = pickup_authorizations.child_id
        and c.family_id = public.current_family_id()
    )
  );

-- Parents can see who collected their own child. They cannot write history.
create policy own_pickup_history on public.pickup_events
  for select to authenticated using (
    exists (
      select 1 from public.children c
      where c.id = pickup_events.child_id and c.family_id = public.current_family_id()
    )
  );

grant select, insert, update, delete on public.family_contacts to authenticated;
grant select, insert, update, delete on public.pickup_authorizations to authenticated;
grant select, insert, update, delete on public.pickup_events to authenticated;

-- ----------------------------------------------------------------------------
-- families.emergency and families.secondary are now duplicated into
-- family_contacts. They stay until the app has been reading the new table for
-- a while. When you are sure, and only then:
--
--   alter table public.families drop column emergency;
--   alter table public.families drop column secondary;
-- ----------------------------------------------------------------------------

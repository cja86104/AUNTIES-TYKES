-- ============================================================================
-- 0003 — convert primary keys from uuid to text.
--
-- The app generates its own ids (src/lib/helpers.ts uid()) and two of them are
-- human-facing: invoices are keyed 'INV-1045' and that string is rendered as
-- the invoice number in InvoiceView. uuid keys would have replaced it.
--
-- profiles.id stays uuid because it references auth.users(id); every column
-- pointing at a profile therefore stays uuid too. Everything else is text.
--
-- SAFE TO RUN ONLY WHILE THE TABLES ARE EMPTY. This drops and recreates them.
-- ============================================================================

drop table if exists
  public.document_acknowledgements, public.thread_messages, public.threads,
  public.payments, public.invoices, public.daily_logs, public.attendance,
  public.announcements, public.documents, public.children, public.profiles,
  public.enrollments, public.leads, public.waitlist_prospects,
  public.families, public.settings
  cascade;

drop function if exists public.is_admin() cascade;
drop function if exists public.current_family_id() cascade;

drop type if exists
  public.user_role, public.language, public.age_group, public.child_status,
  public.attendance_status, public.document_category, public.enrollment_status
  cascade;

-- ============================================================================

create extension if not exists pgcrypto;

-- ------------------------------- enums -------------------------------------
create type public.user_role         as enum ('admin','parent');
create type public.language          as enum ('en','vi','es');
create type public.age_group         as enum ('Infant','Toddler','Preschool');
create type public.child_status      as enum ('active','waitlist');
create type public.attendance_status as enum ('present','absent','expected','checked-out');
create type public.document_category as enum ('Handbooks','Policies','Forms','Menus','Calendars');
create type public.enrollment_status as enum ('pending','approved','declined');

-- ------------------------------ families ------------------------------------
create table public.families (
  id              text primary key,
  name            text        not null,
  primary_contact text        not null default '',
  relation        text        not null default '',
  email           text        not null default '',
  phone           text        not null default '',
  address         text        not null default '',
  -- Contact: { name, relation, phone }
  secondary       jsonb       not null default '{"name":"","relation":"","phone":""}'::jsonb,
  -- Contact[]
  emergency       jsonb       not null default '[]'::jsonb,
  joined_at       date        not null default current_date,
  notes           text        not null default '',
  created_at      timestamptz not null default now()
);

-- ------------------------------ profiles ------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  name               text             not null default '',
  email              text             not null,
  role               public.user_role not null default 'parent',
  family_id          text             references public.families(id) on delete set null,
  title              text,
  preferred_language public.language  not null default 'en',
  created_at         timestamptz      not null default now()
);
create index profiles_family_id_idx on public.profiles (family_id);

-- ------------------------------ children ------------------------------------
create table public.children (
  id          text primary key,
  family_id   text not null references public.families(id) on delete cascade,
  name        text not null,
  dob         date not null,
  age_group   public.age_group    not null,
  status      public.child_status not null default 'active',
  plan        text   not null default '',
  start_date  date,
  teacher     text   not null default '',
  allergies   text[] not null default '{}',
  medications text[] not null default '{}',
  notes       text   not null default '',
  -- Tailwind gradient stops used by the Avatar component
  hue         text   not null default 'from-[#4F77D9] to-[#7DA0F0]',
  created_at  timestamptz not null default now()
);
create index children_family_id_idx on public.children (family_id);

-- ----------------------------- attendance -----------------------------------
create table public.attendance (
  id         text primary key,
  child_id   text not null references public.children(id) on delete cascade,
  date       date not null,
  check_in   time,
  check_out  time,
  status     public.attendance_status not null default 'expected',
  note       text not null default '',
  created_at timestamptz not null default now(),
  unique (child_id, date)
);
create index attendance_date_idx on public.attendance (date);

-- ----------------------------- daily logs -----------------------------------
create table public.daily_logs (
  id         text primary key,
  child_id   text not null references public.children(id) on delete cascade,
  date       date not null,
  meals      text   not null default '',
  naps       text   not null default '',
  potty      text   not null default '',
  mood       text   not null default '',
  activities text[] not null default '{}',
  notes      text   not null default '',
  -- LogPhoto[]: { slot, url, caption }
  photos     jsonb  not null default '[]'::jsonb,
  author     text   not null default '',
  author_id  uuid   references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index daily_logs_child_date_idx on public.daily_logs (child_id, date desc);

-- ------------------------------ invoices ------------------------------------
-- NOTE: invoice status stays derived (see invoiceStatus/invoiceBalance in
-- src/lib/helpers.ts) rather than stored, so it can never drift from payments.
create table public.invoices (
  id         text primary key,
  family_id  text    not null references public.families(id) on delete cascade,
  period     text    not null,
  issued_at  date    not null default current_date,
  due_date   date    not null,
  amount     numeric(10,2) not null default 0,
  -- LineItem[]: { label, qty, unit, amount }
  line_items jsonb   not null default '[]'::jsonb,
  memo       text    not null default '',
  created_at timestamptz not null default now()
);
create index invoices_family_id_idx on public.invoices (family_id);

create table public.payments (
  id         text primary key,
  invoice_id text not null references public.invoices(id) on delete cascade,
  date       date not null default current_date,
  amount     numeric(10,2) not null,
  method     text not null default '',
  ref        text not null default '',
  created_at timestamptz not null default now()
);
create index payments_invoice_id_idx on public.payments (invoice_id);

-- ------------------------------ documents -----------------------------------
create table public.documents (
  id                 text primary key,
  title              text not null,
  category           public.document_category not null default 'Forms',
  size               bigint,
  file_name          text,
  storage_path       text,
  url                text not null default '',
  visible_to_parents boolean not null default false,
  requires_ack       boolean not null default false,
  uploaded_by        text not null default '',
  uploaded_by_id     uuid references public.profiles(id) on delete set null,
  uploaded_at        timestamptz not null default now()
);

create table public.document_acknowledgements (
  document_id     text not null references public.documents(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (document_id, profile_id)
);

-- --------------------------- communications ---------------------------------
-- audience_family_id NULL == the app's 'all'.
create table public.announcements (
  id                 text primary key,
  title              text not null,
  body               text not null default '',
  audience_family_id text references public.families(id) on delete cascade,
  date               timestamptz not null default now()
);

create table public.threads (
  id         text primary key,
  family_id  text not null references public.families(id) on delete cascade,
  subject    text not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index threads_family_id_idx on public.threads (family_id);

create table public.thread_messages (
  id          text primary key,
  thread_id   text not null references public.threads(id) on delete cascade,
  from_role   public.user_role not null,
  author_name text not null default '',
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null,
  at          timestamptz not null default now()
);
create index thread_messages_thread_id_idx on public.thread_messages (thread_id, at);

-- ----------------------------- enrollment -----------------------------------
create table public.enrollments (
  id                    text primary key,
  submitted_at          timestamptz not null default now(),
  status                public.enrollment_status not null default 'pending',
  family_name           text not null,
  primary_contact       text not null default '',
  relation              text not null default '',
  email                 text not null,
  phone                 text not null default '',
  address               text not null default '',
  secondary             jsonb not null default '{"name":"","relation":"","phone":""}'::jsonb,
  emergency             jsonb not null default '[]'::jsonb,
  -- EnrollmentChildDraft[]
  children              jsonb not null default '[]'::jsonb,
  notes                 text not null default '',
  acknowledged_handbook boolean not null default false,
  reviewed_at           timestamptz,
  created_family_id     text references public.families(id) on delete set null
);

create table public.leads (
  id          text primary key,
  parent_name text not null,
  email       text not null default '',
  phone       text not null default '',
  child_ages  text not null default '',
  message     text not null default '',
  tour_date   date,
  status      text not null default 'new',
  created_at  timestamptz not null default now()
);

create table public.waitlist_prospects (
  id         text primary key,
  child_name text not null,
  age_group  public.age_group not null,
  requested  date,
  family     text not null default '',
  note       text not null default '',
  created_at timestamptz not null default now()
);

-- ------------------------------ settings ------------------------------------
-- Single row. license_number is intentionally absent: the daycare is not a
-- licensed facility and the app must not be able to display or store one.
create table public.settings (
  id                         smallint primary key default 1 check (id = 1),
  business_name              text not null default 'Aunties Tykes',
  tagline                    text not null default '',
  director                   text not null default '',
  address                    text not null default '',
  phone                      text not null default '',
  email                      text not null default '',
  hours                      text not null default '',
  capacity                   integer not null default 0,
  ratios                     text not null default '',
  rate_full_time             numeric(10,2) not null default 0,
  rate_part_time             numeric(10,2) not null default 0,
  rate_drop_in               numeric(10,2) not null default 0,
  rate_registration_fee      numeric(10,2) not null default 0,
  rate_late_fee_per_minute   numeric(10,2) not null default 0,
  rate_sibling_discount_pct  numeric(5,2)  not null default 0,
  policy_sick                text not null default '',
  policy_late_pickup         text not null default '',
  policy_holidays            text not null default '',
  policy_potty               text not null default '',
  updated_at                 timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- ============================================================================
-- Row Level Security
--
-- This replaces src/lib/useFamilyScope.ts as the ACTUAL security boundary.
-- The hook stays as a convenience selector, but it is no longer what keeps one
-- family from reading another's data — these policies are.
-- ============================================================================

-- SECURITY DEFINER so they bypass RLS on profiles; without that, a policy on
-- profiles that calls is_admin() would recurse.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.current_family_id()
returns text language sql stable security definer set search_path = public as $$
  select p.family_id from public.profiles p where p.id = auth.uid();
$$;

revoke execute on function public.is_admin()          from public;
revoke execute on function public.current_family_id() from public;
grant  execute on function public.is_admin()          to authenticated;
grant  execute on function public.current_family_id() to authenticated;

alter table public.families                  enable row level security;
alter table public.profiles                  enable row level security;
alter table public.children                  enable row level security;
alter table public.attendance                enable row level security;
alter table public.daily_logs                enable row level security;
alter table public.invoices                  enable row level security;
alter table public.payments                  enable row level security;
alter table public.documents                 enable row level security;
alter table public.document_acknowledgements enable row level security;
alter table public.announcements             enable row level security;
alter table public.threads                   enable row level security;
alter table public.thread_messages           enable row level security;
alter table public.enrollments               enable row level security;
alter table public.leads                     enable row level security;
alter table public.waitlist_prospects        enable row level security;
alter table public.settings                  enable row level security;

-- ---------------------------- admin: full access ----------------------------
create policy admin_all on public.families                  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.profiles                  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.children                  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.attendance                for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.daily_logs                for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.invoices                  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.payments                  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.documents                 for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.document_acknowledgements for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.announcements             for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.threads                   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.thread_messages           for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.enrollments               for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.leads                     for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.waitlist_prospects        for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.settings                  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ------------------------- parent: own family only --------------------------
create policy own_profile_select on public.profiles
  for select to authenticated using (id = auth.uid());
create policy own_profile_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = 'parent');

create policy own_family on public.families
  for select to authenticated using (id = public.current_family_id());

create policy own_children on public.children
  for select to authenticated using (family_id = public.current_family_id());

create policy own_attendance on public.attendance
  for select to authenticated using (
    exists (select 1 from public.children c
            where c.id = attendance.child_id and c.family_id = public.current_family_id())
  );

create policy own_daily_logs on public.daily_logs
  for select to authenticated using (
    exists (select 1 from public.children c
            where c.id = daily_logs.child_id and c.family_id = public.current_family_id())
  );

create policy own_invoices on public.invoices
  for select to authenticated using (family_id = public.current_family_id());

create policy own_payments on public.payments
  for select to authenticated using (
    exists (select 1 from public.invoices i
            where i.id = payments.invoice_id and i.family_id = public.current_family_id())
  );

-- Mirrors useFamilyScope: shared with parents, or uploaded by this user.
create policy shared_documents on public.documents
  for select to authenticated using (visible_to_parents or uploaded_by_id = auth.uid());

create policy own_acks_select on public.document_acknowledgements
  for select to authenticated using (profile_id = auth.uid());
create policy own_acks_insert on public.document_acknowledgements
  for insert to authenticated with check (profile_id = auth.uid());

-- Mirrors useFamilyScope: audience 'all' (NULL) or this family.
create policy visible_announcements on public.announcements
  for select to authenticated
  using (audience_family_id is null or audience_family_id = public.current_family_id());

create policy own_threads_select on public.threads
  for select to authenticated using (family_id = public.current_family_id());
create policy own_threads_insert on public.threads
  for insert to authenticated with check (family_id = public.current_family_id());

create policy own_thread_messages_select on public.thread_messages
  for select to authenticated using (
    exists (select 1 from public.threads t
            where t.id = thread_messages.thread_id and t.family_id = public.current_family_id())
  );
-- A parent may only post as a parent, only into their own family's thread.
create policy own_thread_messages_insert on public.thread_messages
  for insert to authenticated with check (
    from_role = 'parent'
    and author_id = auth.uid()
    and exists (select 1 from public.threads t
                where t.id = thread_messages.thread_id and t.family_id = public.current_family_id())
  );

-- Business info shown on the public site.
create policy settings_readable on public.settings for select to anon, authenticated using (true);

-- ------------------- public forms: write-only, never readable ----------------
-- Anonymous visitors may submit, but cannot read back what anyone submitted.
create policy public_enroll_insert on public.enrollments for insert to anon, authenticated with check (true);
create policy public_lead_insert   on public.leads       for insert to anon, authenticated with check (true);

grant usage on schema public to anon, authenticated;
grant select on public.settings to anon, authenticated;
grant insert on public.enrollments, public.leads to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;


-- ---- reseed settings (0002 re-applied, since the table was recreated) ----
update public.settings set
  business_name = 'Aunties Tykes',
  tagline       = 'A small home daycare, and a private portal for our families.',
  director      = 'Melissa Allen',
  address       = 'Camp Hill, PA',
  phone         = 'TBD — add before launch',
  email         = 'TBD — add before launch',
  hours         = 'TBD — add before launch',
  capacity      = 12,
  ratios        = 'Infants 1:3 · Toddlers 1:4 · Preschool 1:6',
  rate_full_time            = 265,
  rate_part_time            = 175,
  rate_drop_in              = 62,
  rate_registration_fee     = 150,
  rate_late_fee_per_minute  = 2,
  rate_sibling_discount_pct = 10,
  updated_at    = now()
where id = 1;

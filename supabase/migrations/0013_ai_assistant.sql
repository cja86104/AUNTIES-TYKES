-- ============================================================================
-- Ro's own three tables: the audit trail, the standing rules, and the
-- commitments she has made.
--
-- These exist BEFORE any AI tool can write a business row, not alongside the
-- first one. Two of the plan's guardrails are unenforceable without them:
--
--   §8's audit log -- "every AI-initiated action stores the instruction that
--   caused it, the tool called, the arguments, and who/what it touched." Phase
--   1 only returned that trace to the caller and logged it to the function's
--   stdout, which is fine while nothing can be changed and useless the moment
--   something can.
--
--   §6/§7's standing rules -- "don't message the Brooks family until Friday"
--   has to be a row that is checked before a send runs. Without this table Ro
--   accepts such an instruction, cannot keep it, and a later send goes out
--   anyway. That is worse than not accepting the instruction at all, which is
--   why no send tool ships before this migration is applied.
--
-- §4's commitments table is the third, and is the cheap half of what makes an
-- assistant feel like it remembers you: not conversational recall, just not
-- forgetting what it said it would do.
--
-- Additive only. No existing table, column, policy or index is altered or
-- dropped, so applying this cannot affect the live portals. Written to be safe
-- to paste into the SQL editor twice -- migrations here are applied by hand
-- (no config.toml, no runner script), and `create policy` has no
-- IF NOT EXISTS, so the policies are guarded the way 0012 guards its
-- publication changes.
--
-- Ids are text, generated client-side by `uid()` in src/lib/helpers.ts, the
-- same as every table since 0003. `profiles.id` is still uuid because it
-- references auth.users.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Audit trail
--
-- Deliberately has NO foreign keys to families, children or invoices, which is
-- a departure from the rest of this schema and the point of the table. An audit
-- row has to outlive what it describes: `on delete cascade` would quietly erase
-- the record of what was done to a family the moment that family is deleted,
-- and `on delete set null` would keep the row while destroying the one detail
-- that makes it meaningful. So the subject is stored as plain text ids plus a
-- human-readable label captured at the time, and stays readable forever.
--
-- `actor_id` does reference profiles, but nullably and without cascade, for the
-- same reason: if the owner's account is ever recreated, the history stays.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_audit_log (
  id           text primary key,
  at           timestamptz not null default now(),

  -- Who asked. The name is denormalized on purpose -- see above.
  actor_id     uuid references public.profiles(id) on delete set null,
  actor_name   text not null default '',

  -- What she said, verbatim, before any model touched it. §8's "the instruction
  -- that caused it": an audit row that records only the tool call cannot answer
  -- "why did this happen", which is the question an audit log exists for.
  instruction  text not null default '',

  -- What was called, and how dangerous it was considered at the time.
  tool         text not null,
  risk_tier    text not null default 'read',
  arguments    jsonb not null default '{}'::jsonb,

  -- What it touched. Plain text, no FK -- see the note above.
  family_id    text,
  family_label text not null default '',
  child_id     text,
  child_label  text not null default '',
  -- Anything else: invoice ids, thread ids, document ids, recipient lists.
  targets      jsonb not null default '[]'::jsonb,

  -- How it ended. 'proposed' means Ro prepared it and it is waiting on her tap;
  -- 'declined' means she said no, which is worth keeping -- a pattern of
  -- declines is a signal about Ro, not noise.
  outcome      text not null default 'proposed'
                 check (outcome in ('proposed','confirmed','executed','failed','declined','undone')),
  error        text not null default '',

  -- Which model produced the call, for §10's tier accounting.
  model        text not null default '',

  -- §8's undo window. `undo_until` is when the option lapses; `undone_at` is
  -- set if she used it. Both null for anything that was never executed.
  undo_until   timestamptz,
  undone_at    timestamptz
);

comment on table public.ai_audit_log is
  'Every AI-initiated action: the instruction behind it, the tool, the arguments, what it touched, and how it ended. Append-mostly; only outcome/undone_at are updated.';

create index if not exists ai_audit_log_at_idx        on public.ai_audit_log (at desc);
create index if not exists ai_audit_log_family_id_idx on public.ai_audit_log (family_id);
create index if not exists ai_audit_log_outcome_idx   on public.ai_audit_log (outcome);

-- ---------------------------------------------------------------------------
-- 2. Standing rules
--
-- §7: "plain structured data, evaluated by ordinary code, no model involved at
-- send time." The split below follows from that. The four columns the send-time
-- check actually reads are real, indexed columns; everything kind-specific
-- lives in `details` as jsonb, so a new kind of rule does not need a migration
-- and the evaluation path stays cheap and typed.
--
-- `blocks_sends` is explicit rather than inferred from `kind`. A send-time check
-- that has to know which kinds are blocking is a check that silently stops
-- blocking the day someone adds a kind. Being wrong in that direction means a
-- message goes to a family she told Ro to leave alone.
--
-- `said` and `summary` are both kept: `said` is her words, so a rule can always
-- be explained back to her in the form she gave it, and `summary` is the plain
-- English §7 requires Ro to show her before saving.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_standing_rules (
  id           text primary key,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null,

  -- The shape §6's matcher recognised, or 'manual' when she wrote it herself.
  kind         text not null
                 check (kind in ('contact_hold','payment_expectation','reminder','manual')),

  said         text not null,
  summary      text not null,

  -- Null family_id means the rule applies to every family.
  family_id    text,
  family_label text not null default '',

  -- Which kind of outgoing message this touches.
  channel      text not null default 'any'
                 check (channel in ('any','message','announcement')),

  -- True only for rules that must stop a send. See the note above.
  blocks_sends boolean not null default false,

  -- "until Friday" -- the last date the rule applies. Null means indefinite.
  -- A date rather than a timestamp: she speaks in days, not instants.
  hold_until   date,

  -- Kind-specific extras, for display and for Phase 3.
  details      jsonb not null default '{}'::jsonb,

  -- She can turn a rule off without losing the record of having made it.
  active       boolean not null default true,
  retired_at   timestamptz
);

comment on table public.ai_standing_rules is
  'Standing instructions as inspectable rows. Checked by ordinary code before any send-tier action; never re-interpreted by a model at send time.';

-- The send-time check's exact shape: active blocking rules for one family or
-- for everyone. Partial index so it stays small as retired rules accumulate.
create index if not exists ai_standing_rules_send_check_idx
  on public.ai_standing_rules (family_id, channel)
  where active and blocks_sends;
create index if not exists ai_standing_rules_active_idx
  on public.ai_standing_rules (created_at desc) where active;

-- ---------------------------------------------------------------------------
-- 3. Commitments
--
-- §4: when Ro says "I'll flag it if the Chens haven't paid by Friday", that
-- becomes a row, so a later session can open by checking its own open
-- commitments and mentioning them unprompted. Not memory -- just not forgetting
-- what it said it would do.
--
-- `said` is Ro's own wording, which is what makes mentioning it later sound
-- like the same person rather than a task reminder.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_commitments (
  id           text primary key,
  created_at   timestamptz not null default now(),

  said         text not null,
  -- When Ro said it would come back to this. Null = no date given.
  due_on       date,

  family_id    text,
  family_label text not null default '',

  status       text not null default 'open'
                 check (status in ('open','kept','dropped')),
  closed_at    timestamptz,
  -- Why it closed: she handled it, Ro did, or it stopped being relevant.
  closed_note  text not null default ''
);

comment on table public.ai_commitments is
  'Follow-ups Ro promised, so a later session can raise them unprompted (§4 continuity).';

create index if not exists ai_commitments_open_idx
  on public.ai_commitments (due_on) where status = 'open';

-- ---------------------------------------------------------------------------
-- 4. Row level security -- owner only, with no parent policy at all
--
-- Every other table in this schema has both an `admin_all` policy and a
-- narrower `own_*` policy so a family can read their own rows. These three have
-- only the first, deliberately. A parent has no business reading the audit
-- trail, the owner's standing instructions about their family, or Ro's private
-- follow-up list -- and with RLS enabled and no policy that matches them, a
-- parent's SELECT returns zero rows rather than being refused. There is nothing
-- to add here later: if a family-facing view of any of this is ever wanted, it
-- wants its own policy written on purpose, not a widened one.
-- ---------------------------------------------------------------------------
alter table public.ai_audit_log       enable row level security;
alter table public.ai_standing_rules  enable row level security;
alter table public.ai_commitments     enable row level security;

-- `create policy` has no IF NOT EXISTS, and these migrations are applied by
-- hand, so guard each one the way 0012 guards its publication membership.
do $$
declare
  tbl text;
begin
  foreach tbl in array array['ai_audit_log','ai_standing_rules','ai_commitments']
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = tbl and policyname = 'admin_all'
    ) then
      execute format(
        'create policy admin_all on public.%I for all to authenticated '
        || 'using (public.is_admin()) with check (public.is_admin())', tbl);
    end if;
  end loop;
end $$;

grant select, insert, update, delete on public.ai_audit_log      to authenticated;
grant select, insert, update, delete on public.ai_standing_rules to authenticated;
grant select, insert, update, delete on public.ai_commitments     to authenticated;

-- Not added to the supabase_realtime publication (0012). Nothing subscribes to
-- these live: the activity feed is rendered from the chat response it belongs
-- to, and a second tab does not need to watch the audit trail update.

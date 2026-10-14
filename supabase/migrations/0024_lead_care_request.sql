-- ============================================================================
-- 0024 — what a family asks for on the contact form: when they want to start,
-- and the days and times they need care.
--
-- 1. leads.start_date — the parent's ideal start date. Until now the contact
--    form wrote that into `tour_date`, so the console showed "tour <date>" for
--    a date that was never a tour, and Ro's cold-lead check skipped any
--    enquiry whose "tour" was still ahead. From here the form writes
--    start_date and `tour_date` is only ever a real tour the owner set.
--    Existing rows are left exactly as they are (live data, additive only):
--    there is no way to tell from a row which tour_date was really a start
--    date, so nothing is moved.
--
-- 2. leads.schedule — the weekly care a family asks for, in the same shape as
--    children.schedule (0020): keys mon..sun, each up to 3 {start, end} blocks
--    in 24h HH:mm. NULL = they did not say. The public form inserts this
--    anonymously, so the same validator as children.schedule guards it here.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

alter table public.leads
  add column if not exists start_date date;

alter table public.leads
  add column if not exists schedule jsonb;

alter table public.leads drop constraint if exists leads_schedule_ck;
alter table public.leads
  add constraint leads_schedule_ck
  check (schedule is null or public.valid_weekly_schedule(schedule));

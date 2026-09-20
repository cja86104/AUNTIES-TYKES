-- ============================================================================
-- Per-family custom tuition rate
--
-- settings.rates (Admin -> Settings -> Tuition rates) is the one standard,
-- published rate card -- it also feeds the tuition estimator on the public
-- site. Some families are billed a different, individually agreed weekly
-- rate instead, and until now there was nowhere to record that: "Prefill
-- from enrollment" on a new invoice always fell back to the standard rate,
-- so an admin billing a custom-rate family had to hand-type every line item
-- from memory with no stored number backing it.
--
-- NULL means "no override -- use the standard rate card." That is why this
-- is nullable rather than defaulting to 0: a real $0 rate (a comped or
-- free-enrollment family) is a distinct, rare case that should be entered
-- deliberately, not indistinguishable from "not set."
-- ============================================================================

alter table public.families
  add column custom_weekly_rate numeric check (custom_weekly_rate >= 0);

comment on column public.families.custom_weekly_rate is
  'Optional per-family weekly tuition rate, applied to every enrolled child in this family instead of the standard settings.rates full-time/part-time rate. NULL uses the standard rate card.';

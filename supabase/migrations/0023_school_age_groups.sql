-- ============================================================================
-- 0023 — school-age groups.
--
-- The owner also cares for school-age children (before/after school and camp),
-- so the age_group enum gains 'Elementary' and 'Middle School' after
-- 'Preschool'. Existing children keep the group they have; nothing is
-- rewritten. `children.age_group` and `waitlist_prospects.age_group` both use
-- this type, so both accept the new values.
--
-- ADD VALUE only appends to the type; it cannot fail on existing rows and needs
-- no backfill. Idempotent: safe to run more than once.
-- ============================================================================

alter type public.age_group add value if not exists 'Elementary' after 'Preschool';
alter type public.age_group add value if not exists 'Middle School' after 'Elementary';

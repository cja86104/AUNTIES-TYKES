-- ============================================================================
-- Seed the single settings row (id = 1).
--
-- CONFIRMED by the owner: business name, director, and town.
-- PLACEHOLDER, marked deliberately: phone, email and hours are written as
-- 'TBD — add before launch' rather than plausible-looking values, because all
-- three render publicly (PublicFooter on every page, Contact, FAQ, and the
-- schema.org JSON-LD in RouteMeta). A fake-but-realistic phone number or
-- mailbox would ship unnoticed; a visible TBD cannot.
--
-- Rates, ratios, capacity and policy text are carried over from the demo the
-- owner reviewed. They are admin/parent-facing only, except the policy text,
-- which renders on /tuition-policies. See .claude/LAUNCH-CHECKLIST.md.
-- ============================================================================

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

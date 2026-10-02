-- ============================================================================
-- 0015 — invoice numbers come from a database counter, and are never reused.
--
-- An invoice id is its human-facing number: 'INV-1045' is what the invoice page
-- prints and what a family is told to quote. Until now the app worked that
-- number out for itself in the browser, and got it wrong twice over:
--
--   1. It counted invoices (1045 + how many exist). Deleting one lowered the
--      count, the next number landed on an invoice that still existed, and the
--      save — an upsert — replaced it. The count then never grew, so every
--      invoice after that took the same number and overwrote the one before,
--      while the overwritten invoice's payments stayed attached.
--   2. Any rule based on what currently exists reuses a number once the newest
--      invoice is deleted. A number that has been issued must never mean a
--      different invoice later.
--
-- A sequence fixes both. nextval() never returns the same value twice, whatever
-- is deleted afterwards and however many tabs ask at once.
--
-- Numbers are unique, not gapless: if a number is handed out and the invoice
-- then fails to save, that number is simply skipped. That is deliberate — a gap
-- is harmless, and the alternative (handing it out again) is the bug.
--
-- Idempotent: safe to run more than once. Re-running never moves the counter
-- backwards, so it cannot re-open a number that was already issued.
-- ============================================================================

create sequence if not exists public.invoice_number_seq
  as bigint
  start with 1045
  minvalue 1
  no cycle;

-- Start past every number in use today, and past anything this sequence has
-- already issued. 1044 is the floor so the first invoice is INV-1045, as before.
do $$
declare
  highest_in_use bigint;
  already_issued bigint;
  was_called     boolean;
begin
  select coalesce(max(substring(id from '^INV-([0-9]+)$')::bigint), 0)
    into highest_in_use
    from public.invoices
   where id ~ '^INV-[0-9]{1,15}$';

  select last_value, is_called
    into already_issued, was_called
    from public.invoice_number_seq;
  -- A sequence that has never been used reports its START value as last_value;
  -- that number has not been issued, so it must not count as taken.
  if not was_called then
    already_issued := 0;
  end if;

  perform setval(
    'public.invoice_number_seq',
    greatest(1044, highest_in_use, already_issued),
    true
  );
end $$;

-- The sequence is reachable only through the function below. Supabase's default
-- privileges would otherwise hand it to anon and authenticated.
revoke all on sequence public.invoice_number_seq from public, anon, authenticated;

-- The one way to get an invoice number. SECURITY DEFINER so it can use the
-- sequence the caller cannot touch; the owner check is what stands between this
-- and a parent burning through numbers.
create or replace function public.next_invoice_id()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the owner can issue invoices'
      using errcode = '42501';
  end if;
  return 'INV-' || nextval('public.invoice_number_seq')::text;
end;
$$;

comment on function public.next_invoice_id() is
  'Issues the next invoice id (INV-n) from invoice_number_seq. Owner only. Numbers are never reused, including after an invoice is deleted.';

revoke execute on function public.next_invoice_id() from public, anon;
grant  execute on function public.next_invoice_id() to authenticated;

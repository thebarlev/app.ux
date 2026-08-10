-- ====================================================
-- ROLLBACK for 124
-- ====================================================
-- Drops resolve_customer and the placeholder-name helper.
--
-- ⛔ RUN THIS ONLY WHILE NO ISSUANCE PATH CALLS resolve_customer.
-- Once the wiring is deployed, four TypeScript paths call it by RPC and three
-- SECURITY DEFINER SQL functions call it directly. Dropping it then makes every
-- issuance fail — paid checkout, renewals, auditor charges and the form — because
-- a missing function is an error, not a no-op. Revert the wiring first, then run
-- this.
--
-- Dropped without CASCADE on purpose. If an issuance function already references
-- resolve_customer, PostgreSQL does not record that as a dependency for plpgsql
-- bodies, so the drop will SUCCEED and the breakage appears at the next issuance
-- rather than here. Check first:
--
--   select p.proname
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and pg_get_functiondef(p.oid) ilike '%resolve_customer%';
--
-- Nothing else in 124 needs undoing: it created no table, no column, no constraint
-- and no trigger, and it wrote no data.
--
-- ── WHAT IT DOES NOT UNDO ───────────────────────────────────────────────────
-- Customers that resolve_customer already created stay, with the customer_numbers
-- scripts/123 allocated to them, and any documents already pointing at them keep
-- pointing at them. That is correct: those are real records of real issuances. This
-- rollback removes the mechanism, not its history.
-- ====================================================

begin;

drop function if exists public.resolve_customer(uuid, text, text, text);

drop function if exists public.is_placeholder_customer_name(text);

commit;

-- ── VERIFY the rollback landed ──────────────────────────────────────────────
-- Expected: 0 rows.
select p.oid::regprocedure as signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('resolve_customer', 'is_placeholder_customer_name');

-- Expected: 0 rows. Any function listed here still calls the dropped resolver and
-- will fail at its next invocation.
select p.oid::regprocedure as still_references_resolve_customer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and pg_get_functiondef(p.oid) ilike '%resolve_customer%';

-- What survives, for the record.
select count(*) as customers_kept from public.customers;
select count(*) as documents_pointing_at_a_customer
from public.documents where customer_id is not null;

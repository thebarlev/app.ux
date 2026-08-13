-- ====================================================
-- ROLLBACK for 123
-- ====================================================
-- Drops the NOT NULL, the not-blank check, the trigger, the trigger function and
-- the counter table, returning public.customers.customer_number to what it was: a
-- nullable text column that nothing fills.
--
-- WHAT RUNNING THIS RE-ENABLES
-- Customers with no number. Every such customer produces a BLANK field 1225 in the
-- BKMV file, which is the state the register exists to end. If scripts/124 is
-- already live, resolve_customer keeps creating customers and they will all be
-- numberless.
--
-- ── IT DOES NOT UNDO THE BACKFILL, ON PURPOSE ───────────────────────────────
-- Section 4 of 123 wrote customer_number on rows that had none. Those values are
-- NOT cleared here. Two reasons: the numbers may already have been printed on a
-- document or written into a submitted regulatory file, and there is no record of
-- which rows were blank beforehand — clearing "the ones that look generated" would
-- be a guess. If they genuinely must go, that is a separate, deliberate statement
-- written against a list of specific ids.
--
-- Consequence: after this rollback the surviving numbers stay, and the counter that
-- knows where they stopped is gone. Re-applying 123 re-seeds the counter from
-- max(customer_number) in section 5, so no number is reissued. Do not hand-create
-- the counter table without that seed.
-- ====================================================

begin;

alter table public.customers alter column customer_number drop not null;

alter table public.customers drop constraint if exists customers_customer_number_not_blank;

drop trigger if exists trigger_assign_customer_number on public.customers;

drop function if exists public.assign_customer_number();

-- Without CASCADE: if anything has come to depend on the counter table, the drop
-- fails and names it rather than quietly removing it too.
drop table if exists public.customer_number_sequences;

commit;

-- ── VERIFY the rollback landed ──────────────────────────────────────────────
-- Expected: is_nullable = YES.
select column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'customers'
  and column_name = 'customer_number';

-- Expected: no trigger_assign_customer_number.
select tgname from pg_trigger
where tgrelid = 'public.customers'::regclass and not tgisinternal
order by tgname;

-- Expected: 0 rows.
select p.proname from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'assign_customer_number';

-- Expected: 0 rows.
select c.relname from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'customer_number_sequences';

-- The backfilled numbers that survive this rollback, for the record.
select id, company_id, customer_number, name
from public.customers
order by company_id, customer_number;

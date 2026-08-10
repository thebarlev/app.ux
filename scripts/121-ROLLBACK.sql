-- ====================================================
-- ROLLBACK for 121
-- ====================================================
-- Removes the customer tax-id uniqueness constraint, the blank-tax-id check, and
-- the canonical-form function, returning public.customers to the state
-- scripts/015 left it in: a non-unique index on (company_id, tax_id) and no
-- constraint at all.
--
-- WHAT RUNNING THIS RE-ENABLES
-- One company can again hold two customers with the same tax id. If the
-- issuance-time resolver from step 2 is already live, it loses the index its
-- ON CONFLICT clause names and its create-or-match becomes a plain read-then-write
-- with no atomicity — two concurrent issuances for the same buyer produce two
-- register rows. Do not run this while step 2 is deployed.
--
-- The function is dropped last and without CASCADE on purpose: if anything else
-- has come to depend on it (a second index, a view, a later resolver), the drop
-- fails and names the dependency instead of quietly removing it too.
-- ====================================================

begin;

drop index if exists public.customers_tax_id_unique;

alter table public.customers drop constraint if exists customers_tax_id_not_blank;

drop function if exists public.normalize_customer_tax_id(text);

commit;

-- ── VERIFY the rollback landed ──────────────────────────────────────────────
-- Expected: no customers_tax_id_unique row; idx_customers_tax_id still present
-- and still non-unique.
select i.relname as index_name, x.indisunique, pg_get_indexdef(x.indexrelid) as definition
from pg_index x
join pg_class i on i.oid = x.indexrelid
join pg_class t on t.oid = x.indrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public' and t.relname = 'customers'
order by i.relname;

-- Expected: no row named customers_tax_id_not_blank.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.customers'::regclass and contype = 'c'
order by conname;

-- Expected: 0 rows.
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'normalize_customer_tax_id';

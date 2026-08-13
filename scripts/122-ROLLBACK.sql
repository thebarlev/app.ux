-- ====================================================
-- ROLLBACK for 122
-- ====================================================
-- Removes the dealer-number uniqueness index, the cross-column consistency check,
-- and the two canonical-form functions, returning public.companies to the state it
-- was in before 122: three nullable columns holding the same concept, read with
-- four different precedence orders, and nothing preventing two companies from
-- claiming the same dealer number.
--
-- WHAT RUNNING THIS RE-ENABLES
-- Exactly the state that existed before the 2026-08-10 reset, when three company
-- rows carried registration_number 515960508. Two sets of books can again claim to
-- be the same business, and the per-dealer regulatory file has no unambiguous
-- owner. This is a go-to-market blocker being reopened, not a tidy-up — run it only
-- to unblock something more urgent, and reapply 122 afterwards.
--
-- The two functions are dropped without CASCADE on purpose. If a later migration
-- has come to depend on either — a resolver, a view, a generated column, a second
-- index — the drop fails and names the dependency instead of silently removing it.
-- normalize_registration_number is dropped last because company_dealer_number
-- calls it.
--
-- NOTE: this does NOT touch trigger_enforce_company_registration_number_checksum
-- (scripts/050). 122 never modified it, so there is nothing to restore. Checksum
-- validation of registration_number keeps working after this rollback.
-- ====================================================

begin;

drop index if exists public.companies_dealer_number_unique;

alter table public.companies drop constraint if exists companies_dealer_number_consistent;

drop function if exists public.company_dealer_number(text, text, text);

drop function if exists public.normalize_registration_number(text);

commit;

-- ── VERIFY the rollback landed ──────────────────────────────────────────────
-- Expected: no companies_dealer_number_unique row.
select i.relname as index_name, x.indisunique, pg_get_indexdef(x.indexrelid) as definition
from pg_index x
join pg_class i on i.oid = x.indexrelid
join pg_class t on t.oid = x.indrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public' and t.relname = 'companies'
order by i.relname;

-- Expected: no row named companies_dealer_number_consistent.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.companies'::regclass and contype = 'c'
order by conname;

-- Expected: 0 rows.
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('normalize_registration_number', 'company_dealer_number')
order by p.proname;

-- Expected: the checksum trigger is still there, untouched.
select tgname, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.companies'::regclass
  and not tgisinternal
order by tgname;

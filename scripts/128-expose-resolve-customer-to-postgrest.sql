-- ====================================================
-- 128 - Expose resolve_customer to PostgREST  (wiring prerequisite)
-- ====================================================
-- One statement. It changes nothing in the database; it tells PostgREST to rebuild
-- its schema cache so the function scripts/124 created becomes callable as an RPC.
--
-- ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
-- scripts/124 created public.resolve_customer and granted EXECUTE to authenticated
-- and service_role, but it did NOT end with
--
--     select pg_notify('pgrst', 'reload schema');
--
-- 68 other migrations in scripts/ do. That line is the house pattern for a reason:
-- PostgREST serves RPC from a cached view of the schema, and until it reloads,
-- `supabase.rpc("resolve_customer", …)` fails with
--
--     Could not find the function public.resolve_customer(...) in the schema cache
--
-- The function itself is fine and callable from SQL — scripts/124-VERIFY passed,
-- which proves that. What is not proven is that the HTTP layer can see it, and the
-- TypeScript half of the wiring reaches it only through that layer.
--
-- This is the same blind spot that made public.receipt_payments look non-existent
-- and made me claim normalize_registration_number was absent from the database:
-- a PostgREST client's view of the schema is not the schema.
--
-- ── RUN THIS BEFORE DEPLOYING THE TYPESCRIPT WIRING ─────────────────────────
-- Two of the seven issuance paths call resolve_customer over RPC:
--   lib/documents/actions.ts               — issueDocumentAction (fails closed)
--   .../vow-billing/providers/internal-provider.ts — issueDocument (fails open)
--
-- Deploy order matters differently for each, which is the whole point of running
-- this first:
--   · the form path fails CLOSED, so if the cache is stale, users cannot issue a
--     document at all. Visible immediately, and total.
--   · the VOW path fails OPEN, so a stale cache is SILENT: documents keep issuing
--     with customer_id null and field 1225 stays empty, and the only trace is a
--     billing_failures row nobody is watching.
--
-- The second is the dangerous one. Do not rely on the cache reloading eventually.
--
-- ── IT IS SAFE TO RUN AT ANY TIME, AND MORE THAN ONCE ───────────────────────
-- pg_notify sends a message on a channel. It holds no lock, touches no table, and
-- has no effect beyond prompting a reload. Running it twice is running it twice.
-- ====================================================

select pg_notify('pgrst', 'reload schema');

-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- 1. The functions exist and carry the grants scripts/124 gave them.
--    Expected: two rows. proacl must show authenticated=X and service_role=X, and
--    must NOT show anon.
select p.oid::regprocedure as signature, p.prosecdef as security_definer, p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('resolve_customer', 'is_placeholder_customer_name')
order by p.proname;

-- 2. The register's own objects, so this file doubles as a post-123/124 checkpoint.
--    Expected: customer_number is_nullable = NO, and trigger_assign_customer_number
--    present as BEFORE INSERT.
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'customers'
  and column_name = 'customer_number';

select tgname, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.customers'::regclass and not tgisinternal
order by tgname;

-- 3. THE REAL TEST IS NOT IN SQL.
--    From the application side, after deploying, issue one document through the
--    form and confirm the row carries a customer_id:
--
--      select id, document_number, document_type, document_status,
--             customer_id, customer_name, customer_tax_id
--      from public.documents
--      where customer_id is not null
--      order by created_at desc
--      limit 5;
--
--    If that comes back empty after a successful issuance, the cache is still
--    stale or the deploy did not include the wiring. A SQL-only check cannot tell
--    you which.

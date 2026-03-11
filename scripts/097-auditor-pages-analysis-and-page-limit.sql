-- =====================================================
-- 097 - AUDITOR pages analysis + incremental page limit
-- =====================================================
-- CRITICAL:
-- - Must NOT touch billing/invoicing/subscription objects.
-- - Only auditor_* tables/columns are introduced here.

begin;

alter table public.auditor_scans
  add column if not exists page_limit integer not null default 20
    check (page_limit > 0 and page_limit <= 200);

alter table public.auditor_scan_pages
  add column if not exists analysis jsonb not null default '{}'::jsonb;

commit;

select pg_notify('pgrst', 'reload schema');

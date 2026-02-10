-- ====================================================
-- 053 - document_line_items: item_date + currency (compatibility)
-- ====================================================
-- Purpose:
-- - Align DB schema with app code which reads/writes:
--   - document_line_items.item_date
--   - document_line_items.currency
-- Notes:
-- - Safe to run multiple times.
-- ====================================================

begin;

alter table public.document_line_items
  add column if not exists item_date date;

alter table public.document_line_items
  add column if not exists currency text default 'ILS';

commit;

select pg_notify('pgrst', 'reload schema');


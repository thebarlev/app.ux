-- ====================================================
-- 074 - Realign invoice_receipt sequence to max issued number
-- ====================================================
-- Purpose:
-- - Regulatory safety: prevent future skips caused by a drift where
--   document_sequences.current_number moved ahead of the last actually issued document.
-- - This script DOES NOT change issued documents and DOES NOT backfill missing historical numbers.
-- - It only aligns current_number to MAX(existing invoice_receipt document_number numeric part).
--
-- Usage:
-- - Run once in production after verifying there are no concurrent issuance jobs.
-- ====================================================

begin;

with seq as (
  select id, company_id, current_number
  from public.document_sequences
  where document_type = 'invoice_receipt'
),
doc_max as (
  select
    d.company_id,
    max(
      case
        when d.document_number ~ '[0-9]+' then regexp_replace(d.document_number, '\D', '', 'g')::integer
        else null
      end
    ) as max_doc_number
  from public.documents d
  where d.document_type in ('invoice_receipt', 'invoiceReceipt')
  group by d.company_id
)
update public.document_sequences s
set
  current_number = coalesce(dm.max_doc_number, s.current_number),
  updated_at = now()
from doc_max dm
where s.id in (select id from seq)
  and s.company_id = dm.company_id
  and s.document_type = 'invoice_receipt'
  and dm.max_doc_number is not null
  and s.current_number is distinct from dm.max_doc_number;

commit;

select pg_notify('pgrst', 'reload schema');


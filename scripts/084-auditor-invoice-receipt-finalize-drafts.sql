-- ====================================================
-- 084 - Finalize auditor invoice_receipt documents stuck in draft
-- ====================================================
-- Purpose:
-- - Documents created by issue_auditor_charge_invoice_receipt_service were
--   left as draft (trigger blocked line-item insert when doc was final).
-- - This script updates those draft documents to 'final' so they appear
--   in the documents list (non-draft filter).
-- ====================================================

begin;

update public.documents
set document_status = 'final',
    finalized_at = coalesce(finalized_at, now())
where document_type = 'invoice_receipt'
  and document_status = 'draft'
  and reference_text like 'auditor_charge:%'::text;

commit;

-- ====================================================
-- 098 - Repair: list auditor invoices missing PDF (for manual/API repair)
-- ====================================================
-- Run this to find documents that need PDF regeneration.
-- The app's PDF route will attempt recovery on download; this script
-- helps identify which documents are affected.
--
-- To repair: use API or run process-pending (for new) or a batch script.
-- ====================================================

-- Documents issued for auditor charges that have no pdf_storage_key
SELECT
  d.id AS document_id,
  d.document_number,
  d.document_type,
  d.document_status,
  d.company_id,
  d.pdf_storage_key,
  c.id AS charge_id,
  c.company_id AS buyer_company_id,
  c.subscription_period_start
FROM public.documents d
JOIN public.auditor_subscription_charges c ON c.issued_invoice_id = d.id
WHERE (d.reference_text LIKE 'auditor_charge:%' OR d.reference_text IS NULL)
  AND (d.pdf_storage_key IS NULL OR d.pdf_storage_key = '')
ORDER BY d.created_at DESC;

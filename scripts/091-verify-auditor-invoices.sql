-- ====================================================
-- 091 - Verification: Auditor invoice company_id correctness
-- ====================================================
-- Run after 091-auditor-invoice-receipt-company-id-fix.sql
-- ====================================================

-- 1) Count mismatches (should be 0)
SELECT count(*) AS mismatches
FROM public.auditor_subscription_charges c
JOIN public.documents d ON d.id = c.issued_invoice_id
WHERE c.issued_invoice_id IS NOT NULL
  AND d.company_id IS DISTINCT FROM c.company_id;

-- 2) Sample: charges with their document company_id (should match)
SELECT
  c.id AS charge_id,
  c.company_id AS charge_company_id,
  d.id AS document_id,
  d.company_id AS document_company_id,
  d.document_number,
  (c.company_id = d.company_id) AS match
FROM public.auditor_subscription_charges c
JOIN public.documents d ON d.id = c.issued_invoice_id
WHERE c.issued_invoice_id IS NOT NULL
ORDER BY c.subscription_period_start DESC
LIMIT 20;

-- 3) document_events company_id matches document
SELECT count(*) AS event_mismatches
FROM public.document_events de
JOIN public.documents d ON d.id = de.document_id
JOIN public.auditor_subscription_charges c ON c.issued_invoice_id = de.document_id
WHERE c.issued_invoice_id IS NOT NULL
  AND de.company_id IS DISTINCT FROM d.company_id;

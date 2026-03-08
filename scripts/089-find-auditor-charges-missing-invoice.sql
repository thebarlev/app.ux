-- ====================================================
-- 089 - Find auditor_subscription_charges missing issued_invoice_id
-- ====================================================
-- Purpose:
-- - After migration 085: identify charges that succeeded but have no invoice
-- - Use output to repair via: POST /api/admin/auditor/repair-missing-invoices
--   with body { "chargeId": "<id>" }
-- ====================================================

-- Charges: status=succeeded, issued_invoice_id is null
SELECT
  c.id AS charge_id,
  c.company_id,
  c.plan_id,
  c.amount,
  c.currency,
  c.subscription_period_start,
  c.subscription_period_end,
  c.created_at,
  -- p_is_en: true for USD (EN flow), false for ILS (Hebrew)
  (c.currency = 'USD') AS p_is_en
FROM public.auditor_subscription_charges c
WHERE c.status = 'succeeded'
  AND c.issued_invoice_id IS NULL
ORDER BY c.created_at DESC;

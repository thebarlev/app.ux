-- ====================================================
-- 066 - Find paid checkouts missing invoice_receipt
-- ====================================================
-- Purpose:
-- - Detect paid checkout_sessions that did not produce an accounting document link
-- - Detect cases where a document exists but is not invoice_receipt (e.g. old RPC issued 'receipt')
-- ====================================================

-- A) Paid checkouts with NO billing_documents link
select
  cs.id as checkout_session_id,
  cs.company_id as buyer_company_id,
  cs.plan_id,
  cs.amount,
  cs.coin_id,
  cs.provider_low_profile_code,
  cs.provider_internal_deal_number,
  cs.created_at
from public.checkout_sessions cs
left join public.billing_documents bd on bd.checkout_session_id = cs.id
where cs.status = 'paid'
  and bd.id is null
order by cs.created_at desc
limit 50;

-- B) Paid checkouts with a linked document that is NOT invoice_receipt
select
  cs.id as checkout_session_id,
  cs.company_id as buyer_company_id,
  cs.plan_id,
  cs.amount,
  cs.created_at,
  bd.document_id,
  d.document_type,
  d.document_number
from public.checkout_sessions cs
join public.billing_documents bd on bd.checkout_session_id = cs.id
join public.documents d on d.id = bd.document_id
where cs.status = 'paid'
  and d.document_type is distinct from 'invoice_receipt'
order by cs.created_at desc
limit 50;


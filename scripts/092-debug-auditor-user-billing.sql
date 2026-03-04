-- ====================================================
-- 092 - Debug: Auditor user billing/company linkage
-- ====================================================
-- Run manually with a specific user. Replace :user_id or :email.
-- Example: psql $DATABASE_URL -v user_id='xxx' -v email='user@example.com' -f 092-debug-auditor-user-billing.sql
-- ====================================================

-- 1) Resolve user_id from email (if needed)
-- SET user_id = (SELECT id FROM auth.users WHERE email = :email LIMIT 1);

-- 2) user_company_ids() equivalent (run as the user or substitute auth.uid())
-- For manual run, replace auth.uid() with the user's UUID:
/*
SELECT cm.company_id AS from_members
FROM public.company_members cm
WHERE cm.user_id = 'USER_UUID_HERE'
UNION
SELECT c.id
FROM public.companies c
WHERE c.auth_user_id = 'USER_UUID_HERE';
*/

-- 3) Subscriptions for that user's companies
/*
SELECT s.company_id, s.customer_id, s.plan_id, s.status, s.next_billing_date
FROM public.auditor_subscriptions s
WHERE s.company_id IN (
  SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = 'USER_UUID_HERE'
  UNION
  SELECT c.id FROM public.companies c WHERE c.auth_user_id = 'USER_UUID_HERE'
);
*/

-- 4) Charges for those companies
/*
SELECT c.id, c.company_id, c.subscription_period_start, c.amount, c.status, c.issued_invoice_id
FROM public.auditor_subscription_charges c
WHERE c.company_id IN (
  SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = 'USER_UUID_HERE'
  UNION
  SELECT c2.id FROM public.companies c2 WHERE c2.auth_user_id = 'USER_UUID_HERE'
)
ORDER BY c.subscription_period_start DESC
LIMIT 20;
*/

-- 5) Documents for those charges (company_id should match charge.company_id)
/*
SELECT d.id, d.company_id, d.document_number, d.document_type, d.document_status,
       ch.company_id AS charge_company_id,
       (d.company_id = ch.company_id) AS company_match
FROM public.documents d
JOIN public.auditor_subscription_charges ch ON ch.issued_invoice_id = d.id
WHERE ch.company_id IN (
  SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = 'USER_UUID_HERE'
  UNION
  SELECT c2.id FROM public.companies c2 WHERE c2.auth_user_id = 'USER_UUID_HERE'
);
*/

-- 6) Find users with charges but no company access (orphaned)
SELECT
  ch.company_id,
  c.email AS company_email,
  (SELECT array_agg(cm.user_id) FROM public.company_members cm WHERE cm.company_id = ch.company_id) AS member_user_ids,
  (SELECT auth_user_id FROM public.companies WHERE id = ch.company_id) AS company_auth_user_id,
  count(*) AS charge_count
FROM public.auditor_subscription_charges ch
JOIN public.companies c ON c.id = ch.company_id
WHERE ch.status = 'succeeded'
GROUP BY ch.company_id, c.email, c.auth_user_id
HAVING (
  SELECT count(*)
  FROM public.company_members cm
  WHERE cm.company_id = ch.company_id
) = 0
  AND (SELECT auth_user_id FROM public.companies WHERE id = ch.company_id) IS NULL
ORDER BY charge_count DESC;

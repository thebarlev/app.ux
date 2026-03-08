-- ====================================================
-- 087 - Repair: Link existing users to companies after paid checkout
-- ====================================================
-- Purpose:
-- - Fix users who paid via lead flow (checkout/create) but inviteUserByEmail
--   failed because user already existed → company created but never linked.
-- - Run this AFTER 086 (get_user_id_by_email) is deployed.
--
-- How to identify affected users:
-- - Companies with succeeded charges but auth_user_id is null
-- - AND no company_members for that company
-- - Lead email exists, and a user exists with that email
--
-- Usage:
-- 1. Run the SELECT in "Step 1" to list affected rows (dry run)
-- 2. If results look correct, run the DO block in "Step 2" to apply fixes
-- ====================================================

-- Step 1: Identify affected companies (DRY RUN - no writes)
-- Run this first to see what would be fixed.
/*
SELECT
  c.id AS company_id,
  c.company_name,
  c.email AS lead_email,
  l.id AS lead_id,
  ch.id AS charge_id,
  ch.subscription_period_start,
  public.get_user_id_by_email(c.email) AS existing_user_id
FROM public.companies c
JOIN public.auditor_subscription_charges ch ON ch.company_id = c.id AND ch.status = 'succeeded'
LEFT JOIN public.company_members cm ON cm.company_id = c.id
LEFT JOIN public.auditor_leads l ON l.company_id = c.id
WHERE c.auth_user_id IS NULL
  AND cm.company_id IS NULL
  AND public.get_user_id_by_email(c.email) IS NOT NULL
ORDER BY ch.subscription_period_start DESC;
*/

-- Step 2: Apply repair (run as service_role or superuser)
-- Links each affected company to the existing user by email.
DO $$
DECLARE
  r RECORD;
  v_user_id uuid;
  v_linked int := 0;
BEGIN
  FOR r IN
    SELECT
      c.id AS company_id,
      c.email AS lead_email
    FROM public.companies c
    JOIN public.auditor_subscription_charges ch ON ch.company_id = c.id AND ch.status = 'succeeded'
    LEFT JOIN public.company_members cm ON cm.company_id = c.id
    WHERE c.auth_user_id IS NULL
      AND cm.company_id IS NULL
      AND c.email IS NOT NULL
      AND trim(c.email) != ''
  LOOP
    v_user_id := public.get_user_id_by_email(r.lead_email);
    IF v_user_id IS NOT NULL THEN
      -- Set company owner
      UPDATE public.companies SET auth_user_id = v_user_id WHERE id = r.company_id;
      -- Ensure membership
      INSERT INTO public.company_members (company_id, user_id, role, accepted_at)
      VALUES (r.company_id, v_user_id, 'owner', now())
      ON CONFLICT (company_id, user_id) DO UPDATE SET role = 'owner', accepted_at = now();
      -- Update checkout session if any
      UPDATE public.auditor_checkout_sessions SET user_id = v_user_id
      WHERE company_id = r.company_id AND user_id IS NULL;
      v_linked := v_linked + 1;
      RAISE NOTICE 'Linked company % to user % (email: %)', r.company_id, v_user_id, r.lead_email;
    END IF;
  END LOOP;
  RAISE NOTICE 'Repair complete: % companies linked', v_linked;
END;
$$;

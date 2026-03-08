-- ====================================================
-- 088 - Repair: Consolidate duplicate Auditor companies per user
-- ====================================================
-- Purpose:
-- - Find users with more than one Auditor company (auth_user_id or company_members)
-- - Identify canonical company by priority: charges > subscription > scans > oldest
-- - Move Auditor references from duplicate to canonical
-- - Clear auth_user_id from duplicate (do NOT delete companies)
--
-- Usage:
-- 1. Run "Step 1: Dry run" to see affected users and planned changes
-- 2. Run "Step 2: Apply repair" (service_role)
-- ====================================================

-- Step 1: Dry run – list users with multiple companies
/*
SELECT
  u.id AS user_id,
  u.email,
  c.id AS company_id,
  c.company_name,
  c.email AS company_email,
  (SELECT COUNT(*) FROM public.auditor_subscription_charges ch WHERE ch.company_id = c.id AND ch.status = 'succeeded') AS charge_count,
  (SELECT COUNT(*) FROM public.auditor_subscriptions s WHERE s.company_id = c.id) AS sub_count,
  (SELECT COUNT(*) FROM public.auditor_scans sc WHERE sc.company_id = c.id) AS scan_count,
  c.created_at
FROM auth.users u
JOIN public.companies c ON c.auth_user_id = u.id
WHERE u.id IN (
  SELECT auth_user_id FROM public.companies WHERE auth_user_id IS NOT NULL
  GROUP BY auth_user_id HAVING COUNT(*) > 1
)
ORDER BY u.id, charge_count DESC, sub_count DESC, scan_count DESC, c.created_at ASC;
*/

-- Step 2: Create repair function (idempotent, safe)
CREATE OR REPLACE FUNCTION public.auditor_repair_duplicate_companies()
RETURNS TABLE(
  user_id uuid,
  canonical_company_id uuid,
  duplicate_company_id uuid,
  actions_taken text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user record;
  v_dup record;
  v_canonical uuid;
  v_actions text;
BEGIN
  FOR v_user IN
    SELECT c.auth_user_id AS uid
    FROM public.companies c
    WHERE c.auth_user_id IS NOT NULL
    GROUP BY c.auth_user_id
    HAVING COUNT(*) > 1
  LOOP
    -- Pick canonical: has charges > has sub > has scans > oldest
    SELECT co.id INTO v_canonical
    FROM public.companies co
    WHERE co.auth_user_id = v_user.uid
    ORDER BY
      (SELECT COUNT(*) FROM public.auditor_subscription_charges ch WHERE ch.company_id = co.id AND ch.status = 'succeeded') DESC,
      (SELECT COUNT(*) FROM public.auditor_subscriptions s WHERE s.company_id = co.id) DESC,
      (SELECT COUNT(*) FROM public.auditor_scans sc WHERE sc.company_id = co.id) DESC,
      co.created_at ASC
    LIMIT 1;

    v_actions := '';

    FOR v_dup IN
      SELECT id FROM public.companies
      WHERE auth_user_id = v_user.uid AND id != v_canonical
    LOOP
      v_actions := '';

      -- Ensure user is member of canonical (remove from duplicate first to avoid unique conflict)
      DELETE FROM public.company_members WHERE company_id = v_dup.id AND user_id = v_user.uid;
      INSERT INTO public.company_members (company_id, user_id, role, accepted_at)
      VALUES (v_canonical, v_user.uid, 'owner', now())
      ON CONFLICT (company_id, user_id) DO NOTHING;
      v_actions := v_actions || 'members;';

      -- Move auditor_checkout_sessions to canonical
      UPDATE public.auditor_checkout_sessions SET company_id = v_canonical WHERE company_id = v_dup.id;
      IF FOUND THEN v_actions := v_actions || 'checkout;'; END IF;

      -- Move auditor_leads to canonical
      UPDATE public.auditor_leads SET company_id = v_canonical WHERE company_id = v_dup.id;
      IF FOUND THEN v_actions := v_actions || 'leads;'; END IF;

      -- Clear auth_user_id from duplicate so user no longer "owns" it
      UPDATE public.companies SET auth_user_id = NULL WHERE id = v_dup.id;
      v_actions := v_actions || 'cleared_dup;';

      RETURN QUERY SELECT v_user.uid, v_canonical, v_dup.id, v_actions;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.auditor_repair_duplicate_companies() FROM public;
GRANT EXECUTE ON FUNCTION public.auditor_repair_duplicate_companies() TO service_role;

-- Run repair: SELECT * FROM public.auditor_repair_duplicate_companies();

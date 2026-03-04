-- ====================================================
-- 095 - Repair: Link Auditor user to company (manual)
-- ====================================================
-- Run this when a user paid but sees "אין חברה פעילה".
-- CHANGE v_email below to the user's email, then run in psql.
-- ====================================================

DO $$
DECLARE
  v_email text := 'user@example.com';  -- <-- CHANGE THIS to the user's email
  v_user_id uuid;
  v_company_id uuid;
BEGIN
  -- Resolve user by email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(trim(v_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found for email: %', v_email;
  END IF;

  -- Find company: from auditor_customers, auditor_leads, or companies by email
  SELECT ac.company_id INTO v_company_id
  FROM auditor_customers ac
  WHERE ac.user_id = v_user_id
  LIMIT 1;

  IF v_company_id IS NULL THEN
    SELECT al.company_id INTO v_company_id
    FROM auditor_leads al
    WHERE lower(al.email) = lower(trim(v_email))
      AND al.company_id IS NOT NULL
    ORDER BY al.created_at DESC
    LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    SELECT c.id INTO v_company_id
    FROM companies c
    WHERE lower(c.email) = lower(trim(v_email))
    LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No Auditor company found for email: %', v_email;
  END IF;

  -- Repair: set companies.auth_user_id
  UPDATE companies
  SET auth_user_id = v_user_id
  WHERE id = v_company_id;

  -- Repair: upsert company_members
  INSERT INTO company_members (company_id, user_id, role, accepted_at)
  VALUES (v_company_id, v_user_id, 'owner', now())
  ON CONFLICT (company_id, user_id) DO UPDATE
  SET role = 'owner', accepted_at = now();

  RAISE NOTICE 'Repaired: user % linked to company %', v_user_id, v_company_id;
END $$;

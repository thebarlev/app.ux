-- ====================================================
-- LIVE DEBUG: Test Template Update Flow
-- ====================================================
-- Run these queries ONE BY ONE in Supabase SQL Editor
-- to debug the template selection issue in real-time
-- ====================================================

-- ==================== STEP 1: Check Current State ====================

-- Show all receipt templates with their default status
SELECT 
  id,
  name,
  company_id,
  is_default,
  is_active,
  updated_at
FROM templates
WHERE document_type = 'receipt' AND is_active = TRUE
ORDER BY company_id NULLS FIRST, is_default DESC;

-- Expected: See which template has is_default = TRUE
-- ⚠️ If MULTIPLE templates have is_default = TRUE → BUG!
-- ⚠️ If ALL templates have is_default = FALSE → User couldn't select!

-- ==================== STEP 2: Check RLS Policy ====================

-- View the current UPDATE policy
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  qual::text as using_clause,
  with_check::text as with_check_clause
FROM pg_policies 
WHERE tablename = 'templates' AND policyname = 'templates_update';

-- Expected: USING clause should include:
-- "company_id IN (user_company_ids) OR company_id IS NULL"

-- ==================== STEP 3: Simulate User Action ====================

-- Pretend you're a user trying to update a global template
-- First, find a global template ID:
SELECT id, name FROM templates WHERE company_id IS NULL AND document_type = 'receipt' LIMIT 1;

-- Copy the ID from above, then try to update it:
-- (Replace 'TEMPLATE-ID-HERE' with actual ID)

-- BEGIN;  -- Start transaction (safe to test)
-- 
-- UPDATE templates 
-- SET is_default = TRUE 
-- WHERE id = 'TEMPLATE-ID-HERE';
-- 
-- -- Did it work? Check:
-- SELECT name, is_default FROM templates WHERE id = 'TEMPLATE-ID-HERE';
-- 
-- ROLLBACK;  -- Undo the test

-- If you got "permission denied" → RLS policy is blocking!
-- If it worked → Policy is OK, problem is elsewhere

-- ==================== STEP 4: Check for Duplicates ====================

-- Find if multiple templates are marked as default
SELECT 
  document_type,
  company_id,
  COUNT(*) as default_count,
  STRING_AGG(name || ' (id: ' || SUBSTRING(id::text, 1, 8) || ')', ', ') as templates
FROM templates
WHERE is_default = TRUE AND is_active = TRUE
GROUP BY document_type, company_id
HAVING COUNT(*) > 1;

-- Expected: NO ROWS
-- If you see rows → Multiple templates fighting for default!

-- ==================== STEP 5: Manual Fix (if needed) ====================

-- If you found duplicates, clean them up:

-- First: Turn OFF all defaults for receipt
-- UPDATE templates 
-- SET is_default = FALSE 
-- WHERE document_type = 'receipt';

-- Then: Turn ON only the one you want
-- (Replace NAME with your template name)
-- UPDATE templates 
-- SET is_default = TRUE 
-- WHERE name = 'תבנית קלאסית' 
--   AND company_id IS NULL 
--   AND document_type = 'receipt';

-- Verify:
-- SELECT name, is_default 
-- FROM templates 
-- WHERE document_type = 'receipt' AND company_id IS NULL;

-- ==================== STEP 6: Test End-to-End ====================

-- After fixing, verify the full flow:

-- 1. Check DB state
SELECT name, is_default FROM templates WHERE document_type = 'receipt' AND company_id IS NULL;

-- 2. Go to /dashboard/settings in browser
-- 3. Click on a different template
-- 4. Wait 2 seconds
-- 5. Come back here and re-run:
SELECT name, is_default, updated_at FROM templates WHERE document_type = 'receipt' AND company_id IS NULL ORDER BY updated_at DESC;

-- Did is_default change?
-- Did updated_at change?
-- If NO → API is failing silently!

-- ==================== STEP 7: Check Server Logs ====================

-- If the UPDATE is failing, check Supabase logs:
-- 1. Go to Supabase Dashboard → Logs → API Logs
-- 2. Filter by "POST /rest/v1/templates"
-- 3. Look for errors with status 403 or 500

-- Common errors:
-- "new row violates row-level security policy" → RLS blocking
-- "duplicate key value violates unique constraint" → Duplicate defaults

-- ==================== STEP 8: Nuclear Option ====================

-- If nothing works, drop and recreate the policy:

-- DROP POLICY IF EXISTS templates_update ON public.templates;
-- 
-- CREATE POLICY templates_update ON public.templates
--   FOR UPDATE
--   USING (
--     -- Admins can update global templates
--     (
--       company_id IS NULL 
--       AND EXISTS (
--         SELECT 1 FROM public.system_admins
--         WHERE auth_user_id = auth.uid()
--       )
--     )
--     OR
--     -- Users can update company templates
--     (
--       company_id IS NOT NULL
--       AND company_id IN (SELECT public.user_company_ids())
--     )
--     OR
--     -- Users can set is_default on global templates
--     (
--       company_id IS NULL
--       AND auth.uid() IS NOT NULL
--     )
--   )
--   WITH CHECK (
--     (
--       company_id IS NULL 
--       AND EXISTS (
--         SELECT 1 FROM public.system_admins
--         WHERE auth_user_id = auth.uid()
--       )
--     )
--     OR
--     (
--       company_id IS NOT NULL
--       AND company_id IN (SELECT public.user_company_ids())
--     )
--     OR
--     (
--       company_id IS NULL
--       AND auth.uid() IS NOT NULL
--     )
--   );

-- ==================== SUMMARY ====================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Live Debug Checklist:';
  RAISE NOTICE '========================================';
  RAISE NOTICE '☐ Check current templates state (Step 1)';
  RAISE NOTICE '☐ Verify RLS policy exists (Step 2)';
  RAISE NOTICE '☐ Test manual UPDATE (Step 3)';
  RAISE NOTICE '☐ Check for duplicates (Step 4)';
  RAISE NOTICE '☐ Clean duplicates if found (Step 5)';
  RAISE NOTICE '☐ Test in browser + recheck DB (Step 6)';
  RAISE NOTICE '☐ Check Supabase logs (Step 7)';
  RAISE NOTICE '☐ Recreate policy if needed (Step 8)';
  RAISE NOTICE '';
  RAISE NOTICE '🎯 Goal: is_default should change when user clicks in UI';
END $$;

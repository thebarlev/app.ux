-- ====================================================
-- DEBUG QUERY: Check Template Selection State
-- ====================================================
-- Run this in Supabase SQL Editor to debug template selection issues
-- ====================================================

-- ==================== PART 1: Current Policy Status ====================

SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'templates'
ORDER BY policyname;

-- Expected: 4 policies (select, insert, update, delete)
-- UPDATE policy should allow: company templates OR (company_id IS NULL AND auth.uid() IS NOT NULL)

-- ==================== PART 2: All Templates Overview ====================

SELECT 
  id,
  name,
  document_type,
  company_id,
  is_default,
  is_active,
  created_at
FROM templates
WHERE is_active = true
ORDER BY 
  document_type,
  company_id NULLS FIRST,
  is_default DESC,
  name;

-- What to look for:
-- - Each document_type should have AT MOST 1 default per company
-- - Each document_type should have AT MOST 1 global default (company_id IS NULL, is_default = TRUE)

-- ==================== PART 3: Find Duplicate Defaults (BUG CHECK) ====================

SELECT 
  document_type,
  company_id,
  COUNT(*) as default_count,
  STRING_AGG(name, ', ') as template_names
FROM templates
WHERE is_default = TRUE AND is_active = TRUE
GROUP BY document_type, company_id
HAVING COUNT(*) > 1;

-- Expected: NO ROWS (if there are rows, multiple templates are marked as default!)

-- ==================== PART 4: Check Specific User's Templates ====================

-- Replace 'YOUR-USER-EMAIL' with actual user email (e.g., test20@gmail.com)
WITH user_info AS (
  SELECT 
    au.id as auth_user_id,
    au.email,
    cm.company_id
  FROM auth.users au
  LEFT JOIN company_members cm ON cm.user_id = au.id
  WHERE au.email = 'test20@gmail.com'  -- ⚠️ CHANGE THIS
),
user_templates AS (
  SELECT 
    t.id,
    t.name,
    t.document_type,
    t.company_id,
    t.is_default,
    t.is_active,
    CASE 
      WHEN t.company_id IS NULL THEN 'Global'
      WHEN t.company_id = ui.company_id THEN 'Company'
      ELSE 'Other Company'
    END as template_scope
  FROM templates t
  CROSS JOIN user_info ui
  WHERE t.is_active = TRUE
    AND (
      t.company_id IS NULL  -- Global templates
      OR t.company_id = ui.company_id  -- User's company templates
    )
)
SELECT * FROM user_templates
ORDER BY document_type, template_scope, is_default DESC, name;

-- What to check:
-- - Each document_type should have exactly 1 template with is_default = TRUE visible to user
-- - If user selected a global template, company_id should be NULL and is_default = TRUE

-- ==================== PART 5: Test RLS Policy ====================

-- Test if current user can update a global template's is_default
-- Run this AS A NORMAL USER (not admin):

-- Step 1: Find a global template
SELECT id, name, document_type, is_default
FROM templates
WHERE company_id IS NULL AND document_type = 'receipt'
LIMIT 1;

-- Step 2: Try to update it (copy ID from above)
-- UPDATE templates 
-- SET is_default = TRUE 
-- WHERE id = 'PASTE-TEMPLATE-ID-HERE';

-- If you get "permission denied" → RLS policy is blocking you (BAD!)
-- If it succeeds → RLS policy is working (GOOD!)

-- ==================== PART 6: Check Recent Updates ====================

SELECT 
  id,
  name,
  document_type,
  company_id,
  is_default,
  updated_at
FROM templates
WHERE updated_at > NOW() - INTERVAL '1 hour'
ORDER BY updated_at DESC;

-- Shows templates updated in last hour
-- Check if is_default is actually changing when you click in UI

-- ==================== PART 7: Full Audit Trail ====================

-- Check if there's an audit table tracking changes
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name LIKE '%audit%'
  AND table_name LIKE '%template%';

-- If audit_templates table exists, query it:
-- SELECT * FROM audit_templates ORDER BY created_at DESC LIMIT 20;

-- ==================== SUMMARY ====================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Template Debug Query Complete';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Check results above for:';
  RAISE NOTICE '1. RLS policies are correct';
  RAISE NOTICE '2. No duplicate defaults exist';
  RAISE NOTICE '3. User can see correct templates';
  RAISE NOTICE '4. User can UPDATE global templates is_default';
  RAISE NOTICE '5. Recent changes are being saved';
END $$;

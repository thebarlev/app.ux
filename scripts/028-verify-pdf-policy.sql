-- ====================================================
-- Verify PDF Upload RLS Policy
-- ====================================================
-- Run this AFTER running 027-fix-pdf-upload-rls.sql
-- ====================================================

-- Check if policy exists
SELECT 
  policyname,
  cmd as operation,
  roles::text as roles,
  qual::text as using_clause,
  with_check::text as with_check_clause
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname = 'Allow PDF uploads to documents folder';

-- If no rows returned, the policy doesn't exist
-- Check all storage policies for business-assets
SELECT 
  policyname,
  cmd,
  roles::text
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (
    qual::text LIKE '%business-assets%' 
    OR with_check::text LIKE '%business-assets%'
    OR qual::text LIKE '%documents%'
    OR with_check::text LIKE '%documents%'
  )
ORDER BY policyname;

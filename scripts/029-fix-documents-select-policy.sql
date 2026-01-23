-- ====================================================
-- Fix Documents SELECT Policy for Storage RLS
-- ====================================================
-- Date: January 7, 2026
-- Purpose: Ensure documents table has SELECT policy that allows
--          Storage RLS policies to check document ownership
-- ====================================================

-- Check current SELECT policies on documents
SELECT 
  policyname,
  cmd,
  qual::text as using_clause
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'documents'
  AND cmd = 'SELECT';

-- Note: If there's no SELECT policy or it's too restrictive,
-- Storage RLS policies won't be able to check document ownership.
-- The documents_select policy should allow SELECT for users' companies.

-- Fix companies UPDATE policy to support both direct owners and company members
-- Date: December 30, 2025
-- Purpose: Allow users to update their company settings (including signature_url)

-- Drop existing restrictive policy if exists
DROP POLICY IF EXISTS "Business owners can update own company" ON public.companies;

-- Create comprehensive UPDATE policy
-- Allows update if:
-- 1. User is the direct owner (auth_user_id matches)
-- 2. User is a member with owner/admin role in company_members table
CREATE POLICY "companies_update_policy" ON public.companies
  FOR UPDATE
  USING (
    -- Direct owner
    auth.uid() = auth_user_id
    OR
    -- Member with owner/admin role
    id IN (
      SELECT company_id 
      FROM public.company_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    -- Same conditions for the new row
    auth.uid() = auth_user_id
    OR
    id IN (
      SELECT company_id 
      FROM public.company_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Verify policy was created
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
WHERE tablename = 'companies' AND policyname = 'companies_update_policy';

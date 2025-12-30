-- Fix signature upload RLS policy issue
-- Date: December 30, 2025
-- Purpose: Add signature_url column and fix UPDATE policy for companies table
-- Run this script in Supabase SQL Editor

-- ====================================
-- Step 1: Add signature_url column
-- ====================================

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS signature_url TEXT;

COMMENT ON COLUMN public.companies.signature_url IS 'URL to uploaded signature image stored in Supabase Storage';

-- ====================================
-- Step 2: Fix companies UPDATE policy
-- ====================================

-- Drop existing restrictive policy if exists
DROP POLICY IF EXISTS "Business owners can update own company" ON public.companies;

-- Create comprehensive UPDATE policy
-- Allows update if:
-- 1. User is the direct owner (auth_user_id matches)
-- 2. User is a member with owner/admin role in company_members table (if table exists)
CREATE POLICY "companies_update_policy" ON public.companies
  FOR UPDATE
  USING (
    -- Direct owner
    auth.uid() = auth_user_id
    OR
    -- Member with owner/admin role (gracefully handles if company_members doesn't exist)
    EXISTS (
      SELECT 1 
      FROM public.company_members 
      WHERE company_id = companies.id
      AND user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    -- Same conditions for the new row
    auth.uid() = auth_user_id
    OR
    EXISTS (
      SELECT 1 
      FROM public.company_members 
      WHERE company_id = companies.id
      AND user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- ====================================
-- Step 3: Verify changes
-- ====================================

-- Check column exists
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'companies' 
  AND column_name = 'signature_url';

-- Check policy exists
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename = 'companies' 
  AND policyname = 'companies_update_policy';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Successfully added signature_url column and fixed UPDATE policy!';
  RAISE NOTICE 'You can now upload signatures from the dashboard settings page.';
END $$;

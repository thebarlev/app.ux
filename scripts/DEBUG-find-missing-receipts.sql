-- =====================================================
-- DEBUG SCRIPT: Find Missing Receipts
-- =====================================================
-- Run this script in Supabase SQL Editor to debug missing receipts

-- Step 1: Check if you're logged in and get your user ID
SELECT 
  auth.uid() as my_user_id,
  auth.email() as my_email;

-- Step 2: Find your company
SELECT 
  id as company_id,
  company_name,
  email,
  auth_user_id,
  created_at
FROM companies
WHERE auth_user_id = auth.uid();

-- Step 3: Check if company_members table exists (might not be created yet)
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'company_members'
) as company_members_exists;

-- Step 4: Count ALL receipts in the system (admin view)
SELECT 
  COUNT(*) as total_receipts_in_system,
  COUNT(*) FILTER (WHERE document_type = 'receipt') as total_receipts,
  COUNT(*) FILTER (WHERE document_type = 'receipt' AND document_status = 'draft') as draft_receipts,
  COUNT(*) FILTER (WHERE document_type = 'receipt' AND document_status = 'final') as final_receipts
FROM documents;

-- Step 5: Find ALL your receipts (using your auth_user_id)
SELECT 
  d.id,
  d.document_number,
  d.document_status,
  d.customer_name,
  d.total_amount,
  d.currency,
  d.created_at,
  d.company_id,
  c.company_name,
  c.email
FROM documents d
LEFT JOIN companies c ON d.company_id = c.id
WHERE d.document_type = 'receipt'
  AND d.company_id IN (
    SELECT id FROM companies WHERE auth_user_id = auth.uid()
  )
ORDER BY d.created_at DESC;

-- Step 6: Check if there are receipts with NO company_id match
SELECT 
  d.id,
  d.document_number,
  d.document_status,
  d.customer_name,
  d.total_amount,
  d.company_id,
  'ORPHANED - No matching company!' as warning
FROM documents d
WHERE d.document_type = 'receipt'
  AND NOT EXISTS (
    SELECT 1 FROM companies c 
    WHERE c.id = d.company_id 
    AND c.auth_user_id = auth.uid()
  );

-- Step 7: Check RLS policies on documents table
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
WHERE tablename = 'documents'
ORDER BY policyname;

-- Step 8: Test the user_company_ids() function (if it exists)
SELECT user_company_ids() as my_companies;

-- Step 9: Check if you have any receipts created in the last 7 days
SELECT 
  d.id,
  d.document_number,
  d.document_status,
  d.customer_name,
  d.total_amount,
  d.created_at,
  d.company_id,
  c.company_name,
  EXTRACT(HOUR FROM (NOW() - d.created_at)) as hours_ago
FROM documents d
LEFT JOIN companies c ON d.company_id = c.id
WHERE d.document_type = 'receipt'
  AND d.created_at > NOW() - INTERVAL '7 days'
ORDER BY d.created_at DESC;

-- Step 10: Verify your company has a valid ID
SELECT 
  c.id,
  c.company_name,
  c.auth_user_id,
  c.created_at,
  (SELECT COUNT(*) FROM documents WHERE company_id = c.id) as total_documents,
  (SELECT COUNT(*) FROM documents WHERE company_id = c.id AND document_type = 'receipt') as total_receipts
FROM companies c
WHERE c.auth_user_id = auth.uid();

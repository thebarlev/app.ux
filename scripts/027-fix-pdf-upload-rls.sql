-- ====================================================
-- Migration 027: FIX PDF Upload RLS Policy
-- ====================================================
-- Date: January 7, 2026
-- Purpose: Fix RLS policy for PDF uploads with improved validation
-- ====================================================

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Allow PDF uploads to documents folder" ON storage.objects;

-- Create a SECURITY DEFINER function to get document's company_id
-- This bypasses RLS on documents table
CREATE OR REPLACE FUNCTION public.get_document_company_id(document_id_text text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  doc_company_id uuid;
BEGIN
  -- Get document's company_id (bypasses RLS because of SECURITY DEFINER)
  SELECT company_id INTO doc_company_id
  FROM public.documents
  WHERE id::text = document_id_text;
  
  RETURN doc_company_id;
END;
$$;

COMMENT ON FUNCTION public.get_document_company_id(text) IS 'Gets document company_id by document ID (bypasses RLS)';

-- Create improved RLS policy for PDF uploads
-- Path format: documents/{documentId}/source.pdf
-- This policy allows authenticated users to upload PDFs for documents 
-- belonging to their company (either as owner or member)
-- Uses SECURITY DEFINER function to bypass RLS on documents table
CREATE POLICY "Allow PDF uploads to documents folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'business-assets'
  AND (storage.foldername(name))[1] = 'documents'
  AND (storage.foldername(name))[3] = 'source.pdf'
  AND public.get_document_company_id((storage.foldername(name))[2]) IS NOT NULL
  AND public.get_document_company_id((storage.foldername(name))[2]) IN (
    -- User owns the company directly
    SELECT id FROM public.companies WHERE auth_user_id = auth.uid()
    UNION
    -- User is a member of the company
    SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
  )
);

-- Verify policy was created and show details
SELECT 
  '✅ PDF upload RLS policy created successfully!' as status,
  policyname,
  cmd as operation,
  roles::text as roles
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname = 'Allow PDF uploads to documents folder';

-- If no rows returned, the policy was not created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'Allow PDF uploads to documents folder'
  ) THEN
    RAISE EXCEPTION '❌ Failed to create PDF upload RLS policy - policy not found after creation';
  END IF;
END $$;

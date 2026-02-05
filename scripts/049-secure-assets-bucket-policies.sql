-- =====================================================
-- 049 - SECURE STORAGE BUCKET POLICIES (PRIVATE)
-- =====================================================
-- Purpose:
-- - Introduce a PRIVATE storage bucket for sensitive assets:
--   - Company signatures (PII)
--   - Accounting PDFs (confidential)
--
-- Bucket name (must match code): business-secure
-- Bucket visibility: PRIVATE
--
-- IMPORTANT:
-- - Create the bucket in Supabase Dashboard > Storage (PRIVATE).
-- - Do NOT enable "public bucket".
--
-- This script defines Storage RLS policies to allow authenticated users
-- to upload/update/delete THEIR OWN company signatures only.
-- PDFs are written/read server-side using service role and do not rely on these policies.

-- Allow authenticated users to upload signature to their company folder
CREATE POLICY "Users can upload signature to own company folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'business-secure'
  AND (storage.foldername(name))[1] = 'business-signatures'
  AND (storage.foldername(name))[2] IN (
    SELECT id::text FROM public.companies WHERE auth_user_id = auth.uid()
    UNION
    SELECT company_id::text FROM public.company_members WHERE user_id = auth.uid()
  )
);

-- Allow authenticated users to update/replace their company signature
CREATE POLICY "Users can update signature in own company folder"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'business-secure'
  AND (storage.foldername(name))[1] = 'business-signatures'
  AND (storage.foldername(name))[2] IN (
    SELECT id::text FROM public.companies WHERE auth_user_id = auth.uid()
    UNION
    SELECT company_id::text FROM public.company_members WHERE user_id = auth.uid()
  )
);

-- Allow authenticated users to delete their company signature
CREATE POLICY "Users can delete signature from own company folder"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'business-secure'
  AND (storage.foldername(name))[1] = 'business-signatures'
  AND (storage.foldername(name))[2] IN (
    SELECT id::text FROM public.companies WHERE auth_user_id = auth.uid()
    UNION
    SELECT company_id::text FROM public.company_members WHERE user_id = auth.uid()
  )
);

-- NOTE: No public SELECT policy. Signatures must not be public.


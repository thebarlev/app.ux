-- ====================================================
-- Migration 026: Update Storage Bucket MIME Types
-- ====================================================
-- Date: January 7, 2026
-- Purpose: Add application/pdf to business-assets bucket allowed MIME types
-- ====================================================

-- Note: This script provides instructions for manual bucket update
-- Supabase Storage bucket MIME types must be updated via Dashboard or Management API

/*
MANUAL STEPS REQUIRED:

1. Go to Supabase Dashboard
2. Navigate to Storage > business-assets bucket
3. Click on "Settings" or "Configuration"
4. Find "Allowed MIME types" field
5. Update from:
   image/png,image/jpeg,image/jpg,image/svg+xml
   
   To:
   image/png,image/jpeg,image/jpg,image/svg+xml,application/pdf

6. Save changes

ALTERNATIVE: Use Supabase Management API
POST https://api.supabase.com/v1/projects/{project_id}/storage/buckets/business-assets
{
  "allowed_mime_types": [
    "image/png",
    "image/jpeg", 
    "image/jpg",
    "image/svg+xml",
    "application/pdf"
  ]
}
*/

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow PDF uploads to documents folder" ON storage.objects;
DROP POLICY IF EXISTS "Public can view PDFs" ON storage.objects;

-- Add RLS policy to allow PDF uploads to documents folder
-- Path format: documents/{documentId}/source.pdf
-- This policy allows authenticated users to upload PDFs for documents belonging to their company
-- Uses the same pattern as logo uploads (text comparison instead of UUID)
CREATE POLICY "Allow PDF uploads to documents folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'business-assets'
  AND (storage.foldername(name))[1] = 'documents'
  AND (storage.foldername(name))[2] IN (
    SELECT d.id::text FROM public.documents d
    WHERE d.company_id IN (
      SELECT id FROM public.companies WHERE auth_user_id = auth.uid()
      UNION
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  )
  AND (storage.foldername(name))[3] = 'source.pdf'
);

-- Allow public read access to PDFs (for downloads)
CREATE POLICY "Public can view PDFs"
ON storage.objects FOR SELECT
TO public
USING (
  bucket_id = 'business-assets'
  AND (storage.foldername(name))[1] = 'documents'
);

-- Success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Storage policies for PDFs created!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '⚠️  IMPORTANT: Update bucket MIME types manually in Dashboard!';
  RAISE NOTICE '   Add: application/pdf';
END $$;

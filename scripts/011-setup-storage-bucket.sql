-- =====================================================
-- SETUP SUPABASE STORAGE FOR BUSINESS LOGOS
-- =====================================================

-- Create storage bucket for business assets (if not exists)
-- This should be run in Supabase SQL Editor or via Supabase Dashboard

-- Note: This is a storage bucket creation, not a standard SQL table
-- Execute this in Supabase Dashboard > Storage > Create new bucket
-- Or use the Supabase Management API

/*
Bucket Configuration:
- Bucket Name: business-assets
- Public: true (for logo URLs to work)
- Allowed MIME types: image/png, image/jpeg, image/jpg, image/svg+xml
- Max file size: 5MB
- File size limit: 5242880 bytes

Folder Structure:
business-assets/
└── business-logos/
    └── {company_id}/
        └── logo.png (or logo.jpg, logo.svg)

RLS Policies for business-assets bucket:
*/

-- Allow authenticated users to upload to their company folder
-- Policy: authenticated users can INSERT into business-logos/{their_company_id}/
CREATE POLICY "Users can upload logo to own company folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'business-assets' 
  AND (storage.foldername(name))[1] = 'business-logos'
  AND (storage.foldername(name))[2] IN (
    SELECT id::text FROM public.companies WHERE auth_user_id = auth.uid()
    UNION
    SELECT company_id::text FROM public.company_members WHERE user_id = auth.uid()
  )
);

-- Allow authenticated users to update/replace their company logo
CREATE POLICY "Users can update logo in own company folder"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'business-assets'
  AND (storage.foldername(name))[1] = 'business-logos'
  AND (storage.foldername(name))[2] IN (
    SELECT id::text FROM public.companies WHERE auth_user_id = auth.uid()
    UNION
    SELECT company_id::text FROM public.company_members WHERE user_id = auth.uid()
  )
);

-- Allow authenticated users to delete their company logo
CREATE POLICY "Users can delete logo from own company folder"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'business-assets'
  AND (storage.foldername(name))[1] = 'business-logos'
  AND (storage.foldername(name))[2] IN (
    SELECT id::text FROM public.companies WHERE auth_user_id = auth.uid()
    UNION
    SELECT company_id::text FROM public.company_members WHERE user_id = auth.uid()
  )
);

-- Allow public read access to logos (so they display on receipts/PDFs)
CREATE POLICY "Public can view logos"
ON storage.objects FOR SELECT
TO public
USING (
  bucket_id = 'business-assets'
  AND (storage.foldername(name))[1] = 'business-logos'
);

/*
MANUAL STEPS REQUIRED:
1. Go to Supabase Dashboard
2. Navigate to Storage
3. Click "Create a new bucket"
4. Name it "business-assets"
5. Set it as Public
6. Click Create
7. The policies above will handle permissions
*/

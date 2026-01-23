-- ====================================================
-- Add Thumbnail Support to Templates
-- ====================================================
-- Date: January 1, 2026
-- Purpose: Add thumbnail_url column and storage policies for template thumbnails
-- ====================================================

-- ==================== STEP 1: Add Column ====================

-- Add thumbnail_url column to templates table
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

COMMENT ON COLUMN public.templates.thumbnail_url IS 'URL to template preview/thumbnail image stored in Supabase Storage';

-- ==================== STEP 2: Create Storage Policies ====================

-- Policy 1: Allow authenticated users to upload template thumbnails
DROP POLICY IF EXISTS "Users can upload template thumbnails" ON storage.objects;
CREATE POLICY "Users can upload template thumbnails"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'business-assets' 
  AND (storage.foldername(name))[1] = 'template-thumbnails'
  AND (
    -- Admins can upload to any template
    EXISTS (
      SELECT 1 FROM public.system_admins 
      WHERE auth_user_id = auth.uid()
    )
    OR
    -- Users can upload to their company's templates
    (storage.foldername(name))[2] IN (
      SELECT id::text FROM public.templates 
      WHERE company_id IN (SELECT public.user_company_ids())
    )
  )
);

-- Policy 2: Allow public read access to template thumbnails
DROP POLICY IF EXISTS "Public can view template thumbnails" ON storage.objects;
CREATE POLICY "Public can view template thumbnails"
ON storage.objects FOR SELECT
TO public
USING (
  bucket_id = 'business-assets'
  AND (storage.foldername(name))[1] = 'template-thumbnails'
);

-- Policy 3: Allow template owners to update thumbnails
DROP POLICY IF EXISTS "Users can update template thumbnails" ON storage.objects;
CREATE POLICY "Users can update template thumbnails"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'business-assets'
  AND (storage.foldername(name))[1] = 'template-thumbnails'
  AND (
    -- Admins can update any template thumbnail
    EXISTS (
      SELECT 1 FROM public.system_admins 
      WHERE auth_user_id = auth.uid()
    )
    OR
    -- Users can update their company's template thumbnails
    (storage.foldername(name))[2] IN (
      SELECT id::text FROM public.templates 
      WHERE company_id IN (SELECT public.user_company_ids())
    )
  )
);

-- Policy 4: Allow template owners to delete thumbnails
DROP POLICY IF EXISTS "Users can delete template thumbnails" ON storage.objects;
CREATE POLICY "Users can delete template thumbnails"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'business-assets'
  AND (storage.foldername(name))[1] = 'template-thumbnails'
  AND (
    -- Admins can delete any template thumbnail
    EXISTS (
      SELECT 1 FROM public.system_admins 
      WHERE auth_user_id = auth.uid()
    )
    OR
    -- Users can delete their company's template thumbnails
    (storage.foldername(name))[2] IN (
      SELECT id::text FROM public.templates 
      WHERE company_id IN (SELECT public.user_company_ids())
    )
  )
);

-- ==================== STEP 3: Verification ====================

-- Verify column was added
DO $$
DECLARE
  column_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name = 'templates' 
      AND column_name = 'thumbnail_url'
  ) INTO column_exists;
  
  IF column_exists THEN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Thumbnail support added successfully!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Column: templates.thumbnail_url (TEXT)';
    RAISE NOTICE 'Storage Policies: 4 policies created';
    RAISE NOTICE 'Folder Structure: business-assets/template-thumbnails/{template_id}/thumbnail.png';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  REMINDER: Ensure "business-assets" bucket exists in Supabase Storage';
    RAISE NOTICE '';
  ELSE
    RAISE EXCEPTION '❌ Failed to add thumbnail_url column';
  END IF;
END $$;

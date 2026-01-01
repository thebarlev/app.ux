-- ====================================================
-- Add Template Selection and Thumbnails
-- ====================================================
-- Date: January 1, 2026
-- Purpose: Add thumbnail support and template selection for companies
-- ====================================================

-- Add thumbnail_url to templates table
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
COMMENT ON COLUMN public.templates.thumbnail_url IS 'URL to template preview/thumbnail image';

-- Add selected_template_id to companies table
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS selected_template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.companies.selected_template_id IS 'Currently selected template for this company';

-- Create index for faster lookup
CREATE INDEX IF NOT EXISTS idx_companies_selected_template ON public.companies(selected_template_id) WHERE selected_template_id IS NOT NULL;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Template selection fields added!';
  RAISE NOTICE '========================================';
END $$;

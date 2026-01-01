-- ====================================================
-- Templates Table - מערכת ניהול תבניות למסמכים
-- ====================================================
-- Date: January 1, 2026
-- Purpose: Create templates table for managing HTML/CSS document templates
-- ====================================================

-- Create templates table
CREATE TABLE IF NOT EXISTS public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  document_type TEXT NOT NULL CHECK (document_type IN ('receipt', 'invoice', 'quote', 'delivery_note', 'credit_invoice')),
  html_template TEXT NOT NULL,
  css TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Constraints
  CONSTRAINT unique_default_per_company_type UNIQUE NULLS NOT DISTINCT (company_id, document_type, is_default)
);

COMMENT ON TABLE public.templates IS 'Document templates (HTML + CSS) for receipts, invoices, etc.';
COMMENT ON COLUMN public.templates.company_id IS 'Company that owns this template. NULL = global template available to all companies';
COMMENT ON COLUMN public.templates.document_type IS 'Type of document this template is for';
COMMENT ON COLUMN public.templates.html_template IS 'Handlebars HTML template with placeholders';
COMMENT ON COLUMN public.templates.css IS 'CSS styles for the template';
COMMENT ON COLUMN public.templates.is_default IS 'Whether this is the default template for this company/document_type';
COMMENT ON COLUMN public.templates.is_active IS 'Whether this template is currently active and can be used';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_templates_company_id ON public.templates(company_id);
CREATE INDEX IF NOT EXISTS idx_templates_document_type ON public.templates(document_type);
CREATE INDEX IF NOT EXISTS idx_templates_is_default ON public.templates(is_default) WHERE is_default = TRUE;
CREATE INDEX IF NOT EXISTS idx_templates_is_active ON public.templates(is_active) WHERE is_active = TRUE;

-- Enable RLS
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for templates
DO $$
BEGIN
  -- SELECT: Users can view global templates and their company's templates
  DROP POLICY IF EXISTS templates_select ON public.templates;
  CREATE POLICY templates_select ON public.templates
    FOR SELECT
    USING (
      company_id IS NULL 
      OR company_id IN (SELECT public.user_company_ids())
    );

  -- INSERT: Users can create templates for their company
  DROP POLICY IF EXISTS templates_insert ON public.templates;
  CREATE POLICY templates_insert ON public.templates
    FOR INSERT
    WITH CHECK (company_id IN (SELECT public.user_company_ids()));

  -- UPDATE: Users can update their company's templates
  DROP POLICY IF EXISTS templates_update ON public.templates;
  CREATE POLICY templates_update ON public.templates
    FOR UPDATE
    USING (company_id IN (SELECT public.user_company_ids()))
    WITH CHECK (company_id IN (SELECT public.user_company_ids()));

  -- DELETE: Users can delete their company's templates
  DROP POLICY IF EXISTS templates_delete ON public.templates;
  CREATE POLICY templates_delete ON public.templates
    FOR DELETE
    USING (company_id IN (SELECT public.user_company_ids()));

  RAISE NOTICE '✅ Created policies for templates';
END $$;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS templates_updated_at ON public.templates;
CREATE TRIGGER templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Add pdf_path column to documents table (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'documents' 
    AND column_name = 'pdf_path'
  ) THEN
    ALTER TABLE public.documents
    ADD COLUMN pdf_path TEXT;
    
    COMMENT ON COLUMN public.documents.pdf_path IS 'Path to generated PDF in Supabase Storage (generated once when document becomes final)';
    
    RAISE NOTICE '✅ Added pdf_path column to documents';
  ELSE
    RAISE NOTICE '⏭️  pdf_path already exists';
  END IF;
END $$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Templates table created successfully!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Next: Insert default templates or create via Admin UI';
END $$;

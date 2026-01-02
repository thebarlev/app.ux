-- ====================================================
-- Company Template Selections
-- ====================================================
-- Date: January 1, 2026
-- Purpose: Allow companies to select specific templates per document type
-- ====================================================

-- Create junction table for company template selections
CREATE TABLE IF NOT EXISTS public.company_template_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'receipt',
    'invoice',
    'tax_invoice',
    'quote',
    'delivery_note',
    'credit_invoice',
    'proforma',
    'transaction_invoice'
  )),
  template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraint: One template per document type per company
  UNIQUE(company_id, document_type)
);

COMMENT ON TABLE public.company_template_selections IS 'Maps companies to selected templates per document type (one template per type)';
COMMENT ON COLUMN public.company_template_selections.company_id IS 'Company making the selection';
COMMENT ON COLUMN public.company_template_selections.document_type IS 'Type of document (receipt, invoice, etc.)';
COMMENT ON COLUMN public.company_template_selections.template_id IS 'Selected template for this document type';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_company_template_selections_company 
  ON public.company_template_selections(company_id);

CREATE INDEX IF NOT EXISTS idx_company_template_selections_template 
  ON public.company_template_selections(template_id);

CREATE INDEX IF NOT EXISTS idx_company_template_selections_lookup
  ON public.company_template_selections(company_id, document_type);

-- Enable RLS
ALTER TABLE public.company_template_selections ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their company's selections
DROP POLICY IF EXISTS company_template_selections_select ON public.company_template_selections;
CREATE POLICY company_template_selections_select ON public.company_template_selections
  FOR SELECT
  USING (
    company_id IN (SELECT public.user_company_ids())
  );

-- Users can insert selections for their company
DROP POLICY IF EXISTS company_template_selections_insert ON public.company_template_selections;
CREATE POLICY company_template_selections_insert ON public.company_template_selections
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.user_company_ids())
  );

-- Users can update their company's selections
DROP POLICY IF EXISTS company_template_selections_update ON public.company_template_selections;
CREATE POLICY company_template_selections_update ON public.company_template_selections
  FOR UPDATE
  USING (
    company_id IN (SELECT public.user_company_ids())
  )
  WITH CHECK (
    company_id IN (SELECT public.user_company_ids())
  );

-- Users can delete their company's selections
DROP POLICY IF EXISTS company_template_selections_delete ON public.company_template_selections;
CREATE POLICY company_template_selections_delete ON public.company_template_selections
  FOR DELETE
  USING (
    company_id IN (SELECT public.user_company_ids())
  );

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.update_company_template_selections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_company_template_selections_updated_at ON public.company_template_selections;
CREATE TRIGGER update_company_template_selections_updated_at
  BEFORE UPDATE ON public.company_template_selections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_company_template_selections_updated_at();

-- Success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Company template selections created!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Table: company_template_selections';
  RAISE NOTICE 'Constraint: ONE template per document type per company';
  RAISE NOTICE 'RLS: Enabled with user_company_ids() policies';
END $$;

-- ====================================================
-- Template Multi-Document Type Support
-- ====================================================
-- Date: January 1, 2026
-- Purpose: Enable templates to support multiple document types
-- ====================================================

-- Step 1: Create junction table for template-document type relationships
CREATE TABLE IF NOT EXISTS public.template_document_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique combination
  UNIQUE(template_id, document_type)
);

-- Step 2: Create index for performance
CREATE INDEX IF NOT EXISTS idx_template_document_types_template 
  ON public.template_document_types(template_id);

CREATE INDEX IF NOT EXISTS idx_template_document_types_doc_type 
  ON public.template_document_types(document_type);

-- Step 3: Add RLS policies
ALTER TABLE public.template_document_types ENABLE ROW LEVEL SECURITY;

-- Admin can see all
DROP POLICY IF EXISTS template_document_types_admin_all ON public.template_document_types;
CREATE POLICY template_document_types_admin_all ON public.template_document_types
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.system_admins
      WHERE auth_user_id = auth.uid()
    )
  );

-- Users can see mappings for their company's templates or global templates
DROP POLICY IF EXISTS template_document_types_user_select ON public.template_document_types;
CREATE POLICY template_document_types_user_select ON public.template_document_types
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.templates t
      WHERE t.id = template_document_types.template_id
        AND (
          t.company_id IN (SELECT public.user_company_ids())
          OR t.company_id IS NULL
        )
    )
  );

-- Step 4: Migrate existing data
-- Copy document_type from templates to template_document_types
INSERT INTO public.template_document_types (template_id, document_type)
SELECT id, document_type
FROM public.templates
WHERE document_type IS NOT NULL
ON CONFLICT (template_id, document_type) DO NOTHING;

-- Step 5: Add comments
COMMENT ON TABLE public.template_document_types IS 'Junction table: Templates can support multiple document types';
COMMENT ON COLUMN public.template_document_types.template_id IS 'Reference to template';
COMMENT ON COLUMN public.template_document_types.document_type IS 'Document type (receipt, invoice, etc)';

-- Step 6: Keep old document_type column for backward compatibility (optional)
-- We'll keep it for now but make it nullable
ALTER TABLE public.templates ALTER COLUMN document_type DROP NOT NULL;

-- Add note to old column
COMMENT ON COLUMN public.templates.document_type IS 'DEPRECATED: Use template_document_types table instead. Kept for backward compatibility.';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Multi-document type support added!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Templates can now support multiple document types via template_document_types table';
END $$;

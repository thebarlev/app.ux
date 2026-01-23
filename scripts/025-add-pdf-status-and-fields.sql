-- ====================================================
-- Migration 025: Add PDF Status and Regulatory Fields
-- ====================================================
-- Date: January 7, 2026
-- Purpose: Add PDF_READY status and regulatory fields for immutable PDFs
-- ====================================================

-- Add PDF_READY to document_status enum
DO $$
BEGIN
  -- Check if PDF_READY already exists in the constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE constraint_name = 'documents_document_status_check'
    AND table_name = 'documents'
  ) THEN
    -- Drop old constraint if exists
    ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_document_status_check;
    
    -- Add new constraint with PDF_READY
    ALTER TABLE public.documents ADD CONSTRAINT documents_document_status_check 
      CHECK (document_status IN ('draft', 'final', 'cancelled', 'voided', 'pdf_ready'));
  END IF;
END $$;

-- Add PDF-related fields if they don't exist
DO $$
BEGIN
  -- pdf_storage_key - immutable storage path
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'documents' 
    AND column_name = 'pdf_storage_key'
  ) THEN
    ALTER TABLE public.documents
    ADD COLUMN pdf_storage_key TEXT;
    
    COMMENT ON COLUMN public.documents.pdf_storage_key IS 'Immutable storage path: documents/{documentId}/source.pdf';
  END IF;

  -- pdf_generated_at - timestamp when PDF was generated
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'documents' 
    AND column_name = 'pdf_generated_at'
  ) THEN
    ALTER TABLE public.documents
    ADD COLUMN pdf_generated_at TIMESTAMPTZ;
    
    COMMENT ON COLUMN public.documents.pdf_generated_at IS 'Timestamp when PDF was generated (immutable after FINALIZED)';
  END IF;

  -- pdf_sha256 - checksum for integrity verification
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'documents' 
    AND column_name = 'pdf_sha256'
  ) THEN
    ALTER TABLE public.documents
    ADD COLUMN pdf_sha256 TEXT;
    
    COMMENT ON COLUMN public.documents.pdf_sha256 IS 'SHA256 checksum of PDF for integrity verification';
  END IF;

  -- template_version_id - snapshot of template used
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'documents' 
    AND column_name = 'template_version_id'
  ) THEN
    ALTER TABLE public.documents
    ADD COLUMN template_version_id UUID REFERENCES public.templates(id);
    
    COMMENT ON COLUMN public.documents.template_version_id IS 'Snapshot of template ID used when document was finalized';
  END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_documents_pdf_storage_key 
  ON public.documents(pdf_storage_key) 
  WHERE pdf_storage_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_pdf_ready 
  ON public.documents(document_status) 
  WHERE document_status = 'pdf_ready';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ PDF status and fields added successfully!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Next: Update Supabase Storage bucket to allow application/pdf';
END $$;

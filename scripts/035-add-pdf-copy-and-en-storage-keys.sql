-- Add storage keys for immutable copy/en PDFs for reporting exports
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS pdf_storage_key_he_copy TEXT,
  ADD COLUMN IF NOT EXISTS pdf_storage_key_en TEXT;

COMMENT ON COLUMN public.documents.pdf_storage_key_he_copy IS
  'Immutable storage path for Hebrew faithful copy PDF: documents/{documentId}/copy.he.pdf';
COMMENT ON COLUMN public.documents.pdf_storage_key_en IS
  'Immutable storage path for English PDF: documents/{documentId}/source.en.pdf';

CREATE INDEX IF NOT EXISTS idx_documents_pdf_storage_key_he_copy
  ON public.documents(pdf_storage_key_he_copy)
  WHERE pdf_storage_key_he_copy IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_pdf_storage_key_en
  ON public.documents(pdf_storage_key_en)
  WHERE pdf_storage_key_en IS NOT NULL;

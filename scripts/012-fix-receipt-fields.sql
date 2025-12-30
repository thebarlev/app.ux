-- =====================================================
-- 012 - FIX RECEIPT FIELDS - Complete Data Flow
-- =====================================================
-- Date: December 29, 2025
-- Purpose: Ensure all user-entered fields are saved and displayed

-- Add customer contact fields directly to documents table
-- (so they work even when customer_id is null)
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone TEXT,
  ADD COLUMN IF NOT EXISTS customer_mobile TEXT,
  ADD COLUMN IF NOT EXISTS customer_address TEXT;

COMMENT ON COLUMN public.documents.customer_email IS 'Customer email (inline, works without customer_id)';
COMMENT ON COLUMN public.documents.customer_phone IS 'Customer phone (inline, works without customer_id)';
COMMENT ON COLUMN public.documents.customer_mobile IS 'Customer mobile (inline, works without customer_id)';
COMMENT ON COLUMN public.documents.customer_address IS 'Customer address (inline, works without customer_id)';

-- Add payment banking details to line items
ALTER TABLE public.document_line_items
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS branch TEXT,
  ADD COLUMN IF NOT EXISTS account_number TEXT;

COMMENT ON COLUMN public.document_line_items.bank_name IS 'Bank name for payment';
COMMENT ON COLUMN public.document_line_items.branch IS 'Bank branch number';
COMMENT ON COLUMN public.document_line_items.account_number IS 'Bank account number';

-- Create indexes for search optimization
CREATE INDEX IF NOT EXISTS idx_documents_customer_email ON public.documents(customer_email);
CREATE INDEX IF NOT EXISTS idx_line_items_bank_name ON public.document_line_items(bank_name);

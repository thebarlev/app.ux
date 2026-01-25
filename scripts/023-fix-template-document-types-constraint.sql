-- ====================================================
-- Fix template_document_types constraint
-- ====================================================
-- Date: January 25, 2026
-- Purpose: Add missing document types (invoice_receipt, credit_note) to template_document_types constraint
-- ====================================================

-- Update template_document_types.document_type constraint to include all document types
ALTER TABLE public.template_document_types
  DROP CONSTRAINT IF EXISTS template_document_types_document_type_check;

ALTER TABLE public.template_document_types
  ADD CONSTRAINT template_document_types_document_type_check
  CHECK (document_type IN (
    'receipt',
    'invoice',
    'tax_invoice',
    'invoice_receipt',       -- ✅ Added
    'credit_note',           -- ✅ Added
    'quote',
    'proforma',
    'work_order',
    'delivery_note',
    'return_note',
    'purchase_order',
    'self_invoice',
    'self_credit_note',
    'credit_invoice',
    'transaction_invoice'
  ));

-- Success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ template_document_types constraint fixed!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Added invoice_receipt and credit_note to allowed document types';
END $$;

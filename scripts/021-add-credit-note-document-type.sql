-- ====================================================
-- Add credit_note to document_type constraints
-- ====================================================
-- Date: January 25, 2026
-- Purpose: Allow credit_note for documents + document_sequences
-- ====================================================

-- 1) documents.document_type constraint
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_document_type_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_document_type_check
  CHECK (document_type IN (
    'tax_invoice',
    'invoice_receipt',
    'receipt',
    'quote',
    'delivery_note',
    'credit_invoice',
    'credit_note'
  ));

-- 2) document_sequences.document_type constraint
ALTER TABLE public.document_sequences
  DROP CONSTRAINT IF EXISTS document_sequences_document_type_check;

ALTER TABLE public.document_sequences
  ADD CONSTRAINT document_sequences_document_type_check
  CHECK (document_type IN (
    'tax_invoice',
    'invoice_receipt',
    'receipt',
    'quote',
    'delivery_note',
    'credit_invoice',
    'credit_note'
  ));

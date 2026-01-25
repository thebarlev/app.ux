-- ====================================================
-- Add business document types to constraints
-- ====================================================
-- Date: January 25, 2026
-- Purpose: Allow business document types in documents, sequences, templates, and selections
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
    'proforma',
    'work_order',
    'delivery_note',
    'return_note',
    'purchase_order',
    'self_invoice',
    'self_credit_note',
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
    'proforma',
    'work_order',
    'delivery_note',
    'return_note',
    'purchase_order',
    'self_invoice',
    'self_credit_note',
    'credit_invoice',
    'credit_note'
  ));

-- 3) templates.document_type constraint
ALTER TABLE public.templates
  DROP CONSTRAINT IF EXISTS templates_document_type_check;

ALTER TABLE public.templates
  ADD CONSTRAINT templates_document_type_check
  CHECK (document_type IN (
    'receipt',
    'invoice',
    'quote',
    'proforma',
    'work_order',
    'delivery_note',
    'return_note',
    'purchase_order',
    'self_invoice',
    'self_credit_note',
    'credit_invoice'
  ));

-- 4) template_document_types.document_type constraint
ALTER TABLE public.template_document_types
  DROP CONSTRAINT IF EXISTS template_document_types_document_type_check;

ALTER TABLE public.template_document_types
  ADD CONSTRAINT template_document_types_document_type_check
  CHECK (document_type IN (
    'receipt',
    'invoice',
    'tax_invoice',
    'invoice_receipt',     -- ✅ Added: חשבונית מס/קבלה
    'credit_note',         -- ✅ Added: חשבונית זיכוי
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

-- 5) company_template_selections.document_type constraint
ALTER TABLE public.company_template_selections
  DROP CONSTRAINT IF EXISTS company_template_selections_document_type_check;

ALTER TABLE public.company_template_selections
  ADD CONSTRAINT company_template_selections_document_type_check
  CHECK (document_type IN (
    'receipt',
    'invoice',
    'tax_invoice',
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
-- ====================================================
-- Add business document types to constraints
-- ====================================================
-- Date: January 25, 2026
-- Purpose: Allow business document types in checks
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
    'proforma',
    'work_order',
    'delivery_note',
    'return_note',
    'purchase_order',
    'self_invoice',
    'self_credit_note',
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
    'proforma',
    'work_order',
    'delivery_note',
    'return_note',
    'purchase_order',
    'self_invoice',
    'self_credit_note',
    'credit_invoice',
    'credit_note'
  ));

-- 3) templates.document_type constraint (legacy)
ALTER TABLE public.templates
  DROP CONSTRAINT IF EXISTS templates_document_type_check;

ALTER TABLE public.templates
  ADD CONSTRAINT templates_document_type_check
  CHECK (document_type IN (
    'receipt',
    'invoice',
    'tax_invoice',
    'invoice_receipt',     -- ✅ Added
    'credit_note',         -- ✅ Added
    'quote',
    'proforma',
    'work_order',
    'delivery_note',
    'return_note',
    'purchase_order',
    'self_invoice',
    'self_credit_note',
    'credit_invoice'
  ));

-- 4) template_document_types.document_type constraint
ALTER TABLE public.template_document_types
  DROP CONSTRAINT IF EXISTS template_document_types_document_type_check;

ALTER TABLE public.template_document_types
  ADD CONSTRAINT template_document_types_document_type_check
  CHECK (document_type IN (
    'receipt',
    'invoice',
    'tax_invoice',
    'invoice_receipt',     -- ✅ Added: חשבונית מס/קבלה
    'credit_note',         -- ✅ Added: חשבונית זיכוי
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

-- 5) company_template_selections.document_type constraint
ALTER TABLE public.company_template_selections
  DROP CONSTRAINT IF EXISTS company_template_selections_document_type_check;

ALTER TABLE public.company_template_selections
  ADD CONSTRAINT company_template_selections_document_type_check
  CHECK (document_type IN (
    'receipt',
    'invoice',
    'tax_invoice',
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

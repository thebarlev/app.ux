-- =====================================================
-- Add accounting fields + reference_text to documents
-- =====================================================
-- Date: 2026-01-26
-- Purpose: UI organization (non-regulatory)
-- Notes:
-- - Adds new columns only (no changes to existing columns)
-- - Does NOT affect PDF/template generation
-- =====================================================

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS paid_amount decimal(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credited_amount decimal(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outstanding_balance decimal(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accounting_status text,
  ADD COLUMN IF NOT EXISTS reference_text varchar(500);

-- Helpful indexes for UI filtering/sorting (safe no-op if already exist)
CREATE INDEX IF NOT EXISTS idx_documents_accounting_status
  ON public.documents(company_id, accounting_status);


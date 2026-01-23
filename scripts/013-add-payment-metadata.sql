-- =====================================================
-- ADD PAYMENT METADATA JSONB COLUMN
-- =====================================================
-- This migration adds support for extended payment fields
-- that don't fit in the standard columns.
--
-- Run this after 012-fix-receipt-fields.sql
--
-- Date: 2026-01-01
-- Purpose: Support credit card, check, digital wallet payment details
-- =====================================================

-- Add payment_metadata column to store extended payment fields as JSONB
ALTER TABLE public.document_line_items
ADD COLUMN IF NOT EXISTS payment_metadata JSONB DEFAULT '{}'::jsonb;

-- Add index for querying payment metadata
CREATE INDEX IF NOT EXISTS idx_line_items_payment_metadata 
ON public.document_line_items USING gin (payment_metadata);

-- Add comment
COMMENT ON COLUMN public.document_line_items.payment_metadata IS 
'Extended payment fields (credit card, check, digital wallet details) stored as JSONB';

-- Example metadata structure:
-- {
--   "cardInstallments": 3,
--   "cardDealType": "payments",
--   "cardType": "visa",
--   "cardLastDigits": "1234",
--   "checkNumber": "12345678",
--   "checkBank": "הבנק הבינלאומי",
--   "payerAccount": "user@example.com",
--   "transactionReference": "TXN-2024-001"
-- }

-- Verify column was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'document_line_items' 
    AND column_name = 'payment_metadata'
  ) THEN
    RAISE NOTICE '✅ payment_metadata column added successfully';
  ELSE
    RAISE EXCEPTION '❌ Failed to add payment_metadata column';
  END IF;
END $$;

-- ====================================================
-- Fix: Templates Unique Constraint
-- ====================================================
-- Date: January 1, 2026
-- Purpose: Fix unique constraint to allow multiple non-default templates
--          but only ONE default template per (company_id, document_type)
-- ====================================================

-- Step 1: Drop the problematic constraint
ALTER TABLE public.templates
DROP CONSTRAINT IF EXISTS unique_default_per_company_type;

-- Step 2: Create a PARTIAL unique index (only for is_default = TRUE)
CREATE UNIQUE INDEX unique_default_per_company_type
ON public.templates (company_id, document_type)
WHERE is_default = TRUE;

COMMENT ON INDEX unique_default_per_company_type IS 
  'Ensures only ONE default template per (company_id, document_type). 
   Allows unlimited non-default templates. 
   Uses partial index to filter only is_default = TRUE rows.';

-- Verification Query
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'templates'
  AND indexname = 'unique_default_per_company_type';

-- Expected output:
-- indexname: unique_default_per_company_type
-- indexdef: CREATE UNIQUE INDEX unique_default_per_company_type ON public.templates USING btree (company_id, document_type) WHERE (is_default = true)

-- ====================================================
-- Test: Insert multiple non-default templates (should work)
-- ====================================================
/*
-- This should now work!
INSERT INTO templates (company_id, document_type, name, html_template, is_default)
VALUES 
  (NULL, 'receipt', 'Template 1', '<html>...</html>', FALSE),
  (NULL, 'receipt', 'Template 2', '<html>...</html>', FALSE),
  (NULL, 'receipt', 'Template 3', '<html>...</html>', FALSE);

-- This should work (only one default)
INSERT INTO templates (company_id, document_type, name, html_template, is_default)
VALUES (NULL, 'receipt', 'Default Template', '<html>...</html>', TRUE);

-- This should FAIL (duplicate default)
INSERT INTO templates (company_id, document_type, name, html_template, is_default)
VALUES (NULL, 'receipt', 'Another Default', '<html>...</html>', TRUE);
-- ERROR: duplicate key value violates unique constraint "unique_default_per_company_type"
*/

-- ====================================================
-- Summary
-- ====================================================
-- BEFORE: Could not create multiple templates with is_default = FALSE (blocked by constraint)
-- AFTER:  Unlimited non-default templates ✅
--         Only ONE default template per (company_id, document_type) ✅

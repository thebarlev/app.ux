-- ====================================================
-- Document Date Validation System
-- ====================================================
-- Date: January 4, 2026
-- Purpose: Enforce chronological order of document issue dates per type
-- ====================================================

-- =====================================================
-- 1. Add last_issue_date to document_sequences
-- =====================================================

ALTER TABLE public.document_sequences
  ADD COLUMN IF NOT EXISTS last_issue_date DATE;

COMMENT ON COLUMN public.document_sequences.last_issue_date IS 
  'Last issue_date used for a finalized document of this type. ' ||
  'Prevents backdating: new documents must have issue_date >= this value.';

-- =====================================================
-- 2. Populate existing last_issue_date from documents
-- =====================================================

-- For each (company_id, document_type), find the MAX issue_date
-- from finalized documents and update document_sequences
UPDATE public.document_sequences ds
SET last_issue_date = (
  SELECT MAX(d.issue_date)
  FROM public.documents d
  WHERE d.company_id = ds.company_id
    AND d.document_type = ds.document_type
    AND d.document_status = 'final'
)
WHERE EXISTS (
  SELECT 1 
  FROM public.documents d
  WHERE d.company_id = ds.company_id
    AND d.document_type = ds.document_type
    AND d.document_status = 'final'
);

-- =====================================================
-- 3. Trigger to update last_issue_date automatically
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_last_issue_date()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update when document is finalized
  IF NEW.document_status = 'final' AND 
     (TG_OP = 'INSERT' OR OLD.document_status != 'final') THEN
    
    -- Update the sequence's last_issue_date if this is newer
    UPDATE public.document_sequences
    SET last_issue_date = GREATEST(
      COALESCE(last_issue_date, '1900-01-01'::date),
      NEW.issue_date
    )
    WHERE company_id = NEW.company_id
      AND document_type = NEW.document_type;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_update_last_issue_date ON public.documents;

CREATE TRIGGER trg_update_last_issue_date
  AFTER INSERT OR UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_last_issue_date();

COMMENT ON TRIGGER trg_update_last_issue_date ON public.documents IS
  'Automatically updates document_sequences.last_issue_date when documents are finalized';

-- =====================================================
-- 4. Validation function for date selection
-- =====================================================

CREATE OR REPLACE FUNCTION public.validate_document_issue_date(
  p_company_id UUID,
  p_document_type TEXT,
  p_issue_date DATE
)
RETURNS TABLE (
  is_valid BOOLEAN,
  min_allowed_date DATE,
  error_message TEXT
) AS $$
DECLARE
  v_last_issue_date DATE;
BEGIN
  -- Get the last issue date for this document type
  SELECT last_issue_date INTO v_last_issue_date
  FROM public.document_sequences
  WHERE company_id = p_company_id
    AND document_type = p_document_type;

  -- If no sequence exists yet or no last_issue_date, any date is valid
  IF v_last_issue_date IS NULL THEN
    RETURN QUERY SELECT TRUE, NULL::DATE, NULL::TEXT;
    RETURN;
  END IF;

  -- Check if proposed date is valid (>= last issue date)
  IF p_issue_date >= v_last_issue_date THEN
    RETURN QUERY SELECT TRUE, v_last_issue_date, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT 
      FALSE,
      v_last_issue_date,
      FORMAT(
        'תאריך המסמך חייב להיות %s או מאוחר יותר. המסמך האחרון הונפק ב-%s.',
        TO_CHAR(v_last_issue_date, 'DD/MM/YYYY'),
        TO_CHAR(v_last_issue_date, 'DD/MM/YYYY')
      );
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.validate_document_issue_date IS
  'Validates that a proposed issue_date is not earlier than the last finalized document of the same type';

-- =====================================================
-- 5. Check constraint (optional - can cause issues with drafts)
-- =====================================================

-- NOTE: We do NOT add a database constraint because:
-- 1. Drafts are created first, then finalized
-- 2. Validation happens in application layer before finalization
-- 3. Constraint would block legitimate workflow

-- Instead, we enforce via:
-- - Application validation in server actions
-- - UI date picker restrictions
-- - Trigger maintains last_issue_date automatically

-- =====================================================
-- 6. Index for performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_documents_company_type_status_date 
  ON public.documents(company_id, document_type, document_status, issue_date DESC);

COMMENT ON INDEX idx_documents_company_type_status_date IS
  'Optimizes queries for finding last issue date per company and document type';

-- =====================================================
-- 7. Helper view for debugging
-- =====================================================

CREATE OR REPLACE VIEW public.vw_document_date_constraints AS
SELECT 
  c.company_name,
  ds.document_type,
  ds.last_issue_date,
  ds.current_number,
  ds.is_locked,
  COUNT(CASE WHEN d.document_status = 'final' THEN 1 END) as finalized_count,
  MAX(CASE WHEN d.document_status = 'final' THEN d.issue_date END) as actual_last_date
FROM public.document_sequences ds
JOIN public.companies c ON c.id = ds.company_id
LEFT JOIN public.documents d ON d.company_id = ds.company_id 
  AND d.document_type = ds.document_type
GROUP BY c.company_name, ds.document_type, ds.last_issue_date, ds.current_number, ds.is_locked
ORDER BY c.company_name, ds.document_type;

COMMENT ON VIEW public.vw_document_date_constraints IS
  'Debug view showing last issue dates and document counts per company/type';

-- =====================================================
-- End of migration
-- =====================================================

-- =====================================================
-- 009 - Receipt Footer Setting and Document Immutability
-- =====================================================

-- Add receipt_footer_text to global_settings
INSERT INTO global_settings (setting_key, setting_value) 
VALUES ('receipt_footer_text', '')
ON CONFLICT (setting_key) DO NOTHING;

-- Update documents RLS policies to strictly enforce immutability
-- Final documents CANNOT be updated (except to void/cancel)
drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents
  for update
  using (
    company_id in (select public.user_company_ids())
  )
  with check (
    company_id in (select public.user_company_ids())
    and (
      -- Only drafts can be freely edited
      document_status = 'draft'
      -- OR we're changing status from final to voided/cancelled (admin action)
      or (document_status in ('final') and NEW.document_status in ('voided', 'cancelled'))
    )
  );

-- Ensure final documents cannot be deleted (only drafts)
drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents
  for delete
  using (
    company_id in (select public.user_company_ids())
    and document_status = 'draft'
  );

-- Add trigger to enforce document immutability at database level
CREATE OR REPLACE FUNCTION enforce_document_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- If document is final and we're not changing to voided/cancelled
  IF OLD.document_status = 'final' 
     AND NEW.document_status NOT IN ('voided', 'cancelled') 
     AND (
       OLD.customer_name IS DISTINCT FROM NEW.customer_name
       OR OLD.total_amount IS DISTINCT FROM NEW.total_amount
       OR OLD.issue_date IS DISTINCT FROM NEW.issue_date
       OR OLD.document_number IS DISTINCT FROM NEW.document_number
     ) THEN
    RAISE EXCEPTION 'Cannot modify final documents. Document ID: %', OLD.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enforce_document_immutability ON public.documents;
CREATE TRIGGER trigger_enforce_document_immutability
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION enforce_document_immutability();

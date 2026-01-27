-- =====================================================
-- 044 - Allow closing finalized documents (non-tax)
-- =====================================================
-- Purpose:
-- Allow updating document_status from 'final' to 'cancelled'
-- (with a required cancellation_reason), while keeping immutability
-- for other fields. This supports user-driven "close" actions.

-- 1) Update/update policy to allow final -> cancelled/voided
drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents
  for update
  using (
    company_id in (select public.user_company_ids())
  )
  with check (
    company_id in (select public.user_company_ids())
    and document_status in ('draft', 'final', 'cancelled', 'voided', 'pdf_ready')
  );

-- 2) Replace immutability trigger to allow close for non-tax
create or replace function public.enforce_document_immutability()
returns trigger as $$
begin
  if old.document_status = 'final' then
    -- Reject changes to non-accounting fields
    if
      (new.customer_id is distinct from old.customer_id)
      or (new.customer_name is distinct from old.customer_name)
      or (new.issue_date is distinct from old.issue_date)
      or (new.payment_due_date is distinct from old.payment_due_date)
      or (new.document_description is distinct from old.document_description)
      or (new.total_amount is distinct from old.total_amount)
      or (new.currency is distinct from old.currency)
      or (new.subtotal is distinct from old.subtotal)
      or (new.vat_rate is distinct from old.vat_rate)
      or (new.vat_amount is distinct from old.vat_amount)
      or (new.internal_notes is distinct from old.internal_notes)
      or (new.customer_notes is distinct from old.customer_notes)
    then
      raise exception 'Finalized documents can only update accounting fields';
    end if;

    -- Allow accounting/reference updates (even if values are unchanged)
    if new.document_status is not distinct from old.document_status then
      return new;
    end if;

    -- Tax invoices remain immutable via status changes
    if old.document_type = 'tax_invoice' then
      raise exception 'Tax invoices are immutable once finalized';
    end if;

    -- Allow close/void with a required cancellation_reason
    if new.document_status in ('cancelled', 'voided') then
      if new.cancellation_reason is null or new.cancellation_reason = '' then
        raise exception 'Cancellation reason is required';
      end if;
      return new;
    end if;

    -- If a close is attempted without status change, coerce to cancelled
    if new.cancellation_reason is not null and new.cancellation_reason <> '' then
      new.document_status := 'cancelled';
      return new;
    end if;

    -- Block any other update on finalized documents
    raise exception 'Finalized documents can only be cancelled or voided';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_document_immutability on public.documents;
drop trigger if exists trigger_enforce_document_immutability on public.documents;
create trigger trigger_enforce_document_immutability
  before update on public.documents
  for each row
  execute function public.enforce_document_immutability();

-- =====================================================
-- A final receipt is always fully settled
-- =====================================================
-- Date: 2026-07-27
--
-- Problem
-- -------
-- `recompute_document_accounting` (scripts/043-fix-conversion-logic.sql) has an
-- "always paid" branch for `invoice_receipt` but not for a plain `receipt`. A
-- receipt therefore falls through to the generic logic, which counts payment
-- links whose target_document_id is the receipt itself — normally none — and
-- reports it as 'open' with its full amount outstanding.
--
-- `finalizeDocument` does set paid_amount/accounting_status at INSERT time via
-- isAlwaysClosedDoc (lib/document-helpers.ts), but the trigger overwrites that
-- the first time any link touching the receipt changes.
--
-- Observed in production before this migration:
--     receipt#1000  document_status=final  total=500  paid=0  balance=500  accounting_status=open
--
-- A receipt records money received. It has no outstanding balance, ever.
--
-- Why it matters now
-- ------------------
-- Chained receipts are being corrected to target their source invoice (so the
-- invoice settles). That removes the incidental payment link that was pointing
-- at the receipt and was the only reason receipts looked 'paid' at all — so
-- without this migration, correcting the link direction would close the invoice
-- and open the receipt.
--
-- Scope
-- -----
-- Adds `receipt` to the existing branch. Nothing else in the function changes:
-- the conversion branch and the generic payment/credit logic are byte-identical
-- to 043.
--
-- Rollback
-- --------
-- Re-run scripts/043-fix-conversion-logic.sql, which restores the prior
-- definition of this function verbatim.
--
-- Before running, capture the live definition for the record:
--     select pg_get_functiondef('public.recompute_document_accounting(uuid)'::regprocedure);
-- =====================================================

create or replace function public.recompute_document_accounting(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  doc_record record;
  has_conversion boolean;
  target_type text;
  total_paid numeric(12,2);
  total_credited numeric(12,2);
  new_status text;
  doc_total numeric(12,2);
begin
  select *
    into doc_record
  from public.documents
  where id = p_document_id;

  if not found then
    return;
  end if;

  doc_total := coalesce(doc_record.total_amount::numeric(12,2), 0);

  -- CHANGED: 'receipt' added alongside 'invoice_receipt'.
  -- Both record money received and are settled the moment they are issued.
  if doc_record.document_type in ('invoice_receipt', 'receipt')
     and doc_record.document_status = 'final' then
    update public.documents
    set
      accounting_status = 'paid',
      paid_amount = doc_total,
      credited_amount = 0,
      outstanding_balance = 0
    where id = p_document_id;
    return;
  end if;

  -- Conversion: when this document is the SOURCE of a conversion link,
  -- it should become 'converted' (or 'paid' if converted to invoice_receipt).
  select exists(
    select 1
    from public.document_links
    where source_document_id = p_document_id
      and link_type = 'conversion'
  )
  into has_conversion;

  if has_conversion then
    select d.document_type
      into target_type
    from public.document_links dl
    join public.documents d on d.id = dl.target_document_id
    where dl.source_document_id = p_document_id
      and dl.link_type = 'conversion'
    order by dl.created_at desc
    limit 1;

    new_status := case
      when target_type = 'invoice_receipt' then 'paid'
      else 'converted'
    end;

    update public.documents
    set
      accounting_status = new_status,
      paid_amount = doc_total,
      credited_amount = 0,
      outstanding_balance = 0
    where id = p_document_id;
    return;
  end if;

  -- Regular logic (target of payments/credits/cancellations)
  select coalesce(sum(amount), 0)::numeric(12,2)
    into total_paid
  from public.document_links
  where target_document_id = p_document_id
    and link_type = 'payment';

  select coalesce(sum(amount), 0)::numeric(12,2)
    into total_credited
  from public.document_links
  where target_document_id = p_document_id
    and link_type in ('credit','cancellation');

  new_status := case
    when total_paid + total_credited >= doc_total and doc_total > 0 then 'paid'
    when doc_total = 0 and doc_record.document_status = 'final' then 'paid'
    when total_paid > 0 then 'partially_paid'
    when total_credited > 0 then 'credited'
    else 'open'
  end;

  update public.documents
  set
    paid_amount = total_paid,
    credited_amount = total_credited,
    outstanding_balance = (doc_total - total_paid - total_credited)::numeric(12,2),
    accounting_status = new_status
  where id = p_document_id;
end;
$$;

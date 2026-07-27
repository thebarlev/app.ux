-- =====================================================
-- A superseded document closes only when it is FULLY accounted for
-- =====================================================
-- Date: 2026-07-27
--
-- Problem
-- -------
-- The conversion branch of `recompute_document_accounting`
-- (scripts/043-fix-conversion-logic.sql) closes the source on the mere EXISTENCE
-- of a conversion link, ignoring amounts:
--
--     if has_conversion then
--       update documents set accounting_status = 'converted',
--                            paid_amount = doc_total,
--                            outstanding_balance = 0 ...
--
-- So issuing a ₪100 tax invoice against a ₪700 חשבון עסקה marked the demand
-- fully handled, leaving ₪600 that will never be invoiced and no trace that
-- anything is outstanding. Observed in production:
--
--     proforma#1002  total 700  <- tax_invoice#101  total 100  -> converted, balance 0
--     proforma#1001  total 500  <- tax_invoice#100  total  50  -> converted, balance 0
--
-- This is the same class of error as capping receipts against a document's total
-- instead of its remaining balance: a per-document check where a cumulative one
-- is required.
--
-- Fix
-- ---
-- Sum the conversion links and compare against the source's total, mirroring how
-- the payment branch already treats receipts:
--   sum >= total  -> 'converted' (or 'paid' when superseded by an invoice-receipt)
--   0 < sum < total -> 'partially_paid', balance = total - sum
--   sum = 0        -> 'open', full balance
-- Several partial invoices that together cover the demand close it.
--
-- Depends on the application writing the chained document's total into
-- document_links.amount for conversion links. Links created before that change
-- carry amount 0, so they sum to 0 and their source reopens with its full
-- balance — which is the correct state for the two production rows above, and is
-- exactly the historical repair wanted. Recomputation is not automatic: the
-- trigger fires on link changes, so affected documents must be recomputed
-- explicitly (see the note at the end).
--
-- Rollback
-- --------
-- Re-run scripts/043-fix-conversion-logic.sql, then scripts/110-receipt-always-paid.sql
-- (110 must come last: it also redefines this function).
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
  total_converted numeric(12,2);
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

  -- From scripts/110: a receipt and an invoice-receipt are settled on issue.
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

  -- Conversion: this document is the SOURCE of one or more conversion links.
  select exists(
    select 1
    from public.document_links
    where source_document_id = p_document_id
      and link_type = 'conversion'
  )
  into has_conversion;

  if has_conversion then
    -- CHANGED: how much of this document has actually been superseded.
    select coalesce(sum(amount), 0)::numeric(12,2)
      into total_converted
    from public.document_links
    where source_document_id = p_document_id
      and link_type = 'conversion';

    select d.document_type
      into target_type
    from public.document_links dl
    join public.documents d on d.id = dl.target_document_id
    where dl.source_document_id = p_document_id
      and dl.link_type = 'conversion'
    order by dl.created_at desc
    limit 1;

    -- CHANGED: close only when fully accounted for; otherwise keep the remainder
    -- visible so the rest can still be invoiced.
    if total_converted >= doc_total and doc_total > 0 then
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
    else
      update public.documents
      set
        accounting_status = case when total_converted > 0 then 'partially_paid' else 'open' end,
        paid_amount = total_converted,
        credited_amount = 0,
        outstanding_balance = (doc_total - total_converted)::numeric(12,2)
      where id = p_document_id;
    end if;
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

-- After deploying this, the two wrongly-closed documents are repaired by a
-- recompute. Run ONLY after the function above is in place:
--
--   select public.recompute_document_accounting('<proforma#1002 id>'::uuid);
--   select public.recompute_document_accounting('<proforma#1001 id>'::uuid);

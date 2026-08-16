-- ההגדרה החיה של public.recompute_document_accounting(uuid)
-- נמדדה 16.8.2026 מפרויקט Supabase hpvomklpmblxhejehiyq
-- באמצעות: select pg_get_functiondef('public.recompute_document_accounting(uuid)'::regprocedure);
--
-- ⚠️ הטקסט הזה עבר דרך הצ'אט. לפני שמשתמשים בו כבסיס:
--    1. הרץ diff מולו לבין scripts/111-conversion-amount-aware.sql
--    2. אם הם זהים — הריפו נאמן, והבסיס מאושר משני מקורות בלתי תלויים
--    3. אם יש הפרש — עצור ודווח. אל תבנה.

CREATE OR REPLACE FUNCTION public.recompute_document_accounting(p_document_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

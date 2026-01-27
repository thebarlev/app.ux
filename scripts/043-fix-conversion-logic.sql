-- =====================================================
-- Fix conversion accounting status logic
-- =====================================================
-- Date: 2026-01-26
-- Purpose:
-- - Add 'converted' accounting_status value
-- - Mark source documents as converted/paid when conversion links exist
-- - Ensure invoice_receipt is always 'paid' when created as final
-- - Ensure link triggers recompute BOTH source + target
-- =====================================================

-- 0) Normalize legacy spelling (if any)
update public.documents
set accounting_status = 'canceled'
where accounting_status = 'cancelled';

-- 1) Add accounting_status check constraint (allows NULL)
alter table public.documents drop constraint if exists documents_accounting_status_check;
alter table public.documents add constraint documents_accounting_status_check
  check (accounting_status in ('open','partially_paid','paid','converted','credited','canceled'));

-- 2) Update recompute function to handle conversions
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

  -- invoice_receipt is always paid when final
  if doc_record.document_type = 'invoice_receipt' and doc_record.document_status = 'final' then
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

-- 3) invoice_receipt always paid on INSERT when created as final
create or replace function public.set_invoice_receipt_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.document_type = 'invoice_receipt' and new.document_status = 'final' then
    new.accounting_status := 'paid';
    new.paid_amount := coalesce(new.total_amount, 0);
    new.credited_amount := 0;
    new.outstanding_balance := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists before_invoice_receipt_insert on public.documents;
create trigger before_invoice_receipt_insert
before insert on public.documents
for each row execute function public.set_invoice_receipt_paid();

-- 4) Recompute on link changes: BOTH source + target (needed for conversions)
create or replace function public.on_document_links_change_recompute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    perform public.recompute_document_accounting(new.target_document_id);
    perform public.recompute_document_accounting(new.source_document_id);
    return new;
  elsif (tg_op = 'UPDATE') then
    if old.target_document_id is distinct from new.target_document_id then
      perform public.recompute_document_accounting(old.target_document_id);
    end if;
    if old.source_document_id is distinct from new.source_document_id then
      perform public.recompute_document_accounting(old.source_document_id);
    end if;
    perform public.recompute_document_accounting(new.target_document_id);
    perform public.recompute_document_accounting(new.source_document_id);
    return new;
  elsif (tg_op = 'DELETE') then
    perform public.recompute_document_accounting(old.target_document_id);
    perform public.recompute_document_accounting(old.source_document_id);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_document_links_recompute on public.document_links;
create trigger trg_document_links_recompute
after insert or update or delete on public.document_links
for each row
execute function public.on_document_links_change_recompute();


-- =====================================================
-- Document links: integrity + accounting recompute
-- =====================================================
-- Date: 2026-01-26
-- Purpose:
-- - Keep `documents` accounting fields updated automatically for UI
-- - Enforce link integrity (company_id must match both documents)
-- Notes:
-- - Does not change document issuance / immutability / PDF logic
-- =====================================================

-- 1) Integrity: ensure company_id matches both source/target documents
create or replace function public.enforce_document_links_company_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_company uuid;
  v_target_company uuid;
begin
  select d.company_id into v_source_company
  from public.documents d
  where d.id = new.source_document_id;

  select d.company_id into v_target_company
  from public.documents d
  where d.id = new.target_document_id;

  if v_source_company is null or v_target_company is null then
    raise exception 'document_links: source/target document not found';
  end if;

  if new.company_id is null then
    raise exception 'document_links: company_id is required';
  end if;

  if new.company_id <> v_source_company or new.company_id <> v_target_company then
    raise exception 'document_links: company_id mismatch with linked documents';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_document_links_company_integrity on public.document_links;
create trigger trg_document_links_company_integrity
before insert or update on public.document_links
for each row
execute function public.enforce_document_links_company_integrity();

-- 2) Recompute: update documents.* accounting fields for UI
create or replace function public.recompute_document_accounting(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric(12,2);
  v_paid numeric(12,2);
  v_credited numeric(12,2);
  v_balance numeric(12,2);
  v_doc_status text;
begin
  -- If document doesn't exist, no-op
  select d.total_amount::numeric(12,2), d.document_status
    into v_total, v_doc_status
  from public.documents d
  where d.id = p_document_id;

  if not found then
    return;
  end if;

  v_total := coalesce(v_total, 0);

  select coalesce(sum(dl.amount), 0)::numeric(12,2)
    into v_paid
  from public.document_links dl
  where dl.target_document_id = p_document_id
    and dl.link_type = 'payment';

  select coalesce(sum(dl.amount), 0)::numeric(12,2)
    into v_credited
  from public.document_links dl
  where dl.target_document_id = p_document_id
    and dl.link_type in ('credit','cancellation');

  v_balance := (v_total - v_paid - v_credited)::numeric(12,2);

  update public.documents
  set
    paid_amount = v_paid,
    credited_amount = v_credited,
    outstanding_balance = v_balance,
    accounting_status =
      case
        when v_doc_status is distinct from 'final' then v_doc_status
        when v_total = 0 then 'paid'
        when v_credited >= v_total then 'cancelled'
        when v_balance <= 0 then 'paid'
        when v_paid > 0 then 'partially_paid'
        else 'open'
      end
  where id = p_document_id;
end;
$$;

-- 3) Trigger: recompute on any link change
create or replace function public.on_document_links_change_recompute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    perform public.recompute_document_accounting(new.target_document_id);
    return new;
  elsif (tg_op = 'UPDATE') then
    -- recompute both old and new targets in case target changed
    if old.target_document_id is distinct from new.target_document_id then
      perform public.recompute_document_accounting(old.target_document_id);
    end if;
    perform public.recompute_document_accounting(new.target_document_id);
    return new;
  elsif (tg_op = 'DELETE') then
    perform public.recompute_document_accounting(old.target_document_id);
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


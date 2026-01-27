-- =====================================================
-- Document links: reference_text generation
-- =====================================================
-- Date: 2026-01-26
-- Purpose: Generate a dynamic reference_text for UI organization
-- Notes:
-- - Writes reference_text ONLY when empty (allows manual override)
-- - Does not touch PDF/template engine
-- =====================================================

create or replace function public.document_type_label_he(p_type text)
returns text
language sql
stable
as $$
  select case p_type
    when 'tax_invoice' then 'חשבונית מס'
    when 'invoice_receipt' then 'חשבונית מס/קבלה'
    when 'receipt' then 'קבלה'
    when 'credit_note' then 'חשבונית זיכוי'
    when 'quote' then 'הצעת מחיר'
    when 'proforma' then 'חשבון עסקה'
    when 'work_order' then 'הזמנת עבודה'
    when 'delivery_note' then 'תעודת משלוח'
    when 'return_note' then 'תעודת החזרה'
    when 'purchase_order' then 'הזמנת רכש'
    when 'self_invoice' then 'חשבונית עצמית'
    when 'self_credit_note' then 'חשבונית זיכוי עצמית'
    else coalesce(p_type, '')
  end;
$$;

create or replace function public.generate_reference_text(
  p_target_type text,
  p_source_type text,
  p_source_number text,
  p_link_type text
)
returns text
language plpgsql
stable
as $$
declare
  v_source_label text;
begin
  v_source_label := public.document_type_label_he(p_source_type);

  -- Payment links usually end at a receipt-like document
  if p_link_type = 'payment' then
    return format('תשלום עבור %s מספר %s', v_source_label, coalesce(p_source_number,''));
  end if;

  if p_link_type in ('credit','cancellation') then
    return format('זיכוי עבור %s מספר %s', v_source_label, coalesce(p_source_number,''));
  end if;

  if p_link_type = 'conversion' then
    -- Example: invoice for proforma
    return format('%s עבור %s מספר %s',
      public.document_type_label_he(p_target_type),
      v_source_label,
      coalesce(p_source_number,'')
    );
  end if;

  -- Fallback
  return format('%s עבור %s מספר %s',
    public.document_type_label_he(p_target_type),
    v_source_label,
    coalesce(p_source_number,'')
  );
end;
$$;

create or replace function public.on_document_links_set_reference_text()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_type text;
  v_source_number text;
  v_target_type text;
  v_text text;
begin
  if tg_op not in ('INSERT','UPDATE') then
    return null;
  end if;

  select d.document_type, d.document_number
    into v_source_type, v_source_number
  from public.documents d
  where d.id = new.source_document_id;

  select d.document_type
    into v_target_type
  from public.documents d
  where d.id = new.target_document_id;

  v_text := public.generate_reference_text(v_target_type, v_source_type, v_source_number, new.link_type);

  update public.documents
  set reference_text = v_text
  where id = new.target_document_id
    and (reference_text is null or btrim(reference_text) = '');

  return new;
end;
$$;

drop trigger if exists trg_document_links_reference_text on public.document_links;
create trigger trg_document_links_reference_text
after insert or update on public.document_links
for each row
execute function public.on_document_links_set_reference_text();


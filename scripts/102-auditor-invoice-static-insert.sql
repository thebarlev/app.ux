-- ====================================================
-- 102 - Fix: use static INSERT (like issue_paid_checkout_document_service)
-- ====================================================
-- Matches the working pattern from 068 - no dynamic column building.
-- ====================================================

begin;

create or replace function public.issue_auditor_charge_invoice_receipt_service_impl(
  p_auditor_charge_id uuid,
  p_issuer_company_id uuid
)
returns table (
  ret_ok boolean,
  ret_document_id uuid,
  ret_document_number text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_charge public.auditor_subscription_charges%rowtype;
  v_company_name text;
  v_company_tax_id text;
  v_plan_name text;

  v_existing_doc_id uuid;
  v_existing_doc_number text;

  v_seq record;
  v_next_number integer;
  v_prefix text;
  v_doc_number text;
  v_doc_id uuid;

  v_total numeric;
  v_subtotal numeric;
  v_vat_rate numeric := 18;
  v_vat_amount numeric;
begin
  if p_auditor_charge_id is null or p_issuer_company_id is null then
    raise exception 'missing_params';
  end if;

  v_role := null;
  begin
    v_role := auth.role();
  exception when undefined_function then
    v_role := null;
  end;

  if v_role is null then
    begin
      v_role := (current_setting('request.jwt.claims', true)::jsonb ->> 'role');
    exception when others then
      v_role := null;
    end;
  end if;

  if v_role is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('issue_auditor_charge_invoice_receipt_service_impl:' || p_auditor_charge_id::text, 0));

  select * into v_charge
  from public.auditor_subscription_charges
  where id = p_auditor_charge_id
  for update;

  if not found then
    return query select false::boolean, null::uuid, null::text;
    return;
  end if;

  if v_charge.status is distinct from 'succeeded' then
    return query select false::boolean, null::uuid, null::text;
    return;
  end if;

  if v_charge.issued_invoice_id is not null then
    select d.document_number into v_existing_doc_number
    from public.documents d
    where d.id = v_charge.issued_invoice_id;
    return query select true, v_charge.issued_invoice_id, v_existing_doc_number;
    return;
  end if;

  select d.id, d.document_number into v_existing_doc_id, v_existing_doc_number
  from public.documents d
  where d.reference_text = ('auditor_charge:' || p_auditor_charge_id::text)
  limit 1;

  if v_existing_doc_id is not null then
    update public.auditor_subscription_charges
    set issued_invoice_id = v_existing_doc_id
    where id = p_auditor_charge_id;
    return query select true, v_existing_doc_id, v_existing_doc_number;
    return;
  end if;

  select c.company_name, coalesce(c.registration_number, c.tax_id)
    into v_company_name, v_company_tax_id
  from public.companies c
  where c.id = v_charge.company_id;
  if v_company_name is null then v_company_name := 'לקוח'; end if;

  select p.name into v_plan_name
  from public.auditor_plans p
  where p.id = v_charge.plan_id;
  if v_plan_name is null then v_plan_name := v_charge.plan_id; end if;

  if to_regclass('public.document_sequences') is not null then
    insert into public.document_sequences (company_id, document_type, prefix, starting_number, current_number, is_locked, locked_at)
    values (p_issuer_company_id, 'invoice_receipt', '', 1000, 999, true, now())
    on conflict (company_id, document_type) do nothing;

    select * into v_seq
    from public.document_sequences
    where company_id = p_issuer_company_id and document_type = 'invoice_receipt'
    for update;

    if not found then
      raise exception 'sequence_missing_for_invoice_receipt';
    end if;

    if v_seq.is_locked is distinct from true then
      update public.document_sequences set is_locked = true, locked_at = now() where id = v_seq.id;
    end if;

    if coalesce(v_seq.starting_number, 0) < 1000 then
      update public.document_sequences set starting_number = 1000 where id = v_seq.id;
      v_seq.starting_number := 1000;
    end if;

    v_next_number := greatest(coalesce(v_seq.current_number, 0) + 1, coalesce(v_seq.starting_number, 1000), 1000);
    v_prefix := coalesce(v_seq.prefix, '');
    update public.document_sequences set current_number = v_next_number, updated_at = now() where id = v_seq.id;
    v_doc_number := v_prefix || v_next_number::text;
  else
    v_doc_number := left(replace(p_auditor_charge_id::text, '-', ''), 12);
  end if;

  v_total := coalesce(v_charge.amount, 0);
  v_subtotal := round((v_total / (1 + (v_vat_rate / 100)))::numeric, 2);
  v_vat_amount := round((v_total - v_subtotal)::numeric, 2);

  -- Static INSERT for documents (matches 068 pattern - columns that exist in evolved schema)
  insert into public.documents (
    company_id,
    document_type,
    document_status,
    document_number,
    issue_date,
    amount,
    total_amount,
    subtotal,
    vat_rate,
    vat_amount,
    currency,
    customer_name,
    customer_tax_id,
    reference_text,
    accounting_status,
    paid_amount,
    credited_amount,
    outstanding_balance,
    finalized_at,
    finalized_by
  )
  values (
    v_charge.company_id,
    'invoice_receipt',
    'draft',
    v_doc_number,
    current_date,
    v_total,
    v_total,
    v_subtotal,
    v_vat_rate,
    v_vat_amount,
    coalesce(v_charge.currency, 'ILS'),
    v_company_name,
    v_company_tax_id,
    'auditor_charge:' || p_auditor_charge_id::text,
    'paid',
    v_total,
    0,
    0,
    null,
    null
  )
  returning id into v_doc_id;

  -- Static INSERT for document_line_items (7 base columns - 006 schema)
  insert into public.document_line_items (
    document_id,
    company_id,
    line_number,
    description,
    unit_price,
    quantity,
    line_total
  )
  values (
    v_doc_id,
    v_charge.company_id,
    1,
    'מנוי /auditor – ' || v_plan_name,
    v_total,
    1,
    v_total
  );

  -- Finalize
  update public.documents
  set document_status = 'final', finalized_at = now()
  where id = v_doc_id;

  update public.auditor_subscription_charges set issued_invoice_id = v_doc_id where id = p_auditor_charge_id;

  if to_regclass('public.auditor_invoice_documents') is not null then
    insert into public.auditor_invoice_documents (document_id, issuer_company_id, buyer_company_id, charge_id)
    values (v_doc_id, p_issuer_company_id, v_charge.company_id, p_auditor_charge_id)
    on conflict (document_id) do nothing;
  end if;

  select d.document_number into v_existing_doc_number from public.documents d where d.id = v_doc_id;
  return query select true, v_doc_id, v_existing_doc_number;
  return;
end;
$$;

-- Wrapper: preserve original column names for API (ok, document_id, document_number)
create or replace function public.issue_auditor_charge_invoice_receipt_service(
  p_auditor_charge_id uuid,
  p_issuer_company_id uuid
)
returns table (
  ok boolean,
  document_id uuid,
  document_number text
)
language sql
security definer
set search_path = public
as $$
  select r.ret_ok as ok, r.ret_document_id as document_id, r.ret_document_number as document_number
  from public.issue_auditor_charge_invoice_receipt_service_impl(p_auditor_charge_id, p_issuer_company_id) r;
$$;

grant execute on function public.issue_auditor_charge_invoice_receipt_service_impl(uuid, uuid) to service_role;
revoke all on function public.issue_auditor_charge_invoice_receipt_service(uuid, uuid) from public;
revoke all on function public.issue_auditor_charge_invoice_receipt_service(uuid, uuid) from anon;
revoke all on function public.issue_auditor_charge_invoice_receipt_service(uuid, uuid) from authenticated;
grant execute on function public.issue_auditor_charge_invoice_receipt_service(uuid, uuid) to service_role;

commit;

select pg_notify('pgrst', 'reload schema');

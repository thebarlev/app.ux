-- ====================================================
-- 082 - Service-only issuance: auditor charge -> invoice_receipt
-- ====================================================
-- Purpose:
-- - Issue a compliant `invoice_receipt` in the existing accounting system
--   for a successful `/auditor` subscription charge
-- - Idempotent and concurrency-safe (advisory lock + reference_text lookup)
-- - Links the issued document back to `auditor_subscription_charges.issued_invoice_id`
-- Notes:
-- - Prices are inclusive of VAT (Israel) per product display; we store totals,
--   and compute subtotal/vat_amount when these columns exist.
-- ====================================================

begin;

create extension if not exists pgcrypto;

create or replace function public.issue_auditor_charge_invoice_receipt_service(
  p_auditor_charge_id uuid,
  p_issuer_company_id uuid
)
returns table (
  ok boolean,
  document_id uuid,
  document_number text
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

  v_status_col text;
  v_cols text[];
  v_vals text[];
  v_sql text;

  v_total numeric;
  v_subtotal numeric;
  v_vat_rate numeric := 18;
  v_vat_amount numeric;
begin
  if p_auditor_charge_id is null or p_issuer_company_id is null then
    raise exception 'missing_params';
  end if;

  -- Service-role only guard
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

  perform pg_advisory_xact_lock(hashtextextended('issue_auditor_charge_invoice_receipt_service:' || p_auditor_charge_id::text, 0));

  -- Load and lock charge row
  select *
    into v_charge
  from public.auditor_subscription_charges
  where id = p_auditor_charge_id
  for update;

  if not found then
    return query select false, null::uuid, null::text;
    return;
  end if;

  if v_charge.status is distinct from 'succeeded' then
    return query select false, null::uuid, null::text;
    return;
  end if;

  -- If already linked, return existing document
  if v_charge.issued_invoice_id is not null then
    select d.document_number into v_existing_doc_number
    from public.documents d
    where d.id = v_charge.issued_invoice_id;

    return query select true, v_charge.issued_invoice_id, v_existing_doc_number;
    return;
  end if;

  -- Idempotency: if document exists by reference_text, reuse it
  select d.id, d.document_number
    into v_existing_doc_id, v_existing_doc_number
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

  -- Buyer company display details
  select c.company_name, coalesce(c.registration_number, c.tax_id)
    into v_company_name, v_company_tax_id
  from public.companies c
  where c.id = v_charge.company_id;
  if v_company_name is null then v_company_name := 'לקוח'; end if;

  select p.name into v_plan_name
  from public.auditor_plans p
  where p.id = v_charge.plan_id;
  if v_plan_name is null then v_plan_name := v_charge.plan_id; end if;

  -- Determine which status column exists on documents
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='documents' and column_name='document_status'
  ) then
    v_status_col := 'document_status';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='documents' and column_name='status'
  ) then
    v_status_col := 'status';
  else
    v_status_col := null;
  end if;

  -- Ensure numbering series exists if document_sequences exists; otherwise fallback
  if to_regclass('public.document_sequences') is not null then
    insert into public.document_sequences (
      company_id, document_type, prefix, starting_number, current_number, is_locked, locked_at
    )
    values (p_issuer_company_id, 'invoice_receipt', '', 1000, 999, true, now())
    on conflict (company_id, document_type) do nothing;

    select *
      into v_seq
    from public.document_sequences
    where company_id = p_issuer_company_id and document_type = 'invoice_receipt'
    for update;

    if not found then
      raise exception 'sequence_missing_for_invoice_receipt';
    end if;

    if v_seq.is_locked is distinct from true then
      update public.document_sequences
      set is_locked = true, locked_at = now()
      where id = v_seq.id;
    end if;

    if coalesce(v_seq.starting_number, 0) < 1000 then
      update public.document_sequences
      set starting_number = 1000
      where id = v_seq.id;
      v_seq.starting_number := 1000;
    end if;

    v_next_number := greatest(coalesce(v_seq.current_number, 0) + 1, coalesce(v_seq.starting_number, 1000), 1000);
    v_prefix := coalesce(v_seq.prefix, '');

    update public.document_sequences
    set current_number = v_next_number, updated_at = now()
    where id = v_seq.id;

    v_doc_number := v_prefix || v_next_number::text;
  else
    v_doc_number := left(replace(p_auditor_charge_id::text, '-', ''), 12);
  end if;

  v_total := coalesce(v_charge.amount, 0);
  v_subtotal := round((v_total / (1 + (v_vat_rate / 100)))::numeric, 2);
  v_vat_amount := round((v_total - v_subtotal)::numeric, 2);

  -- Build dynamic INSERT for documents (only existing columns)
  v_cols := array[]::text[];
  v_vals := array[]::text[];

  v_cols := array_append(v_cols, 'company_id');
  v_vals := array_append(v_vals, quote_literal(p_issuer_company_id));

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='document_type') then
    v_cols := array_append(v_cols, 'document_type');
    v_vals := array_append(v_vals, quote_literal('invoice_receipt'));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='document_number') then
    v_cols := array_append(v_cols, 'document_number');
    v_vals := array_append(v_vals, quote_literal(v_doc_number));
  end if;

  if v_status_col is not null then
    v_cols := array_append(v_cols, v_status_col);
    v_vals := array_append(v_vals, quote_literal(case when v_status_col = 'status' then 'closed' else 'final' end));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='issue_date') then
    v_cols := array_append(v_cols, 'issue_date');
    v_vals := array_append(v_vals, 'current_date');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='amount') then
    v_cols := array_append(v_cols, 'amount');
    v_vals := array_append(v_vals, quote_literal(v_total));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='total_amount') then
    v_cols := array_append(v_cols, 'total_amount');
    v_vals := array_append(v_vals, quote_literal(v_total));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='subtotal') then
    v_cols := array_append(v_cols, 'subtotal');
    v_vals := array_append(v_vals, quote_literal(v_subtotal));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='vat_rate') then
    v_cols := array_append(v_cols, 'vat_rate');
    v_vals := array_append(v_vals, quote_literal(v_vat_rate));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='vat_amount') then
    v_cols := array_append(v_cols, 'vat_amount');
    v_vals := array_append(v_vals, quote_literal(v_vat_amount));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='currency') then
    v_cols := array_append(v_cols, 'currency');
    v_vals := array_append(v_vals, quote_literal(coalesce(v_charge.currency, 'ILS')));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='customer_name') then
    v_cols := array_append(v_cols, 'customer_name');
    v_vals := array_append(v_vals, quote_literal(v_company_name));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='customer_tax_id') then
    v_cols := array_append(v_cols, 'customer_tax_id');
    v_vals := array_append(v_vals, quote_literal(v_company_tax_id));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='reference_text') then
    v_cols := array_append(v_cols, 'reference_text');
    v_vals := array_append(v_vals, quote_literal('auditor_charge:' || p_auditor_charge_id::text));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='accounting_status') then
    v_cols := array_append(v_cols, 'accounting_status');
    v_vals := array_append(v_vals, quote_literal('paid'));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='paid_amount') then
    v_cols := array_append(v_cols, 'paid_amount');
    v_vals := array_append(v_vals, quote_literal(v_total));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='credited_amount') then
    v_cols := array_append(v_cols, 'credited_amount');
    v_vals := array_append(v_vals, quote_literal(0));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='outstanding_balance') then
    v_cols := array_append(v_cols, 'outstanding_balance');
    v_vals := array_append(v_vals, quote_literal(0));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='finalized_at') then
    v_cols := array_append(v_cols, 'finalized_at');
    v_vals := array_append(v_vals, 'now()');
  end if;

  v_sql := 'insert into public.documents (' || array_to_string(v_cols, ',') || ') values (' || array_to_string(v_vals, ',') || ') returning id';
  execute v_sql into v_doc_id;

  -- Line item: plan / period
  insert into public.document_line_items (
    document_id,
    company_id,
    line_number,
    description,
    item_date,
    unit_price,
    quantity,
    line_total,
    currency,
    payment_metadata
  )
  values (
    v_doc_id,
    p_issuer_company_id,
    1,
    'מנוי /auditor – ' || v_plan_name,
    current_date,
    v_total,
    1,
    v_total,
    coalesce(v_charge.currency, 'ILS'),
    jsonb_build_object(
      'kind', 'auditor_subscription',
      'planId', v_charge.plan_id,
      'periodStart', v_charge.subscription_period_start,
      'periodEnd', v_charge.subscription_period_end,
      'chargeId', p_auditor_charge_id
    )
  );

  update public.auditor_subscription_charges
  set issued_invoice_id = v_doc_id
  where id = p_auditor_charge_id;

  select d.document_number into v_existing_doc_number
  from public.documents d
  where d.id = v_doc_id;

  return query select true, v_doc_id, v_existing_doc_number;
  return;
end;
$$;

revoke all on function public.issue_auditor_charge_invoice_receipt_service(uuid, uuid) from public;
revoke all on function public.issue_auditor_charge_invoice_receipt_service(uuid, uuid) from anon;
revoke all on function public.issue_auditor_charge_invoice_receipt_service(uuid, uuid) from authenticated;
grant execute on function public.issue_auditor_charge_invoice_receipt_service(uuid, uuid) to service_role;

commit;

select pg_notify('pgrst', 'reload schema');


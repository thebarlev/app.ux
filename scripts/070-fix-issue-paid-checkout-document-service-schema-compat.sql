-- ====================================================
-- 070 - Fix: issue_paid_checkout_document_service schema compatibility
-- ====================================================
-- Runtime evidence:
-- - Postgres error 42703: column "payment_method" of relation "documents" does not exist
-- - This caused issuance to fail, therefore:
--   - NO row in public.documents
--   - NO row in public.billing_documents
--
-- Goal:
-- - Keep issuance privileged + idempotent
-- - Avoid referencing columns that may not exist in the current DB schema
-- - Insert only columns that exist (dynamic column detection)
-- - Create billing_documents link (checkout_session_id -> document_id)
--
-- Notes:
-- - Does NOT change business meaning/pricing.
-- - Does NOT change DB schema.
-- ====================================================

begin;

create or replace function public.issue_paid_checkout_document_service(
  p_checkout_session_id uuid,
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
  v_existing_document_id uuid;
  v_existing_document_number text;

  v_cs record;
  v_buyer_company_id uuid;
  v_buyer_company_name text;
  v_buyer_tax_id text;

  v_amount numeric;
  v_internal_deal_number text;

  v_seq record;
  v_next_number integer;
  v_prefix text;
  v_doc_number text;
  v_doc_id uuid;

  v_cols text[] := array[]::text[];
  v_vals text[] := array[]::text[];
  v_insert_sql text;

  v_status_col text := null;
begin
  if p_checkout_session_id is null or p_issuer_company_id is null then
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

  if to_regclass('public.checkout_sessions') is null then
    raise exception 'missing_table:checkout_sessions';
  end if;
  if to_regclass('public.documents') is null then
    raise exception 'missing_table:documents';
  end if;
  if to_regclass('public.billing_documents') is null then
    raise exception 'missing_table:billing_documents';
  end if;

  -- Serialize issuance per checkout session
  perform pg_advisory_xact_lock(hashtextextended('issue_paid_checkout_document_service:' || p_checkout_session_id::text, 0));

  -- Idempotency: if already linked, return existing
  select bd.document_id, d.document_number
    into v_existing_document_id, v_existing_document_number
  from public.billing_documents bd
  join public.documents d on d.id = bd.document_id
  where bd.checkout_session_id = p_checkout_session_id;

  if v_existing_document_id is not null then
    return query select true, v_existing_document_id, v_existing_document_number;
    return;
  end if;

  -- Load + lock checkout session
  select *
    into v_cs
  from public.checkout_sessions
  where id = p_checkout_session_id
  for update;

  if not found then
    return query select false, null::uuid, null::text;
    return;
  end if;

  if v_cs.status is distinct from 'paid' then
    return query select false, null::uuid, null::text;
    return;
  end if;

  v_buyer_company_id := v_cs.company_id;
  v_amount := v_cs.amount;
  v_internal_deal_number := v_cs.provider_internal_deal_number;

  select c.company_name, coalesce(c.registration_number, c.tax_id)
    into v_buyer_company_name, v_buyer_tax_id
  from public.companies c
  where c.id = v_buyer_company_id;
  if v_buyer_company_name is null then v_buyer_company_name := 'לקוח'; end if;

  -- Determine which status column exists on documents:
  -- - newer schema: document_status ('draft'|'final'...)
  -- - older schema: status ('open'|'closed'...)
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
  end if;

  -- Ensure numbering series exists if document_sequences exists; otherwise fallback to a stable number.
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
    -- Fallback (should be rare): deterministic-ish number (not regulatory) if sequences table missing.
    v_doc_number := left(replace(p_checkout_session_id::text, '-', ''), 12);
  end if;

  -- Build dynamic INSERT for documents (only existing columns)
  v_cols := array_append(v_cols, 'company_id');
  v_vals := array_append(v_vals, quote_literal(p_issuer_company_id));

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='document_number') then
    v_cols := array_append(v_cols, 'document_number');
    v_vals := array_append(v_vals, quote_literal(v_doc_number));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='document_type') then
    v_cols := array_append(v_cols, 'document_type');
    v_vals := array_append(v_vals, quote_literal('invoice_receipt'));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='issue_date') then
    v_cols := array_append(v_cols, 'issue_date');
    v_vals := array_append(v_vals, 'current_date');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='amount') then
    v_cols := array_append(v_cols, 'amount');
    v_vals := array_append(v_vals, quote_literal(v_amount));
  end if;

  -- customer_name + tax id (if exists)
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='customer_name') then
    v_cols := array_append(v_cols, 'customer_name');
    v_vals := array_append(v_vals, quote_literal(v_buyer_company_name));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='customer_tax_id') then
    v_cols := array_append(v_cols, 'customer_tax_id');
    v_vals := array_append(v_vals, quote_literal(v_buyer_tax_id));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='customer_id') then
    -- We don't have a customers row here; keep null.
    v_cols := array_append(v_cols, 'customer_id');
    v_vals := array_append(v_vals, 'null');
  end if;

  -- Optional description/reference fields if present
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='document_description') then
    v_cols := array_append(v_cols, 'document_description');
    v_vals := array_append(v_vals, quote_literal('שירותי חשבונית ירוקה מאובטחת'));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='reference_text') then
    v_cols := array_append(v_cols, 'reference_text');
    v_vals := array_append(v_vals, quote_literal(left('checkout:' || p_checkout_session_id::text || ' deal:' || coalesce(v_internal_deal_number, ''), 500)));
  end if;

  -- Optional accounting fields if present (keep non-null)
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='total_amount') then
    v_cols := array_append(v_cols, 'total_amount');
    v_vals := array_append(v_vals, quote_literal(v_amount));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='paid_amount') then
    v_cols := array_append(v_cols, 'paid_amount');
    v_vals := array_append(v_vals, quote_literal(v_amount));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='credited_amount') then
    v_cols := array_append(v_cols, 'credited_amount');
    v_vals := array_append(v_vals, quote_literal(0));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='outstanding_balance') then
    v_cols := array_append(v_cols, 'outstanding_balance');
    v_vals := array_append(v_vals, quote_literal(0));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='currency') then
    v_cols := array_append(v_cols, 'currency');
    v_vals := array_append(v_vals, quote_literal('₪'));
  end if;

  -- Status column (if we detected it)
  if v_status_col is not null then
    v_cols := array_append(v_cols, v_status_col);
    if v_status_col = 'document_status' then
      v_vals := array_append(v_vals, quote_literal('final'));
    else
      v_vals := array_append(v_vals, quote_literal('closed'));
    end if;
  end if;

  -- created_at if exists and no default wanted? Usually has default; skip setting it.

  v_insert_sql := format(
    'insert into public.documents (%s) values (%s) returning id',
    array_to_string((select array_agg(quote_ident(c)) from unnest(v_cols) as c), ','),
    array_to_string(v_vals, ',')
  );

  execute v_insert_sql into v_doc_id;

  -- Link checkout -> document (idempotent unique)
  insert into public.billing_documents (
    checkout_session_id,
    document_id,
    issuer_company_id,
    buyer_company_id,
    provider,
    provider_internal_deal_number
  )
  values (
    p_checkout_session_id,
    v_doc_id,
    p_issuer_company_id,
    v_buyer_company_id,
    'cardcom',
    v_internal_deal_number
  )
  on conflict (checkout_session_id) do nothing;

  return query select true, v_doc_id, v_doc_number;
  return;
end;
$$;

revoke all on function public.issue_paid_checkout_document_service(uuid, uuid) from public;
revoke all on function public.issue_paid_checkout_document_service(uuid, uuid) from anon;
revoke all on function public.issue_paid_checkout_document_service(uuid, uuid) from authenticated;
grant execute on function public.issue_paid_checkout_document_service(uuid, uuid) to service_role;

commit;

select pg_notify('pgrst', 'reload schema');


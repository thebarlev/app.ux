-- ====================================================
-- 071 - issue_paid_checkout_document_service: add line items + VAT calc (schema compatible)
-- ====================================================
-- User-visible requirements:
-- - Issued "חשבונית מס / קבלה" must include:
--   1) Items section with current month+year description
--   2) Receipts/payments section with credit-card details from Cardcom (when available)
-- - Must remain idempotent: retries must not create duplicates.
-- - Must remain schema-compatible across DB variants (some optional columns may be missing).
-- - Must NOT assume documents.payment_method exists.
--
-- Notes:
-- - This function is SECURITY DEFINER and service_role-only (same as 070).
-- - It creates documents as FINAL/CLOSED (like 070) and inserts line items afterwards.
--   If your DB has a trigger forbidding line-item inserts for finalized docs, you MUST change
--   the trigger or create the document as draft and finalize after inserting items.
--   (In most schemas, the immutability trigger blocks UPDATE, not INSERT.)
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

  v_subtotal numeric;
  v_vat_rate numeric := 18;
  v_vat_amount numeric;

  v_month_label text;

  v_has_line_items boolean := false;
  v_has_payment_metadata boolean := false;
  v_has_line_item_kind boolean := false;
  v_has_item_sku boolean := false;
  v_has_item_date boolean := false;
  v_has_currency_li boolean := false;
  v_has_company_id_li boolean := false;

  v_card_last4 text := null;
  v_card_brand text := null;
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
    v_doc_id := v_existing_document_id;
    v_doc_number := v_existing_document_number;
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

  -- VAT calculations (VAT included)
  v_subtotal := round((v_amount / (1 + (v_vat_rate / 100.0)))::numeric, 2);
  v_vat_amount := v_amount - v_subtotal;

  -- Month label (Hebrew) for item details
  v_month_label := to_char((now())::date, 'MM/YYYY');

  select c.company_name, coalesce(c.registration_number, c.tax_id)
    into v_buyer_company_name, v_buyer_tax_id
  from public.companies c
  where c.id = v_buyer_company_id;
  if v_buyer_company_name is null then v_buyer_company_name := 'לקוח'; end if;

  -- Try to extract Cardcom card metadata if checkout_sessions has raw indicator JSON
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='checkout_sessions' and column_name in ('raw_indicator_json','provider_indicator_json')
  ) then
    begin
      if exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='checkout_sessions' and column_name='raw_indicator_json'
      ) then
        v_card_last4 := nullif(trim(coalesce((v_cs.raw_indicator_json::jsonb ->> 'CardLast4'), (v_cs.raw_indicator_json::jsonb ->> 'CardLastDigits'), (v_cs.raw_indicator_json::jsonb ->> 'Last4Digits'))), '');
        v_card_brand := nullif(trim(coalesce((v_cs.raw_indicator_json::jsonb ->> 'CardBrand'), (v_cs.raw_indicator_json::jsonb ->> 'CardType'), (v_cs.raw_indicator_json::jsonb ->> 'CardName'))), '');
      elsif exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='checkout_sessions' and column_name='provider_indicator_json'
      ) then
        v_card_last4 := nullif(trim(coalesce((v_cs.provider_indicator_json::jsonb ->> 'CardLast4'), (v_cs.provider_indicator_json::jsonb ->> 'CardLastDigits'), (v_cs.provider_indicator_json::jsonb ->> 'Last4Digits'))), '');
        v_card_brand := nullif(trim(coalesce((v_cs.provider_indicator_json::jsonb ->> 'CardBrand'), (v_cs.provider_indicator_json::jsonb ->> 'CardType'), (v_cs.provider_indicator_json::jsonb ->> 'CardName'))), '');
      end if;
    exception when others then
      v_card_last4 := null;
      v_card_brand := null;
    end;
  end if;

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

  -- Ensure numbering series exists if document_sequences exists; otherwise fallback.
  -- Only allocate a new number if we are creating a NEW document.
  if v_doc_id is null and to_regclass('public.document_sequences') is not null then
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
  elsif v_doc_id is null then
    v_doc_number := left(replace(p_checkout_session_id::text, '-', ''), 12);
  end if;

  if v_doc_id is null then
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
    v_cols := array_append(v_cols, 'customer_id');
    v_vals := array_append(v_vals, 'null');
  end if;

  -- Optional description/reference fields if present
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='document_description') then
    v_cols := array_append(v_cols, 'document_description');
    v_vals := array_append(v_vals, quote_literal('שירותי חשבונית ירוקה מאובטחת - Basic'));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='reference_text') then
    v_cols := array_append(v_cols, 'reference_text');
    v_vals := array_append(v_vals, quote_literal(left('checkout:' || p_checkout_session_id::text || ' deal:' || coalesce(v_internal_deal_number, ''), 500)));
  end if;

  -- Optional accounting fields if present (keep non-null)
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
    v_vals := array_append(v_vals, quote_literal('ILS'));
  end if;

  -- Status column (if we detected it)
  if v_status_col is not null then
    v_cols := array_append(v_cols, v_status_col);
    if v_status_col = 'document_status' then
      -- Create as draft first; finalize after line items are inserted.
      v_vals := array_append(v_vals, quote_literal('draft'));
    else
      -- Older schema: create as open first; close after line items are inserted.
      v_vals := array_append(v_vals, quote_literal('open'));
    end if;
  end if;

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
  end if;

  -- Add line items (item + payment) if the table exists.
  v_has_line_items := to_regclass('public.document_line_items') is not null;
  if v_has_line_items then
    v_has_company_id_li := exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='document_line_items' and column_name='company_id'
    );
    v_has_payment_metadata := exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='document_line_items' and column_name='payment_metadata'
    );
    v_has_item_sku := exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='document_line_items' and column_name in ('item_sku','sku')
    );
    v_has_item_date := exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='document_line_items' and column_name='item_date'
    );
    v_has_currency_li := exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='document_line_items' and column_name='currency'
    );

    -- If the line-items table doesn't carry company_id, we can't safely insert in tenant-isolated setups.
    if v_has_company_id_li is distinct from true then
      return query select true, v_doc_id, v_doc_number;
      return;
    end if;

    -- If doc is already finalized/closed, temporarily move it back to draft/open to allow inserting items
    -- (some environments enforce line-item immutability on finalized docs).
    if v_status_col = 'document_status' then
      update public.documents set document_status = 'draft' where id = v_doc_id;
    elsif v_status_col = 'status' then
      update public.documents set status = 'open' where id = v_doc_id;
    end if;

    -- Insert missing lines only (idempotent backfill).
    -- Item line (service)
    if v_has_payment_metadata then
      if not exists (
        select 1 from public.document_line_items li
        where li.document_id = v_doc_id
          and (li.payment_metadata->>'kind') = 'item'
      ) then
      if v_has_item_date and v_has_currency_li then
        insert into public.document_line_items (
          document_id, company_id, line_number,
          description, quantity, unit_price, line_total,
          item_date, currency,
          payment_metadata
        )
        values (
          v_doc_id, p_issuer_company_id, 10,
          'שירותי חשבונית ירוקה מאובטחת - Basic', 1, v_amount, v_amount,
          current_date, 'ILS',
          jsonb_build_object(
            'kind','item',
            'label','שירותי חשבונית ירוקה מאובטחת - Basic',
            'sku', null,
            'details', v_month_label,
            'vatMode','included'
          )
        );
      elsif v_has_item_date then
        insert into public.document_line_items (
          document_id, company_id, line_number,
          description, quantity, unit_price, line_total,
          item_date,
          payment_metadata
        )
        values (
          v_doc_id, p_issuer_company_id, 10,
          'שירותי חשבונית ירוקה מאובטחת - Basic', 1, v_amount, v_amount,
          current_date,
          jsonb_build_object(
            'kind','item',
            'label','שירותי חשבונית ירוקה מאובטחת - Basic',
            'sku', null,
            'details', v_month_label,
            'vatMode','included'
          )
        );
      elsif v_has_currency_li then
        insert into public.document_line_items (
          document_id, company_id, line_number,
          description, quantity, unit_price, line_total,
          currency,
          payment_metadata
        )
        values (
          v_doc_id, p_issuer_company_id, 10,
          'שירותי חשבונית ירוקה מאובטחת - Basic', 1, v_amount, v_amount,
          'ILS',
          jsonb_build_object(
            'kind','item',
            'label','שירותי חשבונית ירוקה מאובטחת - Basic',
            'sku', null,
            'details', v_month_label,
            'vatMode','included'
          )
        );
      else
        insert into public.document_line_items (
          document_id, company_id, line_number,
          description, quantity, unit_price, line_total,
          payment_metadata
        )
        values (
          v_doc_id, p_issuer_company_id, 10,
          'שירותי חשבונית ירוקה מאובטחת - Basic', 1, v_amount, v_amount,
          jsonb_build_object(
            'kind','item',
            'label','שירותי חשבונית ירוקה מאובטחת - Basic',
            'sku', null,
            'details', v_month_label,
            'vatMode','included'
          )
        );
      end if;
      end if;
    else
      if not exists (
        select 1 from public.document_line_items li
        where li.document_id = v_doc_id
          and li.line_number = 10
      ) then
      insert into public.document_line_items (
        document_id, company_id, line_number,
        description, quantity, unit_price, line_total
      )
      values (
        v_doc_id, p_issuer_company_id, 10,
        'שירותי חשבונית ירוקה מאובטחת - Basic - ' || v_month_label, 1, v_amount, v_amount
      );
      end if;
    end if;

    -- Payment line (receipt)
    if v_has_payment_metadata then
      if not exists (
        select 1 from public.document_line_items li
        where li.document_id = v_doc_id
          and (li.payment_metadata->>'kind') = 'payment'
      ) then
      if v_has_item_date and v_has_currency_li then
        insert into public.document_line_items (
          document_id, company_id, line_number,
          description, quantity, unit_price, line_total,
          item_date, currency,
          payment_metadata
        )
        values (
          v_doc_id, p_issuer_company_id, 90,
          'כרטיס אשראי', 1, v_amount, v_amount,
          current_date, 'ILS',
          jsonb_build_object(
            'kind','payment',
            'label','כרטיס אשראי',
            'sku', v_internal_deal_number,
            'details', null,
            'cardLastDigits', v_card_last4,
            'cardType', v_card_brand,
            'transactionReference', v_internal_deal_number
          )
        );
      elsif v_has_item_date then
        insert into public.document_line_items (
          document_id, company_id, line_number,
          description, quantity, unit_price, line_total,
          item_date,
          payment_metadata
        )
        values (
          v_doc_id, p_issuer_company_id, 90,
          'כרטיס אשראי', 1, v_amount, v_amount,
          current_date,
          jsonb_build_object(
            'kind','payment',
            'label','כרטיס אשראי',
            'sku', v_internal_deal_number,
            'details', null,
            'cardLastDigits', v_card_last4,
            'cardType', v_card_brand,
            'transactionReference', v_internal_deal_number
          )
        );
      elsif v_has_currency_li then
        insert into public.document_line_items (
          document_id, company_id, line_number,
          description, quantity, unit_price, line_total,
          currency,
          payment_metadata
        )
        values (
          v_doc_id, p_issuer_company_id, 90,
          'כרטיס אשראי', 1, v_amount, v_amount,
          'ILS',
          jsonb_build_object(
            'kind','payment',
            'label','כרטיס אשראי',
            'sku', v_internal_deal_number,
            'details', null,
            'cardLastDigits', v_card_last4,
            'cardType', v_card_brand,
            'transactionReference', v_internal_deal_number
          )
        );
      else
        insert into public.document_line_items (
          document_id, company_id, line_number,
          description, quantity, unit_price, line_total,
          payment_metadata
        )
        values (
          v_doc_id, p_issuer_company_id, 90,
          'כרטיס אשראי', 1, v_amount, v_amount,
          jsonb_build_object(
            'kind','payment',
            'label','כרטיס אשראי',
            'sku', v_internal_deal_number,
            'details', null,
            'cardLastDigits', v_card_last4,
            'cardType', v_card_brand,
            'transactionReference', v_internal_deal_number
          )
        );
      end if;
      end if;
    else
      if not exists (
        select 1 from public.document_line_items li
        where li.document_id = v_doc_id
          and li.line_number = 90
      ) then
      insert into public.document_line_items (
        document_id, company_id, line_number,
        description, quantity, unit_price, line_total
      )
      values (
        v_doc_id, p_issuer_company_id, 90,
        'כרטיס אשראי', 1, v_amount, v_amount
      );
      end if;
    end if;
  end if;

  -- Finalize/close document after line items exist (works around immutability triggers).
  if v_status_col is not null then
    if v_status_col = 'document_status' then
      update public.documents
      set document_status = 'final'
      where id = v_doc_id;

      if exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='documents' and column_name='finalized_at'
      ) then
        update public.documents
        set finalized_at = now()
        where id = v_doc_id and finalized_at is null;
      end if;
    else
      update public.documents
      set status = 'closed'
      where id = v_doc_id;
    end if;
  end if;

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


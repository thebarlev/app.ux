-- ====================================================
-- 067 - Fix: invoice_receipt issuance must add line_items before finalizing
-- ====================================================
-- Root cause:
-- - DB trigger `trigger_line_item_immutability` rejects INSERT/UPDATE/DELETE on
--   `document_line_items` when parent `documents.document_status = 'final'`.
-- - Our issuance RPCs created documents as 'final' and then inserted line items,
--   causing: "Cannot modify line items of finalized document" (ERRCODE P0001).
--
-- Fix:
-- - Create issued documents as 'draft'
-- - Insert line items
-- - Finalize document in a final UPDATE (set status='final', finalized_at, paid fields)
-- ====================================================

begin;

-- ----------------------------------------------------
-- A) Initial purchase: paid checkout -> invoice_receipt
-- ----------------------------------------------------
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
  v_buyer_contact_full_name text;
  v_buyer_tax_id text;
  v_buyer_email text;
  v_buyer_phone text;

  v_plan_name text;
  v_amount numeric;
  v_coin_id int;
  v_low_profile_code text;
  v_internal_deal_number text;

  v_card_brand text;
  v_card_last4 text;

  v_seq record;
  v_next_number integer;
  v_prefix text;

  v_doc_id uuid;
  v_doc_number text;
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
  v_coin_id := v_cs.coin_id;
  v_low_profile_code := v_cs.provider_low_profile_code;
  v_internal_deal_number := v_cs.provider_internal_deal_number;

  -- Optional card info (from stored raw_indicator_json keys)
  v_card_brand := coalesce(
    v_cs.raw_indicator_json->>'Mutag_24',
    v_cs.raw_indicator_json->>'Mutag24',
    v_cs.raw_indicator_json->>'Mutag',
    v_cs.raw_indicator_json->>'ExtShvaParams.Mutag24'
  );
  v_card_last4 := coalesce(
    v_cs.raw_indicator_json->>'CardNumEnd',
    v_cs.raw_indicator_json->>'ExtShvaParams.CardNumber5'
  );

  select
    c.company_name,
    c.contact_full_name,
    coalesce(c.registration_number, c.tax_id),
    c.email,
    c.mobile_phone
    into v_buyer_company_name, v_buyer_contact_full_name, v_buyer_tax_id, v_buyer_email, v_buyer_phone
  from public.companies c
  where c.id = v_buyer_company_id;

  if v_buyer_company_name is null then v_buyer_company_name := 'לקוח'; end if;

  select p.name
    into v_plan_name
  from public.plans p
  where p.id = v_cs.plan_id;
  if v_plan_name is null then v_plan_name := v_cs.plan_id; end if;

  -- Ensure numbering series exists for issuer company (invoice_receipt)
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

  -- Create as DRAFT first (so we can insert line_items)
  insert into public.documents (
    company_id,
    document_type,
    document_status,
    document_number,
    issue_date,
    amount,
    total_amount,
    currency,
    customer_name,
    customer_tax_id,
    customer_email,
    customer_phone,
    reference_text,
    accounting_status,
    paid_amount,
    credited_amount,
    outstanding_balance,
    finalized_at,
    finalized_by
  )
  values (
    p_issuer_company_id,
    'invoice_receipt',
    'draft',
    v_doc_number,
    current_date,
    v_amount,
    v_amount,
    case when v_coin_id = 2 then 'USD' else 'ILS' end,
    v_buyer_company_name,
    v_buyer_tax_id,
    v_buyer_email,
    v_buyer_phone,
    left('checkout:' || p_checkout_session_id::text || ' deal:' || coalesce(v_internal_deal_number, '') || ' code:' || coalesce(v_low_profile_code, ''), 500),
    null,
    null,
    null,
    null,
    null,
    null
  )
  returning id into v_doc_id;

  -- Single line item
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
    'שירותי חשבונית ירוקה מאובטחת - ' || v_plan_name,
    current_date,
    v_amount,
    1,
    v_amount,
    case when v_coin_id = 2 then 'USD' else 'ILS' end,
    jsonb_build_object(
      'provider', 'cardcom',
      'paymentMethod', 'credit_card',
      'cardBrand', v_card_brand,
      'cardLast4', v_card_last4,
      'checkoutSessionId', p_checkout_session_id::text,
      'buyerCompanyId', v_buyer_company_id::text,
      'buyerCompanyName', v_buyer_company_name,
      'buyerContactFullName', v_buyer_contact_full_name,
      'buyerTaxId', v_buyer_tax_id,
      'buyerEmail', v_buyer_email,
      'buyerPhone', v_buyer_phone,
      'lowProfileCode', v_low_profile_code,
      'internalDealNumber', v_internal_deal_number
    )
  );

  -- Finalize AFTER line items are inserted
  update public.documents
  set
    document_status = 'final',
    accounting_status = 'paid',
    paid_amount = v_amount,
    credited_amount = 0,
    outstanding_balance = 0,
    finalized_at = now(),
    finalized_by = null
  where id = v_doc_id;

  -- Link checkout -> document
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

  select bd.document_id, d.document_number
    into v_existing_document_id, v_existing_document_number
  from public.billing_documents bd
  join public.documents d on d.id = bd.document_id
  where bd.checkout_session_id = p_checkout_session_id;

  return query select true, v_existing_document_id, v_existing_document_number;
  return;
end;
$$;

-- Defense-in-depth permissions (service role only)
revoke all on function public.issue_paid_checkout_document_service(uuid, uuid) from public;
revoke all on function public.issue_paid_checkout_document_service(uuid, uuid) from anon;
revoke all on function public.issue_paid_checkout_document_service(uuid, uuid) from authenticated;
grant execute on function public.issue_paid_checkout_document_service(uuid, uuid) to service_role;

-- ----------------------------------------------------
-- B) Renewals: renewal event -> invoice_receipt
-- ----------------------------------------------------
create or replace function public.issue_renewal_invoice_receipt_service(
  p_company_id uuid,
  p_period_start timestamptz,
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
  v_ev record;
  v_company_name text;
  v_company_tax_id text;
  v_company_email text;
  v_company_phone text;
  v_contact_full_name text;

  v_seq record;
  v_next_number integer;
  v_prefix text;
  v_doc_id uuid;
  v_doc_number text;
  v_overage_total numeric;

  v_card_brand text;
  v_card_last4 text;
begin
  if p_company_id is null or p_period_start is null or p_issuer_company_id is null then
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

  -- Find the renewal event
  select *
    into v_ev
  from public.billing_renewal_events
  where company_id = p_company_id
    and period_start = p_period_start
  for update;

  if not found then
    return query select false, null::uuid, null::text;
    return;
  end if;

  -- Idempotency: if already issued, return existing
  if v_ev.issued_document_id is not null then
    select d.id, d.document_number
      into v_doc_id, v_doc_number
    from public.documents d
    where d.id = v_ev.issued_document_id;

    return query select true, v_doc_id, v_doc_number;
    return;
  end if;

  select c.company_name, coalesce(c.registration_number, c.tax_id), c.email, c.mobile_phone, c.contact_full_name
    into v_company_name, v_company_tax_id, v_company_email, v_company_phone, v_contact_full_name
  from public.companies c
  where c.id = p_company_id;

  if v_company_name is null then v_company_name := 'לקוח'; end if;

  -- Try to include card info from latest active token (best-effort)
  select pm.brand, pm.card_num_end
    into v_card_brand, v_card_last4
  from public.customer_payment_methods pm
  where pm.company_id = p_company_id
    and pm.provider = 'cardcom'
    and pm.status = 'active'
  order by pm.created_at desc
  limit 1;

  -- Ensure numbering series exists for issuer company (invoice_receipt)
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

  -- Totals
  v_overage_total := (coalesce(v_ev.overage_units, 0) * coalesce(v_ev.overage_unit_price, 0))::numeric;

  -- Create as DRAFT first
  insert into public.documents (
    company_id,
    document_type,
    document_status,
    document_number,
    issue_date,
    amount,
    total_amount,
    currency,
    customer_name,
    customer_tax_id,
    customer_email,
    customer_phone,
    reference_text,
    accounting_status,
    paid_amount,
    credited_amount,
    outstanding_balance,
    finalized_at,
    finalized_by
  )
  values (
    p_issuer_company_id,
    'invoice_receipt',
    'draft',
    v_doc_number,
    current_date,
    v_ev.total_amount,
    v_ev.total_amount,
    'ILS',
    v_company_name,
    v_company_tax_id,
    v_company_email,
    v_company_phone,
    'renewal:' || p_company_id::text || ':' || p_period_start::text,
    null,
    null,
    null,
    null,
    null,
    null
  )
  returning id into v_doc_id;

  -- Line item A: base package
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
    'שירותי חשבונית ירוקה מאובטחת - חבילת מנוי',
    current_date,
    v_ev.base_amount,
    1,
    v_ev.base_amount,
    'ILS',
    jsonb_build_object(
      'kind', 'subscription_base',
      'paymentMethod', 'credit_card',
      'cardBrand', v_card_brand,
      'cardLast4', v_card_last4,
      'planId', v_ev.plan_id,
      'buyerCompanyId', p_company_id::text,
      'buyerCompanyName', v_company_name,
      'buyerContactFullName', v_contact_full_name,
      'periodStart', v_ev.period_start,
      'periodEnd', v_ev.period_end
    )
  );

  -- Line item B: overage (if any)
  if coalesce(v_ev.overage_units, 0) > 0 and v_overage_total > 0 then
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
      2,
      'מסמכים מעבר למכסה',
      current_date,
      v_ev.overage_unit_price,
      v_ev.overage_units,
      v_overage_total,
      'ILS',
      jsonb_build_object(
        'kind', 'subscription_overage',
        'overageUnits', v_ev.overage_units,
        'overageUnitPrice', v_ev.overage_unit_price
      )
    );
  end if;

  -- Finalize AFTER line items are inserted
  update public.documents
  set
    document_status = 'final',
    accounting_status = 'paid',
    paid_amount = v_ev.total_amount,
    credited_amount = 0,
    outstanding_balance = 0,
    finalized_at = now(),
    finalized_by = null
  where id = v_doc_id;

  update public.billing_renewal_events
  set issued_document_id = v_doc_id
  where id = v_ev.id;

  return query select true, v_doc_id, v_doc_number;
  return;
end;
$$;

revoke all on function public.issue_renewal_invoice_receipt_service(uuid, timestamptz, uuid) from public;
revoke all on function public.issue_renewal_invoice_receipt_service(uuid, timestamptz, uuid) from anon;
revoke all on function public.issue_renewal_invoice_receipt_service(uuid, timestamptz, uuid) from authenticated;
grant execute on function public.issue_renewal_invoice_receipt_service(uuid, timestamptz, uuid) to service_role;

commit;

select pg_notify('pgrst', 'reload schema');


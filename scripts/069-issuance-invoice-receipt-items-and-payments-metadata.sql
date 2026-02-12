-- ====================================================
-- 069 - Issuance: invoice_receipt should include structured items+payments metadata
-- ====================================================
-- Goals:
-- - Fill documents.document_description (shown in quick view + lists)
-- - Fill documents.payment_method (shown in quick view)
-- - Insert two logical line groups using payment_metadata.kind:
--    - kind='item'    -> service line(s) (SKU/details/vatMode for UI)
--    - kind='payment' -> payment line (credit card + last4 + card type)
-- - Keep DB constraints: paid_amount/credited_amount/outstanding_balance NOT NULL
--
-- Notes:
-- - UI expects in invoice_receipt summary:
--   label <- payment_metadata.label
--   sku   <- payment_metadata.sku
--   description <- payment_metadata.details
--   vatMode <- payment_metadata.vatMode ('included' => "כולל")
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
  v_buyer_contact_full_name text;
  v_buyer_tax_id text;
  v_buyer_email text;
  v_buyer_phone text;

  v_customer_display text;

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
  v_service_label text;
  v_charge_period text;
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

  v_customer_display := coalesce(nullif(v_buyer_contact_full_name, ''), v_buyer_company_name);
  if v_buyer_contact_full_name is not null and v_buyer_contact_full_name <> '' and v_buyer_company_name <> '' and v_buyer_company_name <> v_buyer_contact_full_name then
    v_customer_display := v_buyer_contact_full_name || ' (' || v_buyer_company_name || ')';
  end if;

  select p.name
    into v_plan_name
  from public.plans p
  where p.id = v_cs.plan_id;
  if v_plan_name is null then v_plan_name := v_cs.plan_id; end if;

  v_service_label := 'שירותי חשבונית ירוקה מאובטחת - ' || v_plan_name;
  v_charge_period := to_char(current_date, 'MM/YYYY');

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
    document_description,
    payment_method,
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
    v_customer_display,
    v_buyer_tax_id,
    v_buyer_email,
    v_buyer_phone,
    v_service_label,
    'כרטיס אשראי',
    left('checkout:' || p_checkout_session_id::text || ' deal:' || coalesce(v_internal_deal_number, '') || ' code:' || coalesce(v_low_profile_code, ''), 500),
    'paid',
    v_amount,
    0,
    0,
    null,
    null
  )
  returning id into v_doc_id;

  -- Line 1: Item row (for items table)
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
    v_service_label,
    current_date,
    v_amount,
    1,
    v_amount,
    case when v_coin_id = 2 then 'USD' else 'ILS' end,
    jsonb_build_object(
      'kind', 'item',
      'label', v_service_label,
      'sku', null,
      'details', v_charge_period,
      'vatMode', 'included'
    )
  );

  -- Line 2: Payment row (for payments table)
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
    90,
    'כרטיס אשראי',
    current_date,
    v_amount,
    1,
    v_amount,
    case when v_coin_id = 2 then 'USD' else 'ILS' end,
    jsonb_build_object(
      'kind', 'payment',
      'label', 'כרטיס אשראי',
      'cardLastDigits', v_card_last4,
      'cardType', v_card_brand,
      'transactionReference', v_internal_deal_number,
      'lowProfileCode', v_low_profile_code
    )
  );

  -- Finalize AFTER line items are inserted
  update public.documents
  set
    document_status = 'final',
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

revoke all on function public.issue_paid_checkout_document_service(uuid, uuid) from public;
revoke all on function public.issue_paid_checkout_document_service(uuid, uuid) from anon;
revoke all on function public.issue_paid_checkout_document_service(uuid, uuid) from authenticated;
grant execute on function public.issue_paid_checkout_document_service(uuid, uuid) to service_role;

commit;

select pg_notify('pgrst', 'reload schema');


-- ====================================================
-- 055 - Service-only issuance: paid checkout -> VOW document
-- ====================================================
-- Purpose:
-- - Privileged server-only issuance path (SECURITY DEFINER)
-- - Idempotent: retries never create duplicate documents or consume new numbers
-- - Safe numbering fallback for VOW billing company (start at 1000)
--
-- Contract:
-- - Callable ONLY by service_role (checked via JWT claims / auth.role())
-- - Requires checkout_sessions.status = 'paid'
-- - Issues a 'receipt' document under issuer company and links via billing_documents
-- ====================================================

begin;

create extension if not exists pgcrypto;

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

  v_amount numeric;
  v_coin_id int;
  v_low_profile_code text;
  v_internal_deal_number text;

  v_seq record;
  v_next_number integer;
  v_prefix text;

  v_doc_id uuid;
  v_doc_number text;
begin
  if p_checkout_session_id is null or p_issuer_company_id is null then
    raise exception 'missing_params';
  end if;

  -- --------------------------------------------------
  -- Service-role only guard
  -- --------------------------------------------------
  v_role := null;
  begin
    v_role := auth.role();
  exception
    when undefined_function then
      v_role := null;
  end;

  if v_role is null then
    begin
      v_role := (current_setting('request.jwt.claims', true)::jsonb ->> 'role');
    exception
      when others then
        v_role := null;
    end;
  end if;

  if v_role is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;

  -- Serialize issuance per checkout session (prevents double numbering on concurrency)
  perform pg_advisory_xact_lock(hashtextextended('issue_paid_checkout_document_service:' || p_checkout_session_id::text, 0));

  -- --------------------------------------------------
  -- Idempotency: if already linked, return existing
  -- --------------------------------------------------
  select bd.document_id, d.document_number
    into v_existing_document_id, v_existing_document_number
  from public.billing_documents bd
  join public.documents d on d.id = bd.document_id
  where bd.checkout_session_id = p_checkout_session_id;

  if v_existing_document_id is not null then
    return query select true, v_existing_document_id, v_existing_document_number;
    return;
  end if;

  -- --------------------------------------------------
  -- Load + lock checkout session
  -- --------------------------------------------------
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

  select c.company_name
    into v_buyer_company_name
  from public.companies c
  where c.id = v_buyer_company_id;

  if v_buyer_company_name is null then
    v_buyer_company_name := 'לקוח';
  end if;

  -- --------------------------------------------------
  -- Ensure numbering series exists for issuer company
  -- --------------------------------------------------
  -- receipt
  insert into public.document_sequences (
    company_id,
    document_type,
    prefix,
    starting_number,
    current_number,
    is_locked,
    locked_at
  )
  values (
    p_issuer_company_id,
    'receipt',
    '',
    1000,
    999,
    true,
    now()
  )
  on conflict (company_id, document_type) do nothing;

  -- invoice_receipt (defensive; may be needed later)
  insert into public.document_sequences (
    company_id,
    document_type,
    prefix,
    starting_number,
    current_number,
    is_locked,
    locked_at
  )
  values (
    p_issuer_company_id,
    'invoice_receipt',
    '',
    1000,
    999,
    true,
    now()
  )
  on conflict (company_id, document_type) do nothing;

  -- Lock receipt sequence and compute next number
  select *
    into v_seq
  from public.document_sequences
  where company_id = p_issuer_company_id and document_type = 'receipt'
  for update;

  if not found then
    raise exception 'sequence_missing_for_receipt';
  end if;

  -- Force lock (MVP safety)
  if v_seq.is_locked is distinct from true then
    update public.document_sequences
    set is_locked = true, locked_at = now()
    where id = v_seq.id;
  end if;

  -- Ensure starting number is >= 1000
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

  -- --------------------------------------------------
  -- Create receipt document under issuer company
  -- --------------------------------------------------
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
    'receipt',
    'final',
    v_doc_number,
    current_date,
    v_amount,
    v_amount,
    case when v_coin_id = 2 then 'USD' else 'ILS' end,
    v_buyer_company_name,
    'checkout_session:' || p_checkout_session_id::text,
    'paid',
    v_amount,
    0,
    0,
    now(),
    null
  )
  returning id into v_doc_id;

  -- Single payment line item for receipt
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
    'Cardcom',
    current_date,
    v_amount,
    1,
    v_amount,
    case when v_coin_id = 2 then 'USD' else 'ILS' end,
    jsonb_build_object(
      'provider', 'cardcom',
      'checkoutSessionId', p_checkout_session_id::text,
      'buyerCompanyId', v_buyer_company_id::text,
      'lowProfileCode', v_low_profile_code,
      'internalDealNumber', v_internal_deal_number
    )
  );

  -- Link checkout -> document (idempotent unique constraint)
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

  -- If a concurrent insert somehow won, return the canonical row (still idempotent)
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

commit;

select pg_notify('pgrst', 'reload schema');


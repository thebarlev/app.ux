-- ====================================================
-- 060 - Service-only issuance: renewal -> VOW invoice_receipt
-- ====================================================
-- Purpose:
-- - Issue a VOW accounting document for a successful renewal charge
-- - Document type: invoice_receipt
-- - Two line items:
--   A) Monthly package
--   B) Overage (only if overage_units > 0)
-- - Idempotent: uses billing_renewal_events.issued_document_id + advisory lock
-- - Numbering fallback: ensure document_sequences exists (start 1000)
-- ====================================================

begin;

create extension if not exists pgcrypto;

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
  v_ev public.billing_renewal_events%rowtype;
  v_plan public.plans%rowtype;
  v_company_name text;

  v_seq record;
  v_next_number integer;
  v_prefix text;
  v_doc_number text;
  v_doc_id uuid;

  v_overage_total numeric;
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

  perform pg_advisory_xact_lock(hashtextextended('issue_renewal_invoice_receipt_service:' || p_company_id::text || ':' || p_period_start::text, 0));

  -- Load renewal event (must exist)
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

  if v_ev.issued_document_id is not null then
    select d.document_number into v_doc_number
    from public.documents d
    where d.id = v_ev.issued_document_id;
    return query select true, v_ev.issued_document_id, v_doc_number;
    return;
  end if;

  -- Load plan
  select * into v_plan
  from public.plans p
  where p.id = v_ev.plan_id;

  if not found then
    raise exception 'plan_missing';
  end if;

  -- Buyer company display name
  select c.company_name into v_company_name
  from public.companies c
  where c.id = p_company_id;
  if v_company_name is null then v_company_name := 'לקוח'; end if;

  -- Ensure numbering series exists (invoice_receipt)
  insert into public.document_sequences (
    company_id, document_type, prefix, starting_number, current_number, is_locked, locked_at
  )
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
    'invoice_receipt',
    'final',
    v_doc_number,
    current_date,
    v_ev.total_amount,
    v_ev.total_amount,
    'ILS',
    v_company_name,
    'renewal:' || p_company_id::text || ':' || p_period_start::text,
    'paid',
    v_ev.total_amount,
    0,
    0,
    now(),
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
    'חבילה חודשית ' || coalesce(v_plan.name, v_ev.plan_id),
    current_date,
    v_ev.base_amount,
    1,
    v_ev.base_amount,
    'ILS',
    jsonb_build_object(
      'kind', 'subscription_base',
      'planId', v_ev.plan_id,
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


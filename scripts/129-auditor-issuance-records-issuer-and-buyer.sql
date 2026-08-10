-- ====================================================
-- 129 - The correct auditor issuance function records who issued and who bought
-- ====================================================
-- Half of stage 0א. The other half is one line in
-- app/api/auditor/billing/renewals/run/route.ts, in the same commit, and neither
-- half is correct alone.
--
-- ── THE PAIR, AND WHY IT IS A PAIR ──────────────────────────────────────────
-- public.issue_auditor_charge_invoice_receipt_service exists under two signatures.
-- PostgreSQL selects by arity:
--
--   (uuid, uuid)           a SQL wrapper delegating to ..._service_impl
--                          documents.company_id = v_charge.company_id  ⛔ the BUYER
--                          number drawn from p_issuer_company_id's sequence
--                          writes auditor_invoice_documents             ✅
--
--   (uuid, uuid, boolean)  this function
--                          documents.company_id = p_issuer_company_id  ✅
--                          writes auditor_invoice_documents             ❌ never
--
-- The renewals route omitted the third argument and therefore ran the broken one.
-- Adding `p_is_en: false` moves it to this function — and that alone would trade a
-- bug for blindness: ownership becomes correct and simultaneously unverifiable,
-- because the only cross-reference of who-issued-vs-who-bought stops being written.
--
-- So this migration adds that write here. Correct AND observable, or neither.
--
-- ── WHAT THE DETECTION QUERY IS, AND WHY IT MATTERS ─────────────────────────
--   select d.document_number, d.company_id as stamped_on, aid.issuer_company_id
--   from public.auditor_invoice_documents aid
--   join public.documents d on d.id = aid.document_id
--   where d.company_id is distinct from aid.issuer_company_id;
--
-- Every row is a document stamped on the wrong dealer. Run against the pre-reset
-- evidence (154 documents, 14 links) it returns ZERO — the defect never fired,
-- because every auditor charge so far had issuer == buyer: the company subscribing
-- to its own product, so both expressions returned the same uuid.
--
-- That is luck, not safety. It fires on the first genuine third-party subscriber,
-- on their first document.
--
-- public.auditor_invoice_documents is EMPTY in production after the 2026-08-10
-- reset. Without this migration it never refills, and the query above can never
-- answer anything again.
--
-- ── HOW THIS FILE WAS PRODUCED ──────────────────────────────────────────────
-- `create or replace function` cannot patch a body, so the function is restated.
-- The body below is scripts/085-auditor-en-invoice-no-vat.sql lines 13-385 COPIED
-- VERBATIM with one mechanical insertion, verified by diff. The diff is pure
-- addition — four executable lines and their comment — with zero deletions and
-- zero modifications.
--
-- scripts/085 was confirmed to match the live definition before it was used as the
-- source: 21 declared variables in the same names and order, and every distinctive
-- string present (v_doc_type, cols_vals_mismatch, quote_nullable(v_company_tax_id),
-- the advisory-lock key, both line-item descriptions, the EN tax_invoice branch).
-- auditor_invoice_documents appears zero times in it, which is the gap this fills.
-- Comparison was by derived markers against a pasted pg_get_functiondef, not a byte
-- diff — the pasted text reaches this file as transcription, and transcription is
-- not a copy.
--
-- ── THE TWO GUARDS ARE CARRIED ACROSS AS THEY STAND ─────────────────────────
--   on conflict (document_id) do nothing   REQUIRED. This function is idempotent by
--                                          reference_text and can be re-entered for
--                                          the same charge.
--   if to_regclass(...) is not null        Kept so the diff carries a single intent,
--                                          and because the table can be absent in a
--                                          local database.
--
-- ⚠️ The second one is a silent skip: drop the table and this write vanishes with no
-- error, taking the detection query with it. That is the same pattern removed from
-- lib/auditor/billing/env.ts. It is RECORDED, not changed — changing it here would
-- make this a two-intent diff on a billing function. It falls the next time this
-- function is touched.
--
-- ── NOT IN THIS MIGRATION, DELIBERATELY ─────────────────────────────────────
-- The broken wrapper and _impl are NOT dropped here. A DROP does not travel with a
-- behaviour change: if something turns out wrong after the merge, the revert should
-- restore behaviour, not require restoring functions from pasted text. They are
-- dropped in a separate branch, and only after this path has been observed issuing
-- one document correctly — in public.documents AND in
-- public.auditor_invoice_documents.
--
-- A useful side effect of that later drop: once the two-argument overload is gone, a
-- two-argument call resolves to this function through p_is_en's default. The
-- landmine inverts from "silently broken" to "silently correct".
--
-- ── NUMBERING ───────────────────────────────────────────────────────────────
-- 129 because scripts/121-128 exist on the unmerged regulatory/bkmv-spec branch
-- (customer register). This file is on a branch off main and must not collide.
-- ====================================================

begin;

create extension if not exists pgcrypto;

create or replace function public.issue_auditor_charge_invoice_receipt_service(
  p_auditor_charge_id uuid,
  p_issuer_company_id uuid,
  p_is_en boolean default false
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
  v_vat_rate numeric;
  v_vat_amount numeric;
  v_doc_type text;
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

  v_total := coalesce(v_charge.amount, 0);

  -- EN flow: tax_invoice without VAT (חשבונית מס ללא מע״מ)
  -- Hebrew flow: invoice_receipt with VAT
  if p_is_en then
    v_doc_type := 'tax_invoice';
    v_vat_rate := 0;
    v_vat_amount := 0;
    v_subtotal := v_total;
  else
    v_doc_type := 'invoice_receipt';
    v_vat_rate := 18;
    v_subtotal := round((v_total / (1 + (v_vat_rate / 100)))::numeric, 2);
    v_vat_amount := round((v_total - v_subtotal)::numeric, 2);
  end if;

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

  -- Ensure numbering series exists (invoice_receipt or tax_invoice per flow)
  if to_regclass('public.document_sequences') is not null then
    insert into public.document_sequences (
      company_id, document_type, prefix, starting_number, current_number, is_locked, locked_at
    )
    values (p_issuer_company_id, v_doc_type, '', 1000, 999, true, now())
    on conflict (company_id, document_type) do nothing;

    select *
      into v_seq
    from public.document_sequences
    where company_id = p_issuer_company_id and document_type = v_doc_type
    for update;

    if not found then
      raise exception 'sequence_missing_for_%', v_doc_type;
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

  -- Build dynamic INSERT for documents (only existing columns)
  v_cols := array[]::text[];
  v_vals := array[]::text[];

  v_cols := array_append(v_cols, 'company_id');
  v_vals := array_append(v_vals, quote_literal(p_issuer_company_id));

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='document_type') then
    v_cols := array_append(v_cols, 'document_type');
    v_vals := array_append(v_vals, quote_literal(v_doc_type));
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='document_number') then
    v_cols := array_append(v_cols, 'document_number');
    v_vals := array_append(v_vals, quote_literal(v_doc_number));
  end if;

  if v_status_col is not null then
    v_cols := array_append(v_cols, v_status_col);
    v_vals := array_append(v_vals, quote_literal(case when v_status_col = 'status' then 'open' else 'draft' end));
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
    v_vals := array_append(v_vals, quote_nullable(v_company_tax_id));
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

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='finalized_by') then
    v_cols := array_append(v_cols, 'finalized_by');
    v_vals := array_append(v_vals, 'null');
  end if;

  -- Defensive: ensure cols and vals are in sync
  if array_length(v_cols, 1) is distinct from array_length(v_vals, 1) then
    raise exception 'cols_vals_mismatch: cols=% vals=%', array_length(v_cols, 1), array_length(v_vals, 1);
  end if;

  v_sql := 'insert into public.documents (' || array_to_string(v_cols, ',') || ') values (' || array_to_string(v_vals, ',') || ') returning id';
  execute v_sql into v_doc_id;

  if p_is_en then
    update public.documents set language = 'en' where id = v_doc_id;
  end if;

  -- Line item: plan / period (must be inserted while document is draft)
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
    case when p_is_en then 'Auditor subscription – ' || v_plan_name else 'מנוי /auditor – ' || v_plan_name end,
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

  -- Finalize document
  if v_status_col = 'document_status' then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='finalized_at') then
      update public.documents set document_status = 'final', finalized_at = now() where id = v_doc_id;
    else
      update public.documents set document_status = 'final' where id = v_doc_id;
    end if;
  elsif v_status_col = 'status' then
    update public.documents set status = 'closed' where id = v_doc_id;
  end if;

  update public.auditor_subscription_charges
  set issued_invoice_id = v_doc_id
  where id = p_auditor_charge_id;

  -- Cross-reference row: who issued, who bought, which charge.
  --
  -- Copied verbatim from ..._service_impl, which is the ONLY place this was ever
  -- written. That function stamps documents.company_id with the buyer — the defect
  -- this migration's companion change routes around — yet it records the correct
  -- intent here: issuer_company_id = the issuer, buyer_company_id = the buyer. That
  -- contradiction is what made the misplacement detectable at all:
  --
  --   select … from auditor_invoice_documents aid join documents d on d.id = aid.document_id
  --   where d.company_id is distinct from aid.issuer_company_id;
  --
  -- Without this insert, moving the live path onto this function would trade a bug
  -- for blindness: ownership becomes correct and simultaneously unverifiable. The
  -- table is already empty in production after the 2026-08-10 reset, so if this did
  -- not land it would never refill.
  --
  -- Both guards are carried across as they stand. `on conflict (document_id) do
  -- nothing` is required: this function is idempotent by reference_text and can be
  -- re-entered for the same charge. `to_regclass` is kept to keep this diff to a
  -- single intent and because the table may be absent in a local database — but it
  -- means that if the table is ever dropped, this write disappears SILENTLY and the
  -- detection query dies with it. That is the same silent-skip pattern removed from
  -- env.ts; it is recorded rather than changed here, and falls the next time this
  -- function is touched.
  if to_regclass('public.auditor_invoice_documents') is not null then
    insert into public.auditor_invoice_documents (document_id, issuer_company_id, buyer_company_id, charge_id)
    values (v_doc_id, p_issuer_company_id, v_charge.company_id, p_auditor_charge_id)
    on conflict (document_id) do nothing;
  end if;

  select d.document_number into v_existing_doc_number
  from public.documents d
  where d.id = v_doc_id;

  return query select true, v_doc_id, v_existing_doc_number;
  return;
end;
$$;

revoke all on function public.issue_auditor_charge_invoice_receipt_service(uuid, uuid, boolean) from public;
revoke all on function public.issue_auditor_charge_invoice_receipt_service(uuid, uuid, boolean) from anon;
revoke all on function public.issue_auditor_charge_invoice_receipt_service(uuid, uuid, boolean) from authenticated;
grant execute on function public.issue_auditor_charge_invoice_receipt_service(uuid, uuid, boolean) to service_role;

commit;

select pg_notify('pgrst', 'reload schema');

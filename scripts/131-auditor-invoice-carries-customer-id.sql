-- ====================================================
-- 131 - The auditor invoice carries customer_id  (wiring, path 6 of 7)
-- ====================================================
-- The auditor issuance path writes customer_name and customer_tax_id but never
-- customer_id. Every other issuing path was wired for this; the auditor path and one
-- other are the two that were not, and it is now on the critical path because the
-- checkout being built this week issues through it.
--
-- Why it matters, in one number. This measure guards the uniform file:
--
--   select count(*) from public.documents
--   where document_status <> 'draft' and customer_id is null;
--
-- Its baseline is 1 — document 1157, from before the wiring — and the condition is
-- that it does not grow. Without this migration the first real auditor invoice takes
-- it to 2, and the fix would then mean editing an issued tax document. An issued
-- document is not deleted; 154 were cleared on 2026-08-10 precisely to avoid being in
-- that position.
--
-- ── HOW THIS FILE WAS PRODUCED ──────────────────────────────────────────────
-- `create or replace function` cannot patch a body, so the function is restated.
-- The body is scripts/129's THREE-ARGUMENT function, copied by script and not
-- retyped, with four mechanical edits. Measured against 129's executable lines the
-- diff is 39 added lines and exactly 2 modified — and no logic removed anywhere.
--
--   1. declare v_company_email and v_customer_id            (added)
--   2. load c.email alongside the buyer's name and tax id    (MODIFIED — 2 lines)
--   3. call public.resolve_customer(...) after the 'לקוח' fallback   (added)
--   4. append customer_id to the dynamic column list         (added)
--
-- Edit 2 is the only one that rewrites existing lines, and it cannot be an addition:
-- a third value has to join both the select list and the into list. The before and
-- after, in full, so the change can be checked by eye:
--
--   129:  select c.company_name, coalesce(c.registration_number, c.tax_id)
--           into v_company_name, v_company_tax_id
--
--   131:  select c.company_name, coalesce(c.registration_number, c.tax_id), c.email
--           into v_company_name, v_company_tax_id, v_company_email
--
-- The from and where clauses underneath are untouched.
--
-- ── THE TWO-ARGUMENT WRAPPER AND _impl ARE NOT TOUCHED ──────────────────────
-- They are still scheduled for removal, and still waiting on one observed successful
-- issuance. They remain unwired for customer_id: nothing calls them now that
-- renewals/run passes p_is_en, and wiring a path that is about to be dropped would
-- be work with a negative lifespan. Recorded, not fixed.
--
-- ROLLBACK: scripts/131-ROLLBACK.sql. Open it in a second tab BEFORE running this.
-- ====================================================

-- ── INSTALL GUARD ───────────────────────────────────────────────────────────
-- Refuse to install if the resolver is absent.
--
-- public.resolve_customer lives in migration 124, which is applied in production but
-- whose file is not on main. If this function were installed while the resolver were
-- missing, every issuance would fail at runtime — on a customer who has already been
-- charged. The failure belongs here, in the window, in front of us.
do $$
begin
  if to_regprocedure('public.resolve_customer(uuid,text,text,text)') is null then
    raise exception '131: resolve_customer(uuid,text,text,text) is missing — refusing to install a path that would issue documents without customer_id';
  end if;
end $$;

begin;

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
  v_company_email text;
  v_customer_id uuid;
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
  select c.company_name, coalesce(c.registration_number, c.tax_id), c.email
    into v_company_name, v_company_tax_id, v_company_email
  from public.companies c
  where c.id = v_charge.company_id;
  if v_company_name is null then v_company_name := 'לקוח'; end if;

  /*
   * The buyer's row in the issuer's customer register.
   *
   * Placed immediately after the 'לקוח' fallback, and that position is the only
   * correct one — scripts/127 makes the same argument for the VOW path: 'לקוח' is
   * one of the literals public.is_placeholder_customer_name refuses to match on, so
   * a buyer with no company name gets a customer row of its own instead of being
   * merged with every other nameless buyer. Resolving before the fallback would
   * pass a NULL name, which lands on the same rule by a less legible route.
   *
   * ⚠️ NO `exception when others then v_customer_id := null` HERE, and that is a
   * deliberate departure from scripts/127.
   *
   * 127 swallows, on the argument that the buyer has already paid and a paid
   * checkout with no document is worse than a document with a null customer_id. For
   * this path that trade runs the other way:
   *
   *   - A charge with no document is REPAIRABLE. It is re-entrant by
   *     reference_text, the function returns the existing document if one is already
   *     linked, and app/api/admin/auditor/repair-missing-invoices exists precisely
   *     to re-drive it.
   *   - A document with a null customer_id is NOT repairable without editing an
   *     issued tax document, and it breaks the uniform-file measure that must stay
   *     at its baseline of 1.
   *
   * So this fails loudly and the document is issued on a later attempt, rather than
   * quietly issuing a document that cannot be filed. The install guard at the top of
   * this file removes the failure mode 127's handler was really hiding — a missing
   * resolve_customer — by refusing to install at all in that case.
   */
  v_customer_id := public.resolve_customer(
    p_issuer_company_id, v_company_name, v_company_tax_id, v_company_email
  );

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

  -- The whole point of 131. quote_nullable, not quote_literal: a resolver that
  -- legitimately returns no row must write NULL rather than the string 'null'.
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='customer_id') then
    v_cols := array_append(v_cols, 'customer_id');
    v_vals := array_append(v_vals, quote_nullable(v_customer_id::text));
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

-- ── WHICH FILE JUST RAN ─────────────────────────────────────────────────────
-- 130 and its rollback used to end identically and the rollback was run by accident
-- twice. Every migration carries this pair now. Keep it last.
select '✅ 131 APPLIED' as result;

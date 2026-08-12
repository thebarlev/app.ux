-- ============================================================================
-- 136 · Two fixes on the auditor invoice, and nothing else
-- ============================================================================
--
-- Both were found by opening a real PDF that a paying customer would have received.
--
-- ── 1 · THE PRODUCT NAME WAS A URL PATH ─────────────────────────────────────
--
-- The line read `מנוי auditor/ – בסיסי` on a tax document. The slash is not a stray
-- glyph: the source literal is `'מנוי /auditor – '`, someone wrote the URL path as the
-- product name, and RTL moves the slash to the other side when rendered. The English
-- branch was always correct (`Auditor subscription – `); only Hebrew was wrong.
--
--     'מנוי /auditor – '  ->  'מנוי אודיטור – '
--
-- ── 2 · THE DOCUMENT SAID "קבלה" AND HAD NO RECEIPT ─────────────────────────
--
-- invoice_receipt is both halves — invoice AND receipt — and only the invoice half was
-- ever written. The template does render a payment section: pdf-service builds it from
-- line items where payment_metadata->>'kind' = 'payment', and says so itself
-- ("Payments are stored in document_line_items, not in doc.payment_metadata"). It found
-- none, so the customer got a document with no record of what they paid with.
--
-- scripts/069 and scripts/071 write that row for the VOW checkout path. The auditor path
-- never did. This is not a template gap and not a PDF gap — one missing row.
--
-- ⛔ The structure is COPIED from scripts/071, not invented: line_number 90, description
-- 'כרטיס אשראי', and the same seven payment_metadata keys in the same shape. A second
-- shape for one concept renders differently for no reason and diverges the moment either
-- side is touched.
--
-- The card details come from raw_charge_response — ExtShvaParams.CardNumber5,
-- ExtShvaParams.CardName, Mutag24, InternalDealNumber — which the Cardcom allow-list
-- keeps deliberately, precisely so this stays possible after the token was stripped.
-- Both stored shapes are read: the checkout path nests under "indicator", the renewal
-- path is flat.
--
-- ⚠️ The row is written only when a last-4 is actually present. A payment line claiming
-- a card with no digits looks like a complete receipt and says nothing, which is worse
-- than the invoice half standing alone.
--
-- ── WHAT IS NOT IN HERE ─────────────────────────────────────────────────────
--
-- The PDF footer's `Dsign של VOW` — stored reversed as `ngisD של WOV` for RTL, with the
-- `e` dropped in the reversal — lives in lib/pdf/footer-text.ts and is stamped onto EVERY
-- document this system produces, including real ones for other businesses. Out of scope
-- here on purpose.
--
-- ── ⚠️ THE BODY, AND HOW ITS PROVENANCE IS CHECKED ──────────────────────────
--
-- 133's body is the base, because 133 was itself generated from pg_get_functiondef on the
-- live database and then applied — so production's current body IS that file's body. That
-- is a reasonable inference, not a measurement, so it is not taken on trust: the guard
-- below reads the INSTALLED definition and refuses unless it is what this migration was
-- written against. One line changed, ninety-nine added, verified by diff.
-- ============================================================================

begin;

-- ── the body this migration was written against must be the one installed ────
do $guard$
declare
  def text;
begin
  if to_regprocedure('public.issue_auditor_charge_invoice_receipt_service(uuid,uuid,boolean)') is null then
    raise exception '136: the three-argument overload is not installed.';
  end if;

  def := pg_get_functiondef(to_regprocedure('public.issue_auditor_charge_invoice_receipt_service(uuid,uuid,boolean)'));

  -- 133 must already be in place. Without its pragma the body throws 42702 on every
  -- call, and replacing it here would silently carry that defect forward.
  if position('#variable_conflict use_column' in def) = 0 then
    raise exception '136: the installed body does not carry 133''s pragma. Not the body this was written against.';
  end if;

  -- The string 136 exists to replace must still be there. If it is not, either 136 has
  -- already run or the body has moved on, and overwriting it would discard whatever
  -- changed in between.
  if position('מנוי /auditor' in def) = 0 then
    raise exception '136: the old Hebrew product name is not present. Either 136 already ran, or the installed body is not 133''s.';
  end if;

  -- And the receipt half must not already exist, or this would write a second one.
  if position('''kind'', ''payment''' in def) <> 0 then
    raise exception '136: a payment line item already exists in the installed body.';
  end if;
end
$guard$;

CREATE OR REPLACE FUNCTION public.issue_auditor_charge_invoice_receipt_service(p_auditor_charge_id uuid, p_issuer_company_id uuid, p_is_en boolean DEFAULT false)
 RETURNS TABLE(ok boolean, document_id uuid, document_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
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

  -- The receipt half. Read from the charge's stored Cardcom response, which the
  -- allow-list in lib/auditor/billing/cardcom.ts deliberately keeps these fields in.
  v_ind jsonb;
  v_card_last4 text;
  v_card_brand text;
  v_internal_deal text;
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
    case when p_is_en then 'Auditor subscription – ' || v_plan_name else 'מנוי אודיטור – ' || v_plan_name end,
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

  /*
   * ── THE RECEIPT HALF ──────────────────────────────────────────────────────
   *
   * The document says "חשבונית מס קבלה" — invoice AND receipt — and only the invoice
   * half was ever written. The template does render a payment section: pdf-service
   * builds it from line items where payment_metadata->>'kind' = 'payment' (see its own
   * comment, "Payments are stored in document_line_items, not in doc.payment_metadata").
   * It found none here, so a paying customer received a document missing what they paid
   * with. scripts/069 and scripts/071 write this row for the VOW checkout path; the
   * auditor path never did.
   *
   * ⛔ Structure copied from scripts/071 rather than invented: line_number 90,
   * description 'כרטיס אשראי', and the same seven payment_metadata keys in the same
   * shape. A second shape for the same concept would render differently for no reason
   * and diverge the moment either is touched.
   *
   * Inserted here, before finalization, for the same reason the subscription line is —
   * line items go in while the document is still a draft.
   *
   * ── WHERE THE CARD DETAILS COME FROM ──────────────────────────────────────
   * raw_charge_response, which the Cardcom allow-list keeps ExtShvaParams.CardNumber5,
   * ExtShvaParams.CardName, Mutag24 and InternalDealNumber in — precisely so a
   * reconciliation and this row remain possible after the token was stripped. The
   * checkout path nests the response under "indicator"; the renewal path stores it flat,
   * so both shapes are read.
   *
   * ⚠️ Written only when a last-4 is actually available. A payment row claiming a card
   * with no digits is worse than no row: it looks like a complete receipt and tells the
   * reader nothing. Absent details mean the invoice half stands alone, which is what
   * happens today and is at least not misleading.
   */
  v_ind := coalesce(v_charge.raw_charge_response -> 'indicator', v_charge.raw_charge_response);

  if v_ind is not null and jsonb_typeof(v_ind) = 'object' then
    v_card_last4 := coalesce(
      v_ind ->> 'ExtShvaParams.CardNumber5',
      v_ind ->> 'CardNumEnd',
      v_ind ->> 'CardLast4'
    );
    -- The readable product name first; Mutag24 is a numeric brand CODE, useful only as
    -- a fallback, and 'כרטיס אשראי' rather than a bare digit if that is all there is.
    v_card_brand := coalesce(
      v_ind ->> 'ExtShvaParams.CardName',
      v_ind ->> 'CardBrand',
      v_ind ->> 'ExtShvaParams.Mutag24',
      v_ind ->> 'Mutag'
    );
    v_internal_deal := coalesce(
      v_ind ->> 'InternalDealNumber',
      v_ind ->> 'ExtShvaParams.InternalDealNumber',
      v_charge.provider_internal_deal_number
    );
  end if;

  if coalesce(v_card_last4, '') <> '' then
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
      v_total,
      1,
      v_total,
      coalesce(v_charge.currency, 'ILS'),
      jsonb_build_object(
        'kind', 'payment',
        'label', 'כרטיס אשראי',
        'sku', v_internal_deal,
        'details', null,
        'cardLastDigits', v_card_last4,
        'cardType', coalesce(v_card_brand, 'כרטיס אשראי'),
        'transactionReference', v_internal_deal
      )
    );
  else
    raise notice 'auditor invoice %: no card digits in raw_charge_response, receipt half omitted', v_doc_number;
  end if;

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
$function$;;

commit;

-- Run separately after the commit. Expect the new name and one payment line per invoice:
--
--   select li.line_number, li.description, li.payment_metadata->>'kind' as kind,
--          li.payment_metadata->>'cardLastDigits' as last4,
--          li.payment_metadata->>'cardType' as brand
--     from public.document_line_items li
--    where li.document_id = '<the next auditor invoice>'::uuid
--    order by li.line_number;
--
-- ⚠️ Existing invoices 1000-1003 are NOT changed by this file. It fixes the function, not
-- the rows it already wrote. Their PDFs are already in storage and would need
-- regenerating after their line items are corrected — a separate decision.

select '136-auditor-invoice-name-and-receipt-half.sql applied' as migration;

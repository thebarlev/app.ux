-- ============================================================================
-- 132 · Reduce stored Cardcom responses to a named allow-list
-- ============================================================================
--
-- WHAT WENT WRONG
--
-- The card token is the instrument that charges the card. It is stored encrypted in
-- auditor_customer_payment_methods, with a hash for lookup — and the same pass wrote
-- the raw Cardcom response, token included, in clear text into two neighbouring
-- tables. Anyone with read access to either one had the token without touching the
-- encrypted column, so the encryption protected nothing.
--
-- Three storage sites, all fixed in code alongside this file:
--   auditor_subscription_charges.raw_charge_response   (checkout indicator, {"indicator": {...}})
--   auditor_subscription_charges.raw_charge_response   (renewal charge, flat object)
--   auditor_checkout_sessions.raw_indicator_json       (flat object)
--
-- Code stops the leak going forward. This file removes what is already there — 16 rows
-- carry a stored response, not the two found first.
--
-- ⛔ AN ALLOW-LIST, NOT A DELETE-LIST, AND THAT IS THE POINT
--
-- The first version of this deleted two named keys. Cardcom returns the token under
-- FOUR names and the personal fields under six more, so that version would have run
-- clean while leaving the token in place under two aliases. It was not a near miss;
-- it was demonstrated, and it is the argument for inverting the logic: you cannot
-- enumerate in advance what a third party sends.
--
-- So this keeps what is named and drops everything else. A field Cardcom adds next
-- year is discarded because nobody named it, rather than kept because nobody thought
-- of it. It mirrors CARDCOM_KEEP_KEYS in lib/auditor/billing/cardcom.ts.
--
-- The cost of an allow-list is throwing away something that mattered, so the NAMES of
-- everything dropped are written to a "dropped_keys" array in the same JSON. Names
-- only, never values: you can see that Cardcom sent a field and that we discarded it,
-- without holding what was in it.
--
-- ⚠️ The keep list is built from what our code reads plus the categories agreed as
-- safe. It is NOT built from reading the stored JSON. So it is probably incomplete,
-- and dropped_keys is how that gets discovered — treat the first rows' dropped_keys as
-- a to-do list, not a clean bill of health.
--
-- KEPT: deal and terminal identifiers · approval codes · every response code · card
-- brand and product name · BIN and last digits · amounts and instalment structure ·
-- token expiry · date · lowprofilecode · ReturnValue · CallIndicatorResponse.
--
-- Two of those are judgement calls rather than obvious. The token expiry is what lets
-- us warn a subscriber BEFORE a renewal fails, and it charges nothing on its own once
-- the token is gone. The BIN is permitted by PCI-DSS alongside the last four, and a
-- chargeback enquiry starts from the issuing bank, which is what the BIN names.
--
-- ⛔ THIS IS NOT REVERSIBLE, AND THAT IS THE POINT
--
-- 132-ROLLBACK.sql exists and is deliberately a no-op. The plaintext is destroyed
-- here; there is nowhere to restore it from and it must not come back. Live
-- subscriptions are unaffected — charging reads the encrypted token in
-- auditor_customer_payment_methods, never these columns.
--
-- Idempotent. Running it twice is harmless.
-- ============================================================================

begin;

-- ── install-guard: this file creates neither table ───────────────────────────
do $guard$
begin
  if to_regclass('public.auditor_subscription_charges') is null then
    raise exception '132 requires public.auditor_subscription_charges (scripts/081). Run 081 first.';
  end if;
  if to_regclass('public.auditor_checkout_sessions') is null then
    raise exception '132 requires public.auditor_checkout_sessions (scripts/081). Run 081 first.';
  end if;
end
$guard$;

-- pg_temp on purpose: session-scoped, so this helper cannot survive the migration and
-- be found later by someone who assumes it is part of the schema.
create function pg_temp.keep_cardcom(j jsonb) returns jsonb
language plpgsql as $fn$
declare
  k        text;
  v        jsonb;
  kept     jsonb := '{}'::jsonb;
  dropped  text[] := array[]::text[];

  -- Names Cardcom may return the token or a person under. Checked FIRST, so a key
  -- cannot be readmitted by also appearing in the keep list by mistake.
  never text[] := array[
    'token',
    'extshvaparams.cardtoken',
    'extshvaparams.cardtoken_15',
    'tokentocharge.token',
    'cardownerid',
    'extshvaparams.cardholderidentitynumber',
    'cardownername',
    'extshvaparams.cardownername',
    'cardowneremail',
    'cardownerphone',
    'extshvaparams.cardownerphone'
  ];

  -- Kept verbatim. Lower-cased, because Cardcom is inconsistent about casing.
  keep text[] := array[
    -- transaction and terminal identity
    'internaldealnumber','dealnumber','tranzactionid','transactionid',
    'terminalnumber','terminal',
    'lowprofilecode','lowprofilecode','returnvalue',
    'callindicatorresponse',
    -- outcome
    'responsecode','operationresponse','operationresponsetext',
    'dealresponse','returncode','description','status',
    -- approval
    'approvalnumber','extshvaparams.approvalnumber','signature',
    -- the card, without identifying anyone
    'mutag','mutag_24','mutag24','extshvaparams.mutag24',
    'cardname','cardbrand','extshvaparams.cardname',
    'cardnumstart','extshvaparams.firstcarddigits',
    'cardnumend','cardlast4','extshvaparams.cardnumber5',
    -- expiry — see the note above
    'tokenexdate','tokef_30','extshvaparams.tokef30',
    -- money and instalment structure
    'sum','sumtobill','amount','extshvaparams.sum36',
    'coinid','currency',
    'numofpayments','firstpayment','otherpayment','extshvaparams.numofpayments',
    -- when
    'dealdate','date','createdate'
  ];
begin
  if j is null or jsonb_typeof(j) <> 'object' then
    return j;
  end if;

  for k, v in select key, value from jsonb_each(j) loop
    -- Structural keys of our own making, not Cardcom's payload.
    if k = 'indicator' and jsonb_typeof(v) = 'object' then
      kept := kept || jsonb_build_object('indicator', pg_temp.keep_cardcom(v));
    elsif k in ('error', 'dropped_keys') then
      -- 'dropped_keys' is carried through so a second run is a no-op rather than
      -- dropping its own bookkeeping and recording that it did.
      kept := kept || jsonb_build_object(k, v);
    elsif lower(k) = any (never) then
      dropped := dropped || k;
    elsif lower(k) = any (keep)
       or k ~* '^ExtShvaParams\.(Sum|NumOfPayments|FirstPayment|OtherPayment|Mutag|ApprovalNumber|Tokef|FirstCardDigits|CardNumber5|CardName)'
       or k ~* 'ResponseCode$'
       or k ~* '^Deal(Date|Number|Response)$'
    then
      kept := kept || jsonb_build_object(k, v);
    else
      dropped := dropped || k;
    end if;
  end loop;

  -- Sorted so a diff between two charges is readable. Merged with anything a previous
  -- run recorded, so repeated runs accumulate rather than overwrite.
  if array_length(dropped, 1) is not null then
    kept := jsonb_set(
      kept,
      array['dropped_keys'],
      (select jsonb_agg(x order by x)
         from (select distinct unnest(dropped
                 || coalesce((select array_agg(e::text) from jsonb_array_elements_text(coalesce(j -> 'dropped_keys', '[]'::jsonb)) e), array[]::text[])
               ) as x) s)
    );
  end if;

  return kept;
end
$fn$;

-- ── count what we are about to change, so the run is auditable ───────────────
do $report$
declare
  n_charges  bigint;
  n_sessions bigint;
  n_total    bigint;
begin
  select count(*) into n_total
    from public.auditor_subscription_charges where raw_charge_response is not null;

  select count(*) into n_charges
    from public.auditor_subscription_charges
   where raw_charge_response is not null
     and pg_temp.keep_cardcom(raw_charge_response) <> raw_charge_response;

  select count(*) into n_sessions
    from public.auditor_checkout_sessions
   where raw_indicator_json is not null
     and pg_temp.keep_cardcom(raw_indicator_json) <> raw_indicator_json;

  raise notice '132 BEFORE: % charge row(s) hold a stored response; % of them change, plus % checkout session(s)',
    n_total, n_charges, n_sessions;
end
$report$;

update public.auditor_subscription_charges
   set raw_charge_response = pg_temp.keep_cardcom(raw_charge_response)
 where raw_charge_response is not null
   and pg_temp.keep_cardcom(raw_charge_response) <> raw_charge_response;

update public.auditor_checkout_sessions
   set raw_indicator_json = pg_temp.keep_cardcom(raw_indicator_json)
 where raw_indicator_json is not null
   and pg_temp.keep_cardcom(raw_indicator_json) <> raw_indicator_json;

-- ── refuse to commit if anything survived ────────────────────────────────────
-- A redaction that reports success while leaving a token behind is the failure mode
-- this whole change is about. So it is verified inside the transaction, and a survivor
-- aborts rather than being written up as done.
do $verify$
declare
  leftover bigint;
begin
  select
    (select count(*) from public.auditor_subscription_charges
      where raw_charge_response is not null
        and pg_temp.keep_cardcom(raw_charge_response) <> raw_charge_response)
  + (select count(*) from public.auditor_checkout_sessions
      where raw_indicator_json is not null
        and pg_temp.keep_cardcom(raw_indicator_json) <> raw_indicator_json)
  into leftover;

  if leftover <> 0 then
    raise exception '132 FAILED: % row(s) still differ from the allow-list result. Nothing committed.', leftover;
  end if;

  raise notice '132 AFTER: every stored Cardcom response now matches the allow-list.';
end
$verify$;

commit;

-- Run separately after the commit. First query: expect zero rows.
--
--   select 'charges' as src, id from public.auditor_subscription_charges
--    where raw_charge_response::text ~* '"(Token|ExtShvaParams\.CardToken|ExtShvaParams\.CardToken_15|TokenToCharge\.Token|CardOwnerID|CardOwnerName|CardOwnerEmail|CardOwnerPhone)"'
--   union all
--   select 'sessions', id from public.auditor_checkout_sessions
--    where raw_indicator_json::text ~* '"(Token|ExtShvaParams\.CardToken|ExtShvaParams\.CardToken_15|TokenToCharge\.Token|CardOwnerID|CardOwnerName|CardOwnerEmail|CardOwnerPhone)"';
--
-- Second query: the to-do list. Every distinct field name that was discarded. Anything
-- in here worth keeping goes into CARDCOM_KEEP_KEYS, and the next charge keeps it.
--
--   select k, count(*) as rows
--     from public.auditor_subscription_charges c,
--          lateral jsonb_array_elements_text(
--            coalesce(c.raw_charge_response -> 'indicator' -> 'dropped_keys',
--                     c.raw_charge_response -> 'dropped_keys', '[]'::jsonb)) k
--    group by k order by k;

select '132-sanitise-stored-card-tokens.sql applied' as migration;

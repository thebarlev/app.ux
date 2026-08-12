-- ============================================================================
-- 132 · Remove card tokens and cardholder ID numbers already stored in clear text
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
--   auditor_subscription_charges.raw_charge_response   (checkout indicator, shape {"indicator": {...}})
--   auditor_subscription_charges.raw_charge_response   (renewal charge, flat object)
--   auditor_checkout_sessions.raw_indicator_json       (flat object)
--
-- Code stops the leak going forward. This file removes what is already there.
--
-- WHAT IS REDACTED, AND WHAT IS DELIBERATELY KEPT
--
-- Redacted — the four names Cardcom returns the token under, plus the cardholder's
-- Israeli ID number under both of its spellings. The four aliases are not a guess:
-- they are the same list extractTokenFromIndicator reads through, in
-- lib/auditor/billing/cardcom.ts, which is the authority on where a token can hide.
--
-- Kept on purpose — InternalDealNumber, the approval code, the card brand, the first
-- and last digits, the amount and the response codes. That is what a reconciliation
-- or a chargeback enquiry actually needs, and none of it can move money. Redacting a
-- payment record until it is undiagnosable trades one problem for another.
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

-- pg_temp on purpose: session-scoped, so this helper cannot survive the migration
-- and be found later by someone who assumes it is part of the schema.
create function pg_temp.redact_cardcom(j jsonb) returns jsonb
language plpgsql as $fn$
declare
  k    text;
  outj jsonb := j;
  keys text[] := array[
    -- the token, under every alias Cardcom uses
    'Token',
    'ExtShvaParams.CardToken',
    'ExtShvaParams.CardToken_15',
    'TokenToCharge.Token',
    -- the cardholder's ת״ז, under both spellings
    'CardOwnerID',
    'ExtShvaParams.CardHolderIdentityNumber'
  ];
begin
  if outj is null or jsonb_typeof(outj) <> 'object' then
    return outj;
  end if;

  foreach k in array keys loop
    -- Only rewrite a key that is present AND not already redacted, so a second run
    -- changes nothing.
    if (outj ? k) and outj -> k <> '"[redacted]"'::jsonb then
      outj := jsonb_set(outj, array[k], '"[redacted]"'::jsonb);
    end if;
  end loop;

  -- The checkout indicator nests the response one level down under "indicator".
  if (outj ? 'indicator') and jsonb_typeof(outj -> 'indicator') = 'object' then
    outj := jsonb_set(outj, array['indicator'], pg_temp.redact_cardcom(outj -> 'indicator'));
  end if;

  return outj;
end
$fn$;

-- ── count what we are about to change, so the run is auditable ───────────────
do $report$
declare
  n_charges  bigint;
  n_sessions bigint;
begin
  select count(*) into n_charges
    from public.auditor_subscription_charges
   where raw_charge_response is not null
     and pg_temp.redact_cardcom(raw_charge_response) <> raw_charge_response;

  select count(*) into n_sessions
    from public.auditor_checkout_sessions
   where raw_indicator_json is not null
     and pg_temp.redact_cardcom(raw_indicator_json) <> raw_indicator_json;

  raise notice '132 BEFORE: % charge row(s) and % checkout session(s) hold a token or ID in clear text',
    n_charges, n_sessions;
end
$report$;

update public.auditor_subscription_charges
   set raw_charge_response = pg_temp.redact_cardcom(raw_charge_response)
 where raw_charge_response is not null
   and pg_temp.redact_cardcom(raw_charge_response) <> raw_charge_response;

update public.auditor_checkout_sessions
   set raw_indicator_json = pg_temp.redact_cardcom(raw_indicator_json)
 where raw_indicator_json is not null
   and pg_temp.redact_cardcom(raw_indicator_json) <> raw_indicator_json;

-- ── refuse to commit if anything survived ────────────────────────────────────
-- A redaction that reports success while leaving a token behind is the failure mode
-- this whole change is about. So it is verified inside the transaction, and a
-- survivor aborts rather than being written up as done.
do $verify$
declare
  leftover bigint;
begin
  select
    (select count(*) from public.auditor_subscription_charges
      where raw_charge_response is not null
        and pg_temp.redact_cardcom(raw_charge_response) <> raw_charge_response)
  + (select count(*) from public.auditor_checkout_sessions
      where raw_indicator_json is not null
        and pg_temp.redact_cardcom(raw_indicator_json) <> raw_indicator_json)
  into leftover;

  if leftover <> 0 then
    raise exception '132 FAILED: % row(s) still hold a token or ID after the update. Nothing committed.', leftover;
  end if;

  raise notice '132 AFTER: 0 rows hold a card token or cardholder ID in clear text.';
end
$verify$;

commit;

-- Verification to run separately after the commit. Expect zero rows.
--
--   select 'charges' as src, id, raw_charge_response
--     from public.auditor_subscription_charges
--    where raw_charge_response::text ~ '"(Token|ExtShvaParams\.CardToken|ExtShvaParams\.CardToken_15|TokenToCharge\.Token|CardOwnerID|ExtShvaParams\.CardHolderIdentityNumber)"\s*:\s*(?!"\[redacted\]")'
--   union all
--   select 'sessions', id, raw_indicator_json
--     from public.auditor_checkout_sessions
--    where raw_indicator_json::text ~ '"(Token|ExtShvaParams\.CardToken|ExtShvaParams\.CardToken_15|TokenToCharge\.Token|CardOwnerID|ExtShvaParams\.CardHolderIdentityNumber)"\s*:\s*(?!"\[redacted\]")';

select '132-sanitise-stored-card-tokens.sql applied' as migration;

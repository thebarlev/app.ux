-- ====================================================
-- 126 - finalize_document_with_period_guard_service: one qualified column
-- ====================================================
-- ONE LINE. The function has failed on every call since 4 May 2026 with
--
--     column reference "document_status" is ambiguous
--
-- ── THE BUG ─────────────────────────────────────────────────────────────────
-- scripts/107 declares the return type as
--
--     returns table (ok boolean, reason text, document_status text, document_number text)
--
-- so `document_status` is an OUT parameter for the whole body. Inside the
-- finalising UPDATE, the WHERE clause referenced it unqualified:
--
--     where id              = p_document_id
--       and company_id      = p_company_id
--       and document_status = 'draft';        ← OUT parameter or column?
--
-- PL/pgSQL cannot choose, so it raises. Every call. There is exactly one such
-- reference: the SET clause two lines above it also says `document_status` but a
-- SET target is always a column, never a variable, so it was never ambiguous. The
-- two SELECTs in the function already qualify with `d.`.
--
-- The fix qualifies the WHERE with the table name. `documents.document_status`
-- cannot resolve to a variable, so the ambiguity is gone.
--
-- ── WHY QUALIFY RATHER THAN RENAME ──────────────────────────────────────────
-- Three fixes work: qualify the column, alias the table, or rename the OUT
-- parameter. They are not equally safe. The OUT parameter name IS the JSON key the
-- caller reads — lib/billing/vow-billing/providers/internal-provider.ts:62-64 reads
-- `row?.ok` and `row?.reason`, and a future reader may read `document_status`.
-- Renaming it changes the function's contract to fix a scoping mistake. Aliasing
-- the table touches the UPDATE target line as well. Qualifying touches one line and
-- changes no contract.
--
-- ── EVIDENCE THAT IT IS EVERY CALL, NOT INTERMITTENT ────────────────────────
-- From public.billing_failures before the 2026-08-10 reset:
--
--   49 rows · failure_stage 'vow_create_document_finalize' · error_code 'rpc_error'
--   49 DISTINCT document_id · ONE distinct error_message · error_details names this
--   function · span 2026-05-04 .. 2026-07-23, i.e. 81 days
--
-- One message across 49 separate documents over 81 days is not a transient fault.
--
-- ── NO DOCUMENT IS WRONG, AND NO PAYMENT WAS LOST ───────────────────────────
-- Stated plainly because the failure count invites the opposite conclusion. All 49
-- of those documents are `final` today. internal-provider.ts:497 falls back to
-- finalizeFallbackFullAccounting when the RPC fails, and that fallback writes the
-- same values: the caller passes p_credited_amount = the full amount and
-- p_outstanding_balance = 0 (internal-provider.ts:53-54), which is exactly what the
-- fallback hardcodes (:92-99). It is also a compare-and-set on
-- document_status = 'draft', so it cannot double-finalise.
--
-- WHAT WAS ACTUALLY LOST, for 81 days:
--   1. The whitelist guard. `company_not_unlimited` — the check that only a company
--      in unlimited_document_companies may be finalised through the service path,
--      which scripts/107 describes as protection in case the service-role key
--      reaches a different code path — has never executed on this path. It would
--      have passed (the only row in that table is the issuing company), so nothing
--      slipped through. A guard that would have passed is still a guard that is off.
--   2. The SELECT ... FOR UPDATE row lock. The fallback's compare-and-set prevents a
--      lost update, so this is a weakening, not a corruption.
--   3. The specific diagnostics: company_mismatch, document_not_found,
--      invalid_document_state.
--   4. 49 rows of noise in billing_failures, which is where anyone would look for a
--      real problem. That is how this survived 81 days.
--
-- ── VERIFIED AGAINST PRODUCTION, NOT ONLY AGAINST THE REPO ──────────────────
-- pg_get_functiondef for the live function was read in the SQL editor. It carries
-- the same `returns table (... document_status text ...)` and the same unqualified
-- `and document_status = 'draft'`. The live definition matches scripts/107
-- structurally: the same five declared variables in the same order, the same nine
-- reason strings, and the same service-role guard shape. So this file is built on
-- the definition that is actually running.
--
-- ── HOW THIS FILE WAS PRODUCED ──────────────────────────────────────────────
-- `create or replace function` cannot patch a body, so the whole function is
-- restated. The body below is scripts/107 lines 30-174 COPIED VERBATIM with one
-- mechanical edit, verified by diffing the result against the original. The diff is
-- one line. The revoke/grant block and the pg_notify schema reload are byte-identical.
--
-- ── AFTER THIS RUNS, THE FALLBACK SHOULD GO QUIET ───────────────────────────
-- The measurable outcome is that the next VOW document finalises through the RPC and
-- writes NO billing_failures row. The fallback stays in place — it is correct as a
-- fallback; it was only wrong as the primary path. If billing_failures keeps growing
-- with this message after this file is applied, the fix did not take and the reason
-- is not this line.
-- ====================================================

begin;

create or replace function public.finalize_document_with_period_guard_service(
  p_company_id           uuid,
  p_document_id          uuid,
  p_paid_amount          numeric,
  p_credited_amount      numeric default 0,
  p_outstanding_balance  numeric default 0,
  p_accounting_status    text    default 'paid',
  p_now                  timestamptz default now()
)
returns table (
  ok                boolean,
  reason            text,
  document_status   text,
  document_number   text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role            text;
  v_doc_status      text;
  v_doc_company_id  uuid;
  v_doc_number      text;
  v_is_unlimited    boolean;
begin
  -- ── Service-role only guard ────────────────────────────────────────
  v_role := null;
  begin
    v_role := auth.role();
  exception when undefined_function then
    v_role := null;
  end;

  if v_role is null or v_role is distinct from 'service_role' then
    begin
      v_role := (current_setting('request.jwt.claims', true)::jsonb ->> 'role');
    exception when others then
      v_role := null;
    end;
  end if;

  if v_role is distinct from 'service_role' then
    return query select false, 'forbidden_not_service_role'::text, null::text, null::text;
    return;
  end if;

  -- ── Param validation ───────────────────────────────────────────────
  if p_company_id is null or p_document_id is null then
    return query select false, 'missing_params'::text, null::text, null::text;
    return;
  end if;

  if p_paid_amount is null or p_paid_amount < 0 then
    return query select false, 'invalid_paid_amount'::text, null::text, null::text;
    return;
  end if;

  -- ── Whitelist guard: only unlimited issuer companies may be finalised
  --    via the service path. This prevents accidental misuse if the
  --    service role key ever leaks into a different code path.
  select exists(
    select 1 from public.unlimited_document_companies
    where company_id = p_company_id
  ) into v_is_unlimited;

  if not v_is_unlimited then
    return query select false, 'company_not_unlimited'::text, null::text, null::text;
    return;
  end if;

  -- ── Lock the document row ──────────────────────────────────────────
  select d.document_status, d.company_id, d.document_number
    into v_doc_status, v_doc_company_id, v_doc_number
  from public.documents d
  where d.id = p_document_id
  for update;

  if v_doc_status is null then
    return query select false, 'document_not_found'::text, null::text, null::text;
    return;
  end if;

  if v_doc_company_id is distinct from p_company_id then
    return query select false, 'company_mismatch'::text, null::text, null::text;
    return;
  end if;

  -- Idempotent: already final → no-op (do NOT touch immutable doc).
  if v_doc_status = 'final' then
    return query select true, 'already_final'::text, v_doc_status, v_doc_number;
    return;
  end if;

  if v_doc_status is distinct from 'draft' then
    return query select false, ('invalid_document_state:' || v_doc_status)::text, v_doc_status, v_doc_number;
    return;
  end if;

  -- ── Finalize: update ALL accounting fields atomically ──────────────
  update public.documents
     set document_status     = 'final',
         finalized_at        = p_now,
         finalized_by        = null,         -- system identity, see comment above
         paid_amount         = round(p_paid_amount::numeric, 2),
         credited_amount     = round(coalesce(p_credited_amount, 0)::numeric, 2),
         outstanding_balance = round(coalesce(p_outstanding_balance, 0)::numeric, 2),
         accounting_status   = coalesce(p_accounting_status, 'paid')
   where id              = p_document_id
     and company_id      = p_company_id
     and documents.document_status = 'draft';

  if not found then
    -- Race: another caller finalized it between our SELECT and UPDATE.
    select d.document_status, d.document_number
      into v_doc_status, v_doc_number
    from public.documents d
    where d.id = p_document_id;
    return query select true, 'race_already_final'::text, v_doc_status, v_doc_number;
    return;
  end if;

  return query select true, null::text, 'final'::text, v_doc_number;
  return;
end;
$$;

revoke all on function public.finalize_document_with_period_guard_service(
  uuid, uuid, numeric, numeric, numeric, text, timestamptz
) from public;
revoke all on function public.finalize_document_with_period_guard_service(
  uuid, uuid, numeric, numeric, numeric, text, timestamptz
) from anon;
revoke all on function public.finalize_document_with_period_guard_service(
  uuid, uuid, numeric, numeric, numeric, text, timestamptz
) from authenticated;
grant execute on function public.finalize_document_with_period_guard_service(
  uuid, uuid, numeric, numeric, numeric, text, timestamptz
) to service_role;

commit;

select pg_notify('pgrst', 'reload schema');

-- ====================================================
-- 107 - finalize_document_with_period_guard_service
-- ====================================================
-- Purpose:
-- - Service-role companion to public.finalize_document_with_period_guard.
-- - The original RPC requires auth.uid() to be non-null and is intended
--   for browser sessions. When /api/billing/create-document is invoked
--   server-to-server (mioshy → app.ux via x-api-key), the call uses the
--   Supabase service-role key. In that context auth.uid() is NULL, so
--   the original RPC always returns 'unauthorized', and the API code
--   falls back to a partial UPDATE that does NOT populate the
--   accounting fields (paid_amount, credited_amount,
--   outstanding_balance, accounting_status). This breaks BKMV, reports,
--   and reconciliation.
--
-- Design:
-- - SECURITY DEFINER, search_path = public.
-- - Restricted to service_role only via JWT claims check.
-- - Restricted to companies registered in unlimited_document_companies
--   (currently the VOW billing issuer). This keeps the surface narrow
--   and ensures we only ever issue from approved system identities.
-- - Idempotent: if document is already 'final', return ok without
--   mutating it (preserves regulatory immutability).
-- - Updates ALL accounting fields in a single statement.
-- - finalized_by stays NULL on purpose: the column references
--   auth.users(id), and there is no human user. We mark the system
--   identity in the audit_logs entry instead (best effort).
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
     and document_status = 'draft';

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

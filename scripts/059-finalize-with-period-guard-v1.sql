-- ====================================================
-- 059 - Finalize with anniversary period guard (V1)
-- ====================================================
-- Purpose:
-- - Enforce subscription eligibility without relying on usage_monthly
-- - Compute usage within current subscription period:
--   finalized_at in [current_period_start, current_period_end)
-- - Free plan: hard cap at plans.documents_per_month
-- - Paid plans: do NOT cap; overages charged on next renewal job
--
-- Security:
-- - SECURITY INVOKER (default): runs as the logged-in user and respects RLS.
-- - Explicit checks: auth.uid() and company membership via user_company_ids().
-- ====================================================

begin;

create or replace function public.finalize_document_with_period_guard(
  p_company_id uuid,
  p_document_id uuid,
  p_now timestamptz default now(),
  p_paid_amount numeric default null,
  p_credited_amount numeric default null,
  p_outstanding_balance numeric default null,
  p_accounting_status text default null
)
returns table (
  ok boolean,
  reason text,
  documents_used integer,
  documents_limit integer
)
language plpgsql
set search_path = public
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_limit integer;
  v_doc_status text;
  v_doc_company_id uuid;
  v_used integer := 0;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  -- Authorization: must be logged-in and belong to the company.
  if auth.uid() is null then
    return query select false, 'unauthorized', null::integer, null::integer;
    return;
  end if;

  if p_company_id not in (select public.user_company_ids()) then
    return query select false, 'unauthorized', null::integer, null::integer;
    return;
  end if;

  -- Load subscription (must exist)
  select *
    into v_sub
  from public.subscriptions s
  where s.company_id = p_company_id;

  if not found then
    return query select false, 'account_blocked', null::integer, null::integer;
    return;
  end if;

  -- Block on non-active statuses (no grace)
  if v_sub.status = 'past_due' then
    return query select false, 'past_due', null::integer, null::integer;
    return;
  end if;

  if v_sub.status in ('blocked','canceled') then
    return query select false, 'account_blocked', null::integer, null::integer;
    return;
  end if;

  -- Resolve quota from frozen subscription snapshot (not from plans catalog).
  v_limit := coalesce(v_sub.plan_snapshot_documents_limit, 0);

  if v_limit is null then
    return query select false, 'account_blocked', null::integer, null::integer;
    return;
  end if;

  -- Anniversary period:
  -- - Paid plans must have a current_period window and must be within it.
  -- - Free plan can exist without current_period_*; but if present, we still use it.
  if v_sub.plan_id = 'free' then
    if v_sub.current_period_start is not null and v_sub.current_period_end is not null then
      v_period_start := v_sub.current_period_start;
      v_period_end := v_sub.current_period_end;
    else
      -- Fallback: anchor to trial_starts_at for a rolling monthly window without updating subscription rows.
      -- This keeps free usage monthly in an anniversary sense.
      declare
        v_anchor timestamptz := coalesce(v_sub.trial_starts_at, p_now);
        v_age interval := age(p_now, v_anchor);
        v_months int := (extract(year from v_age)::int * 12) + extract(month from v_age)::int;
      begin
        v_period_start := v_anchor + make_interval(months => v_months);
        v_period_end := v_period_start + interval '1 month';
      end;
    end if;
  else
    if v_sub.current_period_start is null or v_sub.current_period_end is null then
      return query select false, 'subscription_expired', null::integer, v_limit;
      return;
    end if;

    v_period_start := v_sub.current_period_start;
    v_period_end := v_sub.current_period_end;

    if p_now >= v_period_end then
      return query select false, 'subscription_expired', null::integer, v_limit;
      return;
    end if;
  end if;

  -- Lock document row
  select d.document_status, d.company_id
    into v_doc_status, v_doc_company_id
  from public.documents d
  where d.id = p_document_id
  for update;

  if v_doc_status is null then
    return query select false, 'document_not_found', null::integer, v_limit;
    return;
  end if;

  if v_doc_company_id != p_company_id then
    return query select false, 'unauthorized', null::integer, v_limit;
    return;
  end if;

  -- Count finalized docs in the current period (analytics + free cap enforcement).
  -- INCLUDE ALL accounting document types: receipt, invoice_receipt, negative_receipt (קבלה שלילית),
  -- tax_invoice, credit_note, etc. No exemptions. Count regardless of sign/credited.
  select count(*)
    into v_used
  from public.documents d
  where d.company_id = p_company_id
    and d.document_status = 'final'
    and d.finalized_at is not null
    and d.finalized_at >= v_period_start
    and d.finalized_at < v_period_end;

  -- Idempotency: if already final, do not change/recap.
  if v_doc_status = 'final' then
    return query select true, null::text, v_used, v_limit;
    return;
  end if;

  if v_doc_status != 'draft' then
    return query select false, 'invalid_document_state', null::integer, v_limit;
    return;
  end if;

  -- Free hard cap
  if v_sub.plan_id = 'free' and v_used >= v_limit then
    return query select false, 'limit_reached', v_used, v_limit;
    return;
  end if;

  -- Finalize document (must succeed)
  update public.documents
  set
    document_status = 'final',
    finalized_at = p_now,
    finalized_by = auth.uid(),
    paid_amount = p_paid_amount,
    credited_amount = p_credited_amount,
    outstanding_balance = p_outstanding_balance,
    accounting_status = p_accounting_status
  where id = p_document_id
    and company_id = p_company_id
    and document_status = 'draft';

  if not found then
    raise exception 'Finalize failed: document state changed concurrently';
  end if;

  return query select true, null::text, (v_used + 1), v_limit;
  return;
end;
$$;

commit;

select pg_notify('pgrst', 'reload schema');


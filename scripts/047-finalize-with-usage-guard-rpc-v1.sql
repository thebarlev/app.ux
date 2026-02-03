-- ====================================================
-- 047 - Atomic finalize + usage guard RPC (V1)
-- ====================================================
-- Purpose:
-- - Prevent race conditions when issuing/finalizing documents
-- - Enforce subscription eligibility (trial/active/blocked/expired)
-- - Enforce monthly usage limit (documents_per_month)
-- - Atomically increment usage_monthly and flip documents to final
--
-- Contract (returned reason values):
-- - account_blocked | trial_ended | subscription_expired | limit_reached
-- - document_not_found | invalid_document_state | unauthorized
-- ====================================================

begin;

create or replace function public.finalize_document_with_usage_guard(
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
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_now)::date;
  v_sub public.subscriptions%rowtype;
  v_limit integer;
  v_doc_status text;
  v_doc_company_id uuid;
  v_current_used integer := 0;
begin
  -- Authorization: caller must be logged-in and belong to the company.
  if auth.uid() is null then
    return query select false, 'unauthorized', null::integer, null::integer;
    return;
  end if;

  if p_company_id not in (select public.user_company_ids()) then
    return query select false, 'unauthorized', null::integer, null::integer;
    return;
  end if;

  -- Ensure subscription row exists (backstop for older companies)
  insert into public.subscriptions (
    company_id, plan_id, status, trial_starts_at, trial_ends_at
  )
  values (
    p_company_id, 'free', 'trial', now(), now() + interval '1 year'
  )
  on conflict (company_id) do nothing;

  -- Lock subscription row
  select *
  into v_sub
  from public.subscriptions s
  where s.company_id = p_company_id
  for update;

  -- Resolve limit from plan
  select p.documents_per_month
  into v_limit
  from public.plans p
  where p.id = v_sub.plan_id;

  if v_limit is null then
    -- Defensive fallback: treat as blocked if plan missing
    return query select false, 'account_blocked', null::integer, null::integer;
    return;
  end if;

  -- Eligibility checks (no grace)
  if v_sub.status in ('blocked','canceled','past_due') then
    return query select false, 'account_blocked', null::integer, v_limit;
    return;
  end if;

  if v_sub.status = 'trial' and p_now > v_sub.trial_ends_at then
    return query select false, 'trial_ended', null::integer, v_limit;
    return;
  end if;

  if v_sub.status = 'active' then
    if v_sub.current_period_end is null or p_now > v_sub.current_period_end then
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

  -- Idempotency: if already final, do not re-count.
  if v_doc_status = 'final' then
    select coalesce(u.documents_count, 0)
    into v_current_used
    from public.usage_monthly u
    where u.company_id = p_company_id and u.year_month = v_month;

    return query select true, null::text, v_current_used, v_limit;
    return;
  end if;

  if v_doc_status != 'draft' then
    return query select false, 'invalid_document_state', null::integer, v_limit;
    return;
  end if;

  -- Ensure + lock usage row
  insert into public.usage_monthly (company_id, year_month, documents_count)
  values (p_company_id, v_month, 0)
  on conflict (company_id, year_month) do nothing;

  select u.documents_count
  into v_current_used
  from public.usage_monthly u
  where u.company_id = p_company_id and u.year_month = v_month
  for update;

  if v_current_used >= v_limit then
    return query select false, 'limit_reached', v_current_used, v_limit;
    return;
  end if;

  -- Increment usage first (still within transaction)
  update public.usage_monthly
  set documents_count = documents_count + 1
  where company_id = p_company_id and year_month = v_month
  returning documents_count into v_current_used;

  -- Finalize document (must succeed; otherwise raise to rollback usage increment)
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

  return query select true, null::text, v_current_used, v_limit;
  return;
end;
$$;

commit;

select pg_notify('pgrst', 'reload schema');


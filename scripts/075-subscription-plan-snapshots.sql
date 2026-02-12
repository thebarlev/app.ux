-- ====================================================
-- 075 - Subscription plan snapshots + explicit change_plan
-- ====================================================
-- Purpose:
-- - Freeze commercial plan values per subscription at enrollment/change time
-- - Prevent future edits in public.plans from affecting existing subscribers
-- - Provide a single explicit operation: change_plan(company_id, new_plan_id, billing_period)
-- ====================================================

begin;

alter table public.subscriptions
  add column if not exists plan_snapshot_name text,
  add column if not exists plan_snapshot_price numeric,
  add column if not exists plan_snapshot_documents_limit integer,
  add column if not exists plan_snapshot_overage_unit_price numeric,
  add column if not exists plan_snapshot_currency text default 'ILS',
  add column if not exists plan_snapshot_billing_period text,
  add column if not exists plan_snapshot_created_at timestamptz default now();

-- Backfill from current plan mapping (one-time for existing rows).
update public.subscriptions s
set
  plan_snapshot_name = coalesce(s.plan_snapshot_name, p.name),
  plan_snapshot_price = coalesce(
    s.plan_snapshot_price,
    case
      when coalesce(s.billing_interval, 'month') = 'year'
        then coalesce(p.price_yearly, p.price_monthly, 0)
      else coalesce(p.price_monthly, p.price_yearly, 0)
    end
  ),
  plan_snapshot_documents_limit = coalesce(s.plan_snapshot_documents_limit, p.documents_per_month, 0),
  plan_snapshot_overage_unit_price = coalesce(s.plan_snapshot_overage_unit_price, p.overage_unit_price, 0),
  plan_snapshot_currency = coalesce(nullif(s.plan_snapshot_currency, ''), 'ILS'),
  plan_snapshot_billing_period = coalesce(s.plan_snapshot_billing_period, s.billing_interval, 'month'),
  plan_snapshot_created_at = coalesce(s.plan_snapshot_created_at, now())
from public.plans p
where p.id = s.plan_id;

-- Defensive fill in case any row references a missing/legacy plan id.
update public.subscriptions
set
  plan_snapshot_name = coalesce(plan_snapshot_name, initcap(coalesce(plan_id, 'free'))),
  plan_snapshot_price = coalesce(plan_snapshot_price, 0),
  plan_snapshot_documents_limit = coalesce(plan_snapshot_documents_limit, 0),
  plan_snapshot_overage_unit_price = coalesce(plan_snapshot_overage_unit_price, 0),
  plan_snapshot_currency = coalesce(nullif(plan_snapshot_currency, ''), 'ILS'),
  plan_snapshot_billing_period = coalesce(plan_snapshot_billing_period, billing_interval, 'month'),
  plan_snapshot_created_at = coalesce(plan_snapshot_created_at, now());

alter table public.subscriptions
  alter column plan_snapshot_name set not null,
  alter column plan_snapshot_price set not null,
  alter column plan_snapshot_documents_limit set not null,
  alter column plan_snapshot_overage_unit_price set not null,
  alter column plan_snapshot_currency set not null,
  alter column plan_snapshot_billing_period set not null,
  alter column plan_snapshot_created_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_plan_snapshot_documents_limit_nonnegative'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_plan_snapshot_documents_limit_nonnegative
      check (plan_snapshot_documents_limit >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_plan_snapshot_price_nonnegative'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_plan_snapshot_price_nonnegative
      check (plan_snapshot_price >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_plan_snapshot_overage_nonnegative'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_plan_snapshot_overage_nonnegative
      check (plan_snapshot_overage_unit_price >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_plan_snapshot_billing_period_valid'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_plan_snapshot_billing_period_valid
      check (plan_snapshot_billing_period in ('month', 'year'));
  end if;
end $$;

-- Keep trial auto-create aligned with snapshot model.
create or replace function public.create_trial_subscription_for_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_free_name text := 'Free';
  v_free_docs integer := 10;
begin
  select p.name, p.documents_per_month
    into v_free_name, v_free_docs
  from public.plans p
  where p.id = 'free';

  insert into public.subscriptions (
    company_id,
    plan_id,
    status,
    trial_starts_at,
    trial_ends_at,
    current_period_start,
    current_period_end,
    plan_snapshot_name,
    plan_snapshot_price,
    plan_snapshot_documents_limit,
    plan_snapshot_overage_unit_price,
    plan_snapshot_currency,
    plan_snapshot_billing_period,
    plan_snapshot_created_at
  ) values (
    new.id,
    'free',
    'trial',
    now(),
    now() + interval '1 year',
    null,
    null,
    coalesce(v_free_name, 'Free'),
    0,
    coalesce(v_free_docs, 10),
    0,
    'ILS',
    'month',
    now()
  )
  on conflict (company_id) do nothing;

  return new;
end;
$$;

-- Explicit operation for intentional plan changes only.
create or replace function public.change_plan(
  p_company_id uuid,
  p_new_plan_id text,
  p_billing_period text default null,
  p_status text default null,
  p_period_start timestamptz default null,
  p_period_end timestamptz default null
)
returns table (
  ok boolean,
  reason text,
  plan_id text,
  snapshot_created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans%rowtype;
  v_sub public.subscriptions%rowtype;
  v_period text;
  v_status text;
begin
  if coalesce(trim(p_new_plan_id), '') = '' then
    return query select false, 'missing_plan_id', null::text, null::timestamptz;
    return;
  end if;

  if p_billing_period is not null and p_billing_period not in ('month', 'year') then
    return query select false, 'invalid_billing_period', null::text, null::timestamptz;
    return;
  end if;

  if p_status is not null and p_status not in ('trial', 'active', 'blocked', 'canceled', 'past_due') then
    return query select false, 'invalid_status', null::text, null::timestamptz;
    return;
  end if;

  -- Allow service-role calls (auth.uid() is null), but enforce tenant scope for user-context calls.
  if auth.uid() is not null and p_company_id not in (select public.user_company_ids()) then
    return query select false, 'unauthorized', null::text, null::timestamptz;
    return;
  end if;

  select *
    into v_plan
  from public.plans p
  where p.id = p_new_plan_id;

  if not found then
    return query select false, 'plan_not_found', null::text, null::timestamptz;
    return;
  end if;

  select *
    into v_sub
  from public.subscriptions s
  where s.company_id = p_company_id
  for update;

  if not found then
    insert into public.subscriptions (
      company_id,
      plan_id,
      status,
      trial_starts_at,
      trial_ends_at,
      billing_interval,
      current_period_start,
      current_period_end,
      plan_snapshot_name,
      plan_snapshot_price,
      plan_snapshot_documents_limit,
      plan_snapshot_overage_unit_price,
      plan_snapshot_currency,
      plan_snapshot_billing_period,
      plan_snapshot_created_at
    ) values (
      p_company_id,
      p_new_plan_id,
      coalesce(p_status, 'active'),
      now(),
      now() + interval '1 year',
      coalesce(p_billing_period, 'month'),
      p_period_start,
      p_period_end,
      coalesce(v_plan.name, p_new_plan_id),
      case
        when coalesce(p_billing_period, 'month') = 'year'
          then coalesce(v_plan.price_yearly, v_plan.price_monthly, 0)
        else coalesce(v_plan.price_monthly, v_plan.price_yearly, 0)
      end,
      coalesce(v_plan.documents_per_month, 0),
      coalesce(v_plan.overage_unit_price, 0),
      'ILS',
      coalesce(p_billing_period, 'month'),
      now()
    )
    on conflict (company_id) do nothing;

    select *
      into v_sub
    from public.subscriptions s
    where s.company_id = p_company_id
    for update;
  end if;

  v_period := coalesce(p_billing_period, v_sub.billing_interval, 'month');
  v_status := coalesce(p_status, v_sub.status, 'active');

  update public.subscriptions s
  set
    plan_id = p_new_plan_id,
    status = v_status,
    billing_interval = v_period,
    current_period_start = coalesce(p_period_start, s.current_period_start),
    current_period_end = coalesce(p_period_end, s.current_period_end),
    plan_snapshot_name = coalesce(v_plan.name, p_new_plan_id),
    plan_snapshot_price = case
      when v_period = 'year' then coalesce(v_plan.price_yearly, v_plan.price_monthly, 0)
      else coalesce(v_plan.price_monthly, v_plan.price_yearly, 0)
    end,
    plan_snapshot_documents_limit = coalesce(v_plan.documents_per_month, 0),
    plan_snapshot_overage_unit_price = coalesce(v_plan.overage_unit_price, 0),
    plan_snapshot_currency = 'ILS',
    plan_snapshot_billing_period = v_period,
    plan_snapshot_created_at = now()
  where s.company_id = p_company_id
  returning true, null::text, s.plan_id, s.plan_snapshot_created_at
  into ok, reason, plan_id, snapshot_created_at;

  if not found then
    return query select false, 'subscription_not_found', null::text, null::timestamptz;
    return;
  end if;

  return query select ok, reason, plan_id, snapshot_created_at;
end;
$$;

-- Recreate guards to use snapshot limits instead of plans catalog.
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
  if auth.uid() is null then
    return query select false, 'unauthorized', null::integer, null::integer;
    return;
  end if;

  if p_company_id not in (select public.user_company_ids()) then
    return query select false, 'unauthorized', null::integer, null::integer;
    return;
  end if;

  insert into public.subscriptions (
    company_id, plan_id, status, trial_starts_at, trial_ends_at,
    plan_snapshot_name, plan_snapshot_price, plan_snapshot_documents_limit,
    plan_snapshot_overage_unit_price, plan_snapshot_currency, plan_snapshot_billing_period, plan_snapshot_created_at
  )
  values (
    p_company_id, 'free', 'trial', now(), now() + interval '1 year',
    'Free', 0, 10, 0, 'ILS', 'month', now()
  )
  on conflict (company_id) do nothing;

  select * into v_sub
  from public.subscriptions s
  where s.company_id = p_company_id
  for update;

  v_limit := coalesce(v_sub.plan_snapshot_documents_limit, 0);
  if v_limit is null then
    return query select false, 'account_blocked', null::integer, null::integer;
    return;
  end if;

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

  update public.usage_monthly
  set documents_count = documents_count + 1
  where company_id = p_company_id and year_month = v_month
  returning documents_count into v_current_used;

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
end;
$$;

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
  v_vow_company_id uuid := '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid;
begin
  if auth.uid() is null then
    return query select false, 'unauthorized', null::integer, null::integer;
    return;
  end if;

  if p_company_id not in (select public.user_company_ids()) then
    return query select false, 'unauthorized', null::integer, null::integer;
    return;
  end if;

  select * into v_sub
  from public.subscriptions s
  where s.company_id = p_company_id;

  if not found then
    return query select false, 'account_blocked', null::integer, null::integer;
    return;
  end if;

  if v_sub.status = 'past_due' then
    return query select false, 'past_due', null::integer, null::integer;
    return;
  end if;

  if v_sub.status in ('blocked','canceled') then
    return query select false, 'account_blocked', null::integer, null::integer;
    return;
  end if;

  if p_company_id = v_vow_company_id then
    v_limit := 1000000;
  else
    v_limit := coalesce(v_sub.plan_snapshot_documents_limit, 0);
  end if;

  if v_limit is null then
    return query select false, 'account_blocked', null::integer, null::integer;
    return;
  end if;

  if v_sub.plan_id = 'free' then
    if v_sub.current_period_start is not null and v_sub.current_period_end is not null then
      v_period_start := v_sub.current_period_start;
      v_period_end := v_sub.current_period_end;
    else
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

  select count(*)
    into v_used
  from public.documents d
  where d.company_id = p_company_id
    and d.document_status = 'final'
    and d.finalized_at is not null
    and d.finalized_at >= v_period_start
    and d.finalized_at < v_period_end;

  if v_doc_status = 'final' then
    return query select true, null::text, v_used, v_limit;
    return;
  end if;

  if v_doc_status != 'draft' then
    return query select false, 'invalid_document_state', null::integer, v_limit;
    return;
  end if;

  if v_sub.plan_id = 'free' and v_used >= v_limit then
    return query select false, 'limit_reached', v_used, v_limit;
    return;
  end if;

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
end;
$$;

commit;

select pg_notify('pgrst', 'reload schema');

-- ====================================================
-- 045 - Subscriptions + Plans + Monthly Usage (V1)
-- ====================================================
-- Purpose:
-- - Freemium trial (1 year) per company
-- - Monthly document usage counter (finalized docs)
-- - Current-state subscription row per company (no history here)
-- - Webhook events table for idempotency/audit (service-role only)
--
-- Notes:
-- - Uses `company_id` as tenant key (aligned with existing multi-tenant model)
-- - RLS policies are defined in a separate migration (see next scripts)
-- ====================================================

begin;

create extension if not exists pgcrypto;

-- ----------------------------------------------------
-- 1) plans
-- ----------------------------------------------------
create table if not exists public.plans (
  id text primary key, -- e.g. free | basic | pro
  name text not null,
  price_monthly numeric,
  price_yearly numeric,
  documents_per_month integer not null,
  features_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Seed baseline plans (idempotent)
insert into public.plans (id, name, price_monthly, price_yearly, documents_per_month, features_json)
values
  ('free', 'Free', null, null, 10, '{}'::jsonb),
  ('basic', 'Basic', null, null, 100, '{}'::jsonb),
  ('pro', 'Pro', null, null, 1000, '{}'::jsonb)
on conflict (id) do nothing;

-- ----------------------------------------------------
-- 2) subscriptions (current-state only; one row per company)
-- ----------------------------------------------------
create table if not exists public.subscriptions (
  company_id uuid primary key references public.companies(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null check (status in ('trial','active','blocked','canceled','past_due')),

  trial_starts_at timestamptz not null,
  trial_ends_at timestamptz not null,

  current_period_start timestamptz,
  current_period_end timestamptz,

  billing_interval text check (billing_interval in ('month','year')),

  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  provider_price_id text,

  blocked_at timestamptz,
  canceled_at timestamptz,

  updated_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_status on public.subscriptions(status);
create index if not exists idx_subscriptions_provider_subscription_id on public.subscriptions(provider_subscription_id);

-- Timestamp trigger (reuse pattern)
create or replace function public.update_subscriptions_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_subscriptions_timestamp on public.subscriptions;
create trigger update_subscriptions_timestamp
  before update on public.subscriptions
  for each row
  execute function public.update_subscriptions_timestamp();

-- ----------------------------------------------------
-- 3) usage_monthly
-- ----------------------------------------------------
create table if not exists public.usage_monthly (
  company_id uuid not null references public.companies(id) on delete cascade,
  year_month date not null, -- first day of month (e.g., 2026-02-01)
  documents_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (company_id, year_month)
);

-- Timestamp trigger
create or replace function public.update_usage_monthly_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_usage_monthly_timestamp on public.usage_monthly;
create trigger update_usage_monthly_timestamp
  before update on public.usage_monthly
  for each row
  execute function public.update_usage_monthly_timestamp();

-- ----------------------------------------------------
-- 4) billing_webhook_events (idempotency + audit)
-- ----------------------------------------------------
create table if not exists public.billing_webhook_events (
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received','ok','ignored','error')),
  payload jsonb,
  primary key (provider, event_id)
);

create index if not exists idx_billing_webhook_events_received_at on public.billing_webhook_events(received_at);
create index if not exists idx_billing_webhook_events_status on public.billing_webhook_events(status);

-- ----------------------------------------------------
-- 5) Auto-create trial subscription on company insert
-- ----------------------------------------------------
create or replace function public.create_trial_subscription_for_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (
    company_id,
    plan_id,
    status,
    trial_starts_at,
    trial_ends_at,
    current_period_start,
    current_period_end
  ) values (
    new.id,
    'free',
    'trial',
    now(),
    now() + interval '1 year',
    null,
    null
  )
  on conflict (company_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trigger_create_trial_subscription_for_company on public.companies;
create trigger trigger_create_trial_subscription_for_company
  after insert on public.companies
  for each row
  execute function public.create_trial_subscription_for_company();

-- Backfill for existing companies (idempotent)
insert into public.subscriptions (
  company_id, plan_id, status, trial_starts_at, trial_ends_at, current_period_start, current_period_end
)
select
  c.id,
  'free',
  'trial',
  coalesce(c.created_at, now()),
  coalesce(c.created_at, now()) + interval '1 year',
  null,
  null
from public.companies c
where not exists (
  select 1 from public.subscriptions s where s.company_id = c.id
);

commit;

-- Ask PostgREST to reload schema cache (Supabase API)
select pg_notify('pgrst', 'reload schema');


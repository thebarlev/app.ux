-- ====================================================
-- 081 - Auditor billing: plans + subscriptions + charges (isolated)
-- ====================================================
-- Purpose:
-- - Store `/auditor` subscription state in dedicated `auditor_*` tables
-- - Support Cardcom LowProfile (initial) + ChargeToken (renewals)
-- - Link successful charges to issued `invoice_receipt` documents (Israeli compliance)
-- Notes:
-- - All mutations are service-role only (no tenant write policies)
-- - Avoid exposing raw provider payloads to tenants
-- ====================================================

begin;

create extension if not exists pgcrypto;

-- -----------------------
-- auditor_plans
-- -----------------------
create table if not exists public.auditor_plans (
  id text primary key check (id in ('basic','pro','premium')),
  name text not null,
  monthly_amount numeric not null,
  currency text not null default 'ILS',
  is_active boolean not null default true,
  features_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed baseline plans (idempotent). Prices are inclusive of VAT (display price).
insert into public.auditor_plans (id, name, monthly_amount, currency, is_active, features_json)
values
  ('basic', 'בסיסי', 97, 'ILS', true, '{}'::jsonb),
  ('pro', 'מקצועי', 197, 'ILS', true, '{}'::jsonb),
  ('premium', 'מומחים', 997, 'ILS', true, '{}'::jsonb)
on conflict (id) do nothing;

create or replace function public.update_auditor_plans_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_auditor_plans_timestamp on public.auditor_plans;
create trigger update_auditor_plans_timestamp
  before update on public.auditor_plans
  for each row execute function public.update_auditor_plans_timestamp();

-- -----------------------
-- auditor_checkout_sessions
-- -----------------------
create table if not exists public.auditor_checkout_sessions (
  id uuid primary key default gen_random_uuid(),

  company_id uuid null references public.companies(id) on delete set null,
  user_id uuid null references auth.users(id) on delete set null,
  lead_id uuid null references public.auditor_leads(id) on delete set null,
  scan_id uuid null references public.auditor_scans(id) on delete set null,

  plan_id text not null references public.auditor_plans(id),
  amount numeric not null,
  coin_id int not null default 1,

  status text not null check (status in ('created','redirected','paid','failed','canceled','expired')),

  provider text not null default 'cardcom',
  provider_low_profile_code text,
  provider_internal_deal_number text,

  return_value text,
  success_url text,
  error_url text,
  indicator_url text,

  raw_open_response_json jsonb,
  raw_indicator_json jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_auditor_checkout_sessions_company_id on public.auditor_checkout_sessions(company_id);
create index if not exists idx_auditor_checkout_sessions_status on public.auditor_checkout_sessions(status);
create index if not exists idx_auditor_checkout_sessions_created_at on public.auditor_checkout_sessions(created_at);

create unique index if not exists idx_auditor_checkout_sessions_low_profile_code_unique
  on public.auditor_checkout_sessions(provider_low_profile_code)
  where provider_low_profile_code is not null;

create or replace function public.update_auditor_checkout_sessions_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_auditor_checkout_sessions_timestamp on public.auditor_checkout_sessions;
create trigger update_auditor_checkout_sessions_timestamp
  before update on public.auditor_checkout_sessions
  for each row execute function public.update_auditor_checkout_sessions_timestamp();

-- -----------------------
-- auditor_billing_events (service-only idempotency/audit)
-- -----------------------
create table if not exists public.auditor_billing_events (
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received','ok','error')),
  payload jsonb,
  primary key (provider, event_id)
);

create index if not exists idx_auditor_billing_events_received_at on public.auditor_billing_events(received_at);
create index if not exists idx_auditor_billing_events_status on public.auditor_billing_events(status);

-- -----------------------
-- auditor_customer_payment_methods (Cardcom tokens; encrypted)
-- -----------------------
create table if not exists public.auditor_customer_payment_methods (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,

  provider text not null default 'cardcom',

  token_enc text not null,
  token_hash text not null,
  token_ex_date text,

  brand text,
  card_num_start text,
  card_num_end text,

  status text not null default 'active' check (status in ('active','expired','revoked')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, provider, token_hash)
);

create index if not exists idx_auditor_payment_methods_company_id on public.auditor_customer_payment_methods(company_id);
create index if not exists idx_auditor_payment_methods_status on public.auditor_customer_payment_methods(company_id, status);
create index if not exists idx_auditor_payment_methods_created_at on public.auditor_customer_payment_methods(company_id, created_at desc);

create or replace function public.update_auditor_customer_payment_methods_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_auditor_customer_payment_methods_timestamp on public.auditor_customer_payment_methods;
create trigger update_auditor_customer_payment_methods_timestamp
  before update on public.auditor_customer_payment_methods
  for each row execute function public.update_auditor_customer_payment_methods_timestamp();

-- -----------------------
-- auditor_subscriptions (current-state per company)
-- -----------------------
create table if not exists public.auditor_subscriptions (
  company_id uuid primary key references public.companies(id) on delete cascade,

  plan_id text not null references public.auditor_plans(id),

  payment_method_id uuid null references public.auditor_customer_payment_methods(id) on delete set null,

  -- Issuer company for invoice/receipt issuance (VOW billing company)
  billing_account_id uuid not null,

  -- Snapshot fields (frozen commercial values)
  plan_snapshot_name text not null,
  plan_snapshot_monthly_amount numeric not null,
  plan_snapshot_currency text not null default 'ILS',
  plan_snapshot_created_at timestamptz not null default now(),

  status text not null check (status in ('pending','active','past_due','canceled','blocked')),

  current_period_start timestamptz,
  current_period_end timestamptz,
  next_billing_date timestamptz,

  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,

  failed_attempts int not null default 0,
  grace_until timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_auditor_subscriptions_status on public.auditor_subscriptions(status);
create index if not exists idx_auditor_subscriptions_next_billing on public.auditor_subscriptions(next_billing_date);

create or replace function public.update_auditor_subscriptions_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_auditor_subscriptions_timestamp on public.auditor_subscriptions;
create trigger update_auditor_subscriptions_timestamp
  before update on public.auditor_subscriptions
  for each row execute function public.update_auditor_subscriptions_timestamp();

-- -----------------------
-- auditor_subscription_charges (ledger per billing period)
-- -----------------------
create table if not exists public.auditor_subscription_charges (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null references public.companies(id) on delete cascade,

  plan_id text not null references public.auditor_plans(id),

  subscription_period_start timestamptz not null,
  subscription_period_end timestamptz not null,

  amount numeric not null,
  currency text not null default 'ILS',

  uniq_asmachta text not null,
  status text not null check (status in ('created','succeeded','failed')),

  provider_transaction_id text,
  provider_internal_deal_number text,
  raw_charge_response jsonb,

  issued_invoice_id uuid references public.documents(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_auditor_subscription_charges_uniq_asmachta on public.auditor_subscription_charges(uniq_asmachta);
create index if not exists idx_auditor_subscription_charges_company_id on public.auditor_subscription_charges(company_id);
create index if not exists idx_auditor_subscription_charges_status on public.auditor_subscription_charges(status);
create index if not exists idx_auditor_subscription_charges_period_start on public.auditor_subscription_charges(subscription_period_start);

create or replace function public.update_auditor_subscription_charges_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_auditor_subscription_charges_timestamp on public.auditor_subscription_charges;
create trigger update_auditor_subscription_charges_timestamp
  before update on public.auditor_subscription_charges
  for each row execute function public.update_auditor_subscription_charges_timestamp();

-- =====================================================
-- RLS
-- =====================================================

-- Sessions: allow tenant to read only if company_id is present and belongs to them.
alter table public.auditor_checkout_sessions enable row level security;
drop policy if exists auditor_checkout_sessions_select on public.auditor_checkout_sessions;
create policy auditor_checkout_sessions_select on public.auditor_checkout_sessions
  for select
  using (company_id in (select public.user_company_ids()));

-- Subscriptions: allow tenant to read its own current status (no raw provider payloads stored here).
alter table public.auditor_subscriptions enable row level security;
drop policy if exists auditor_subscriptions_select on public.auditor_subscriptions;
create policy auditor_subscriptions_select on public.auditor_subscriptions
  for select
  using (company_id in (select public.user_company_ids()));

-- Charges: service-only (no tenant select policy to avoid provider/raw leaks)
alter table public.auditor_subscription_charges enable row level security;

-- Payment methods: service-only
alter table public.auditor_customer_payment_methods enable row level security;

-- Billing events: service-only
alter table public.auditor_billing_events enable row level security;

commit;

select pg_notify('pgrst', 'reload schema');


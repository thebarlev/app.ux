-- ====================================================
-- 051 - Billing: checkout_sessions (Cardcom LowProfile)
-- ====================================================
-- Purpose:
-- - Track checkout flow state (created -> redirected -> paid/failed/canceled)
-- - Store Cardcom LowProfileCode + raw responses for audit/debug
-- Notes:
-- - Cardcom credentials are NOT stored in DB (env-only)
-- - Mutations are service-role only; tenant-scoped SELECT is added separately
-- ====================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.checkout_sessions (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,

  plan_id text not null references public.plans(id),
  billing_interval text not null check (billing_interval in ('month','year')),

  amount numeric not null,
  coin_id int not null,

  status text not null check (status in ('created','redirected','paid','failed','canceled')),

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

create index if not exists idx_checkout_sessions_company_id on public.checkout_sessions(company_id);
create index if not exists idx_checkout_sessions_status on public.checkout_sessions(status);
create index if not exists idx_checkout_sessions_created_at on public.checkout_sessions(created_at);

-- Unique LowProfileCode (when known) for stable lookup in IndicatorUrl callback
create unique index if not exists idx_checkout_sessions_low_profile_code_unique
  on public.checkout_sessions(provider_low_profile_code)
  where provider_low_profile_code is not null;

create or replace function public.update_checkout_sessions_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_checkout_sessions_timestamp on public.checkout_sessions;
create trigger update_checkout_sessions_timestamp
  before update on public.checkout_sessions
  for each row
  execute function public.update_checkout_sessions_timestamp();

commit;

select pg_notify('pgrst', 'reload schema');


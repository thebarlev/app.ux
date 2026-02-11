-- ====================================================
-- 058 - Billing: customer_payment_methods (Cardcom tokens)
-- ====================================================
-- Purpose:
-- - Store Cardcom tokens per buyer company for renewals (ChargeToken)
-- - Keep only the latest active token preferred; older tokens can be revoked
-- Notes:
-- - No Cardcom credentials stored here (env-only)
-- - Mutations are service-role only; tenants do not need direct access
-- ====================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.customer_payment_methods (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,

  provider text not null default 'cardcom',

  token text not null,
  token_ex_date text, -- Cardcom: YYYYMMDD

  brand text,
  card_num_start text,
  card_num_end text,

  status text not null default 'active' check (status in ('active','expired','revoked')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, provider, token)
);

create index if not exists idx_customer_payment_methods_company_id on public.customer_payment_methods(company_id);
create index if not exists idx_customer_payment_methods_status on public.customer_payment_methods(company_id, status);
create index if not exists idx_customer_payment_methods_created_at on public.customer_payment_methods(company_id, created_at desc);

create or replace function public.update_customer_payment_methods_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_customer_payment_methods_timestamp on public.customer_payment_methods;
create trigger update_customer_payment_methods_timestamp
  before update on public.customer_payment_methods
  for each row
  execute function public.update_customer_payment_methods_timestamp();

-- RLS enabled but no tenant policies (service-role only access)
alter table public.customer_payment_methods enable row level security;

commit;

select pg_notify('pgrst', 'reload schema');


-- =====================================================
-- 090 - Auditor Lead → Customer → Project flow
-- =====================================================
-- Purpose:
-- - Extend auditor_leads with status, last_step, SEO fields
-- - Create auditor_customers (post-payment only)
-- - Create auditor_projects (workspace, post-payment only)
-- - Link auditor_subscriptions to auditor_customers
-- =====================================================

begin;

-- -----------------------
-- 1) Extend auditor_leads
-- -----------------------
alter table public.auditor_leads
  add column if not exists status text not null default 'lead_created'
    check (status in ('lead_created','step1_completed','step2_completed','checkout_started','abandoned','subscription_started')),
  add column if not exists last_step text not null default 'step1'
    check (last_step in ('step1','step2','checkout')),
  add column if not exists website_url text,
  add column if not exists keyword_1 text,
  add column if not exists keyword_2 text,
  add column if not exists keyword_3 text,
  add column if not exists business_type text,
  add column if not exists seo_goal text,
  add column if not exists region_type text,
  add column if not exists region_value text,
  add column if not exists marketing jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

-- Allow target_url and normalized_host to be null for register-first flow
alter table public.auditor_leads alter column target_url drop not null;
alter table public.auditor_leads alter column normalized_host drop not null;

-- Backfill existing rows
update public.auditor_leads
set status = 'step1_completed', last_step = 'step1', updated_at = created_at
where status = 'lead_created' or updated_at is null;

-- Unique email (case-insensitive) for register flow - one lead per email in step1/step2/checkout
create unique index if not exists auditor_leads_email_lower_register_ux
  on public.auditor_leads (lower(email))
  where status in ('step1_completed','step2_completed','checkout_started');

-- updated_at trigger
create or replace function public.update_auditor_leads_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_auditor_leads_timestamp on public.auditor_leads;
create trigger update_auditor_leads_timestamp
  before update on public.auditor_leads
  for each row execute function public.update_auditor_leads_timestamp();

-- -----------------------
-- 2) auditor_customers (new)
-- -----------------------
create table if not exists public.auditor_customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  lead_id uuid references public.auditor_leads(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,

  customer_status text not null default 'active'
    check (customer_status in ('active','past_due','canceled','inactive')),
  status_reason text,

  last_payment_at timestamptz,
  next_charge_at timestamptz,
  last_charge_status text,
  last_charge_error text
);

create index if not exists idx_auditor_customers_lead_id on public.auditor_customers(lead_id);
create index if not exists idx_auditor_customers_user_id on public.auditor_customers(user_id);
create index if not exists idx_auditor_customers_status on public.auditor_customers(customer_status);

create or replace function public.update_auditor_customers_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_auditor_customers_timestamp on public.auditor_customers;
create trigger update_auditor_customers_timestamp
  before update on public.auditor_customers
  for each row execute function public.update_auditor_customers_timestamp();

-- -----------------------
-- 3) auditor_projects (new)
-- -----------------------
create table if not exists public.auditor_projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  customer_id uuid not null references public.auditor_customers(id) on delete cascade,

  domain text,
  website_url text,
  keyword_1 text,
  keyword_2 text,
  keyword_3 text,
  business_type text,
  seo_goal text,
  region_type text,
  region_value text,

  status text not null default 'active'
);

create index if not exists idx_auditor_projects_customer_id on public.auditor_projects(customer_id);

create or replace function public.update_auditor_projects_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_auditor_projects_timestamp on public.auditor_projects;
create trigger update_auditor_projects_timestamp
  before update on public.auditor_projects
  for each row execute function public.update_auditor_projects_timestamp();

-- -----------------------
-- 4) auditor_subscriptions - add customer_id
-- -----------------------
alter table public.auditor_subscriptions
  add column if not exists customer_id uuid references public.auditor_customers(id) on delete set null;

create index if not exists idx_auditor_subscriptions_customer_id on public.auditor_subscriptions(customer_id);

-- -----------------------
-- 5) auditor_customers needs company_id for billing
-- -----------------------
alter table public.auditor_customers
  add column if not exists company_id uuid references public.companies(id) on delete set null;

create index if not exists idx_auditor_customers_company_id on public.auditor_customers(company_id);

-- -----------------------
-- RLS
-- -----------------------
alter table public.auditor_leads enable row level security;
-- No select policy for anon/authenticated - service_role only (PII)

alter table public.auditor_customers enable row level security;
drop policy if exists auditor_customers_select_own on public.auditor_customers;
create policy auditor_customers_select_own on public.auditor_customers
  for select using (auth.uid() = user_id);

alter table public.auditor_projects enable row level security;
drop policy if exists auditor_projects_select_own on public.auditor_projects;
create policy auditor_projects_select_own on public.auditor_projects
  for select using (
    customer_id in (select id from public.auditor_customers where user_id = auth.uid())
  );

commit;

select pg_notify('pgrst', 'reload schema');

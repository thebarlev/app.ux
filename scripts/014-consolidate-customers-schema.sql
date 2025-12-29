-- Migration: Consolidate Customers Schema
-- Date: 2025-12-28
-- Purpose: Resolve duplicate customers table definitions between 006 and 013
-- Strategy: Use rich schema from 006, add missing columns from 013, update RLS

-- =====================================================
-- STEP 1: Drop 013's simple table if it exists (to prevent conflicts)
-- =====================================================
-- Note: Only run this if you accidentally ran 013 before 006
-- DROP TABLE IF EXISTS public.customers CASCADE;

-- =====================================================
-- STEP 2: Ensure rich customers table exists (from 006)
-- =====================================================
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  customer_number text,
  external_id text,

  name text not null,
  email text,
  phone text,
  mobile text,

  address_street text,
  address_city text,
  address_zip text,
  address_country text default 'IL',

  customer_type text default 'business'
    check (customer_type in ('individual', 'business', 'government', 'nonprofit')),
  tax_exempt boolean default false,
  payment_terms_days integer default 30,
  credit_limit decimal(12,2),
  currency text default 'ILS',

  status text not null default 'active'
    check (status in ('active', 'inactive', 'blocked')),
  notes text,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),

  unique(company_id, customer_number),
  unique(company_id, external_id)
);

-- =====================================================
-- STEP 3: Add missing column from 013 (mobile_phone alias)
-- =====================================================
-- Note: 006 uses "mobile", 013 uses "mobile_phone"
-- Strategy: Keep "mobile" as primary column, add view/alias if needed
-- No action needed - code will use "mobile" column

-- =====================================================
-- STEP 4: Ensure indexes exist
-- =====================================================
create index if not exists idx_customers_company_id on public.customers(company_id);
create index if not exists idx_customers_external_id on public.customers(company_id, external_id);
create index if not exists idx_customers_name on public.customers(company_id, name);
create index if not exists idx_customers_email on public.customers(email);

-- =====================================================
-- STEP 5: Add name validation constraint
-- =====================================================
alter table public.customers drop constraint if exists customers_name_not_empty;
alter table public.customers
  add constraint customers_name_not_empty check (char_length(name) > 0);

-- =====================================================
-- STEP 6: Enable RLS
-- =====================================================
alter table public.customers enable row level security;

-- =====================================================
-- STEP 7: RLS Policies (matching 013 structure)
-- =====================================================
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select
  using (company_id in (select public.user_company_ids()));

drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers
  for insert
  with check (company_id in (select public.user_company_ids()));

drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers
  for update
  using (company_id in (select public.user_company_ids()));

drop policy if exists customers_delete on public.customers;
create policy customers_delete on public.customers
  for delete
  using (company_id in (select public.user_company_ids()));

-- =====================================================
-- STEP 8: Updated_at trigger
-- =====================================================
create or replace function update_customers_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists customers_updated_at_trigger on public.customers;
create trigger customers_updated_at_trigger
  before update on public.customers
  for each row
  execute function update_customers_updated_at();

-- =====================================================
-- STEP 9: Comments
-- =====================================================
comment on table public.customers is 'Customer/client records for each company (consolidated schema)';
comment on column public.customers.name is 'Customer name (person or business) - REQUIRED';
comment on column public.customers.email is 'Customer email address';
comment on column public.customers.phone is 'Primary phone number';
comment on column public.customers.mobile is 'Mobile phone number (maps to mobile_phone in app code)';
comment on column public.customers.customer_number is 'Auto-generated or manual customer ID';
comment on column public.customers.status is 'active, inactive, or blocked';

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Check table structure:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'customers' AND table_schema = 'public'
-- ORDER BY ordinal_position;

-- Check RLS policies:
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'customers';

-- Check indexes:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'customers';

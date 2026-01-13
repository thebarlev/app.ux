-- Add English address field to companies
-- Safe to run multiple times.

alter table if exists public.companies
  add column if not exists company_address_en text;

-- Ask PostgREST to reload schema cache (Supabase API)
select pg_notify('pgrst', 'reload schema');


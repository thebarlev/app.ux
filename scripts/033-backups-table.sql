-- ====================================================
-- 033 - Backups table (quarterly inventory + checksum metadata)
-- ====================================================
-- Purpose: log backup runs and allow systematic retrieval of backup artifacts.

begin;

create extension if not exists pgcrypto;

create table if not exists public.backups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  ran_at timestamptz not null default now(),
  backup_location text not null,
  checksum text,
  notes text,
  created_by_user_id uuid references auth.users(id)
);

create index if not exists idx_backups_ran_at on public.backups(ran_at desc);
create index if not exists idx_backups_company on public.backups(company_id, ran_at desc);

alter table public.backups enable row level security;

drop policy if exists backups_select on public.backups;
create policy backups_select on public.backups
  for select
  using (company_id is null or company_id in (select public.user_company_ids()));

drop policy if exists backups_insert on public.backups;
create policy backups_insert on public.backups
  for insert
  with check (company_id is null or company_id in (select public.user_company_ids()));

commit;

select pg_notify('pgrst', 'reload schema');


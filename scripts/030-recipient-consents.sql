-- ====================================================
-- 030 - Recipient consents (per company + recipient_identifier)
-- ====================================================
-- Purpose: Store explicit recipient consent evidence for computerized documents.
-- Note: Uses existing multi-tenant model via company_id + user_company_ids().

begin;

create extension if not exists pgcrypto;

create table if not exists public.recipient_consents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  recipient_identifier text not null,
  consent_given_at timestamptz not null,
  consent_revoked_at timestamptz,
  method text not null default 'checkbox' check (method in ('checkbox','web')),
  created_by_user_id uuid references auth.users(id),
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, recipient_identifier)
);

create index if not exists idx_recipient_consents_company on public.recipient_consents(company_id);
create index if not exists idx_recipient_consents_identifier on public.recipient_consents(company_id, recipient_identifier);

-- RLS
alter table public.recipient_consents enable row level security;

drop policy if exists recipient_consents_select on public.recipient_consents;
create policy recipient_consents_select on public.recipient_consents
  for select
  using (company_id in (select public.user_company_ids()));

drop policy if exists recipient_consents_insert on public.recipient_consents;
create policy recipient_consents_insert on public.recipient_consents
  for insert
  with check (company_id in (select public.user_company_ids()));

drop policy if exists recipient_consents_update on public.recipient_consents;
create policy recipient_consents_update on public.recipient_consents
  for update
  using (company_id in (select public.user_company_ids()))
  with check (company_id in (select public.user_company_ids()));

-- Timestamp trigger (reuse pattern)
create or replace function public.update_recipient_consents_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_recipient_consents_timestamp on public.recipient_consents;
create trigger update_recipient_consents_timestamp
  before update on public.recipient_consents
  for each row
  execute function public.update_recipient_consents_timestamp();

commit;

select pg_notify('pgrst', 'reload schema');


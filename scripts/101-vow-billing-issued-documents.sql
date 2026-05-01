-- ====================================================
-- 101 - VOW Billing: issued documents log (provider-agnostic)
-- ====================================================
-- Purpose:
-- - Persist a lightweight record of issued billing documents produced by /api/billing/create-document
-- - Keep provider-agnostic fields for future provider integrations
-- Notes:
-- - Mutations should be service-role only (API route uses service role via createAdminClient)
-- - End-users can read only their own rows
-- ====================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.vow_billing_issued_documents (
  id uuid primary key default gen_random_uuid(),

  user_id uuid null references auth.users(id) on delete set null,
  document_id text not null,

  amount numeric not null,
  vat numeric not null default 0,

  country text not null,
  currency text not null default 'ILS',
  language text not null default 'he',
  provider text not null default 'internal',

  document_url text null,
  status text not null default 'issued' check (status in ('issued','updated','voided','error')),

  created_at timestamptz not null default now()
);

create index if not exists idx_vow_billing_issued_documents_user_id on public.vow_billing_issued_documents(user_id);
create index if not exists idx_vow_billing_issued_documents_document_id on public.vow_billing_issued_documents(document_id);
create index if not exists idx_vow_billing_issued_documents_created_at on public.vow_billing_issued_documents(created_at);

alter table public.vow_billing_issued_documents enable row level security;

-- Read: users can see their own rows (by auth.uid()).
drop policy if exists "vow_billing_issued_documents_select_own" on public.vow_billing_issued_documents;
create policy "vow_billing_issued_documents_select_own"
on public.vow_billing_issued_documents
for select
using (auth.uid() = user_id);

-- Write: service role only (no user inserts/updates/deletes).
drop policy if exists "vow_billing_issued_documents_insert_service_role" on public.vow_billing_issued_documents;
create policy "vow_billing_issued_documents_insert_service_role"
on public.vow_billing_issued_documents
for insert
with check (auth.role() = 'service_role');

drop policy if exists "vow_billing_issued_documents_update_service_role" on public.vow_billing_issued_documents;
create policy "vow_billing_issued_documents_update_service_role"
on public.vow_billing_issued_documents
for update
using (auth.role() = 'service_role');

drop policy if exists "vow_billing_issued_documents_delete_service_role" on public.vow_billing_issued_documents;
create policy "vow_billing_issued_documents_delete_service_role"
on public.vow_billing_issued_documents
for delete
using (auth.role() = 'service_role');

commit;

select pg_notify('pgrst', 'reload schema');


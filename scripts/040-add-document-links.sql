-- =====================================================
-- Document links (organizational only)
-- =====================================================
-- Date: 2026-01-26
-- Purpose: Link documents for UI organization (non-regulatory)
-- Notes:
-- - Adds a new table only; does not modify PDF/template logic
-- - Company scoping is enforced via RLS and server-side validation
-- =====================================================

create table if not exists public.document_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_document_id uuid not null references public.documents(id) on delete cascade,
  target_document_id uuid not null references public.documents(id) on delete cascade,
  link_type text not null check (link_type in ('payment','credit','conversion','cancellation','related')),
  amount decimal(12,2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique(company_id, source_document_id, target_document_id, link_type)
);

create index if not exists idx_document_links_company_source
  on public.document_links(company_id, source_document_id);
create index if not exists idx_document_links_company_target
  on public.document_links(company_id, target_document_id);

-- RLS
alter table public.document_links enable row level security;

drop policy if exists document_links_select on public.document_links;
create policy document_links_select on public.document_links
  for select
  using (company_id in (select public.user_company_ids()));

drop policy if exists document_links_insert on public.document_links;
create policy document_links_insert on public.document_links
  for insert
  with check (company_id in (select public.user_company_ids()));

drop policy if exists document_links_update on public.document_links;
create policy document_links_update on public.document_links
  for update
  using (company_id in (select public.user_company_ids()))
  with check (company_id in (select public.user_company_ids()));

drop policy if exists document_links_delete on public.document_links;
create policy document_links_delete on public.document_links
  for delete
  using (company_id in (select public.user_company_ids()));


-- ====================================================
-- 054 - Billing: RLS (tenant-scoped SELECT only)
-- ====================================================
-- Purpose:
-- - Allow tenants to read their own billing rows (optional UI)
-- - Keep all mutations service-role only (no INSERT/UPDATE/DELETE policies)
-- ====================================================

begin;

-- -----------------------
-- checkout_sessions
-- -----------------------
alter table public.checkout_sessions enable row level security;

drop policy if exists checkout_sessions_select on public.checkout_sessions;
create policy checkout_sessions_select on public.checkout_sessions
  for select
  using (company_id in (select public.user_company_ids()));

-- -----------------------
-- billing_documents
-- -----------------------
alter table public.billing_documents enable row level security;

drop policy if exists billing_documents_select on public.billing_documents;
create policy billing_documents_select on public.billing_documents
  for select
  using (buyer_company_id in (select public.user_company_ids()));

commit;

select pg_notify('pgrst', 'reload schema');


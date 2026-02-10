-- ====================================================
-- 052 - Billing: billing_documents (checkout -> VOW document link)
-- ====================================================
-- Purpose:
-- - Idempotent link between a paid checkout session and the issued accounting document
-- - Ensures retries do not create duplicate documents
-- Notes:
-- - Issuer company is VOW billing company (env: VOW_BILLING_COMPANY_ID)
-- - Mutations are service-role only; tenant-scoped SELECT is added separately
-- ====================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.billing_documents (
  id uuid primary key default gen_random_uuid(),

  checkout_session_id uuid not null references public.checkout_sessions(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete restrict,

  issuer_company_id uuid not null references public.companies(id) on delete restrict,
  buyer_company_id uuid not null references public.companies(id) on delete restrict,

  provider text not null default 'cardcom',
  provider_internal_deal_number text,

  issued_at timestamptz not null default now(),

  unique (checkout_session_id)
);

create index if not exists idx_billing_documents_buyer_company_id on public.billing_documents(buyer_company_id);
create index if not exists idx_billing_documents_issuer_company_id on public.billing_documents(issuer_company_id);
create index if not exists idx_billing_documents_issued_at on public.billing_documents(issued_at);

commit;

select pg_notify('pgrst', 'reload schema');


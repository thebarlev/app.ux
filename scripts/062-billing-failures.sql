-- ====================================================
-- 062 - Billing: failure logging for post-payment issues
-- ====================================================
-- Purpose:
-- - Log when payment succeeded but post-payment side-effects failed
-- - Helps debug: subscription not updated, VOW document not issued
-- ====================================================

begin;

create table if not exists public.billing_failures (
  id uuid primary key default gen_random_uuid(),

  checkout_session_id uuid references public.checkout_sessions(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,

  failure_stage text not null, -- e.g. 'subscription_update', 'document_issuance', 'token_persist'
  error_message text,
  error_details jsonb,

  created_at timestamptz not null default now()
);

create index if not exists idx_billing_failures_checkout on public.billing_failures(checkout_session_id);
create index if not exists idx_billing_failures_company on public.billing_failures(company_id);
create index if not exists idx_billing_failures_created on public.billing_failures(created_at desc);

alter table public.billing_failures enable row level security;
-- No policies: service-role only.

commit;

select pg_notify('pgrst', 'reload schema');

-- ====================================================
-- 057 - Billing: renewal events (recurring charges log)
-- ====================================================
-- Purpose:
-- - Log monthly renewal attempts and results
-- - Provide DB-level idempotency: UNIQUE(company_id, period_start)
-- - Store Cardcom idempotency key (UniqAsmachta) + InternalDealNumber
-- - Link to issued VOW invoice/receipt document (issuer = VOW billing company)
-- Notes:
-- - Service-role only (no tenant policies)
-- ====================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.billing_renewal_events (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null references public.companies(id) on delete cascade,
  plan_id text not null references public.plans(id),

  period_start timestamptz not null,
  period_end timestamptz not null,

  base_amount numeric not null,
  overage_units integer not null default 0,
  overage_unit_price numeric not null default 0,
  total_amount numeric not null,

  uniq_asmachta text not null,
  internal_deal_number text,

  status text not null default 'created' check (status in ('created','succeeded','failed')),
  error_message text,

  issued_document_id uuid references public.documents(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),

  unique (company_id, period_start)
);

create index if not exists idx_billing_renewal_events_company_period on public.billing_renewal_events(company_id, period_start desc);
create index if not exists idx_billing_renewal_events_status on public.billing_renewal_events(status, created_at desc);

alter table public.billing_renewal_events enable row level security;
-- No policies: service-role only.

commit;

select pg_notify('pgrst', 'reload schema');


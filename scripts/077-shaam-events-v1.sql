-- ====================================================
-- 077 - SHAAM: audit events (V1)
-- ====================================================
-- Purpose:
-- - Record SHAAM integration events (token-free payloads)
-- - Keep table server/service-role only (no client privileges)
-- ====================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.shaam_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_type text not null check (event_type in (
    'oauth_start',
    'oauth_connected',
    'oauth_error',
    'oauth_refresh',
    'oauth_expired',
    'oauth_revoked'
  )),
  payload_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_shaam_events_company_created_at on public.shaam_events(company_id, created_at desc);

alter table public.shaam_events enable row level security;

-- No client privileges. No client policies needed.
revoke all on public.shaam_events from anon, authenticated;

commit;

select pg_notify('pgrst', 'reload schema');


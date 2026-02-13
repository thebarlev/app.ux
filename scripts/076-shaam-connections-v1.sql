-- ====================================================
-- 076 - SHAAM: OAuth connections (SANDBOX) (V1)
-- ====================================================
-- Purpose:
-- - Store SHAAM OAuth tokens server-side (encrypted at rest in app layer)
-- - Expose a SAFE view for client/UI reads (no tokens)
-- - Keep all mutations service-role only (no client INSERT/UPDATE/DELETE policies)
--
-- Notes:
-- - RLS is enabled (no FORCE) + tenant SELECT policy.
-- - Table privileges are revoked from client roles; we only grant SELECT on SAFE columns.
-- - The SAFE view is created with security_invoker=true so RLS is enforced for the invoker.
-- ====================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.company_shaam_connections (
  company_id uuid primary key references public.companies(id) on delete cascade,
  provider text not null default 'shaam',

  -- Tokens are encrypted at rest by the application. Nullable to support disconnect wipe.
  access_token text,
  refresh_token text,

  token_type text not null default 'Bearer',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  last_refresh_at timestamptz,
  revoked_at timestamptz,
  scopes text,

  status text not null default 'active' check (status in ('active', 'expired', 'revoked', 'error')),
  last_error_code text,
  last_error_message text
);

create index if not exists idx_company_shaam_connections_status on public.company_shaam_connections(status);
create index if not exists idx_company_shaam_connections_expires_at on public.company_shaam_connections(expires_at);

alter table public.company_shaam_connections enable row level security;

drop policy if exists company_shaam_connections_select on public.company_shaam_connections;
create policy company_shaam_connections_select on public.company_shaam_connections
  for select
  using (company_id in (select public.user_company_ids()));

-- Client roles: never allow direct access to tokens.
revoke all on public.company_shaam_connections from anon, authenticated;

-- Allow UI reads of SAFE columns only (RLS still applies).
grant select (
  company_id,
  provider,
  issued_at,
  expires_at,
  connected_at,
  last_refresh_at,
  revoked_at,
  scopes,
  status,
  last_error_code,
  last_error_message
) on public.company_shaam_connections to authenticated;

create or replace view public.company_shaam_connections_safe
with (security_invoker = true)
as
select
  company_id,
  provider,
  issued_at,
  expires_at,
  connected_at,
  last_refresh_at,
  revoked_at,
  scopes,
  status,
  last_error_code,
  last_error_message
from public.company_shaam_connections;

grant select on public.company_shaam_connections_safe to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');


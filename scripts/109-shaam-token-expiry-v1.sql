-- ====================================================
-- 109 - SHAAM: split token expiry into two columns (V1)
-- ====================================================
-- Purpose:
-- - Store BOTH token lifetimes returned by the ITA token endpoint:
--     access_expires_at   ← from `expires_in`               (~4h)
--     refresh_expires_at  ← from `refresh_token_expires_in` (~89 days)
-- - The existing `expires_at` stays as-is (access-token expiry) so nothing
--   that already reads it changes behaviour. `access_expires_at` mirrors it;
--   `refresh_expires_at` is the new, longer-lived value the status UI should use.
-- - Empirically verified against the sandbox: the refresh response includes
--   `refresh_token_expires_in` (e.g. 7688267s ≈ 89d). We were simply not
--   reading it before — no value is invented here.
--
-- Additive + idempotent. Safe to re-run.
-- ====================================================

begin;

alter table public.company_shaam_connections
  add column if not exists access_expires_at  timestamptz,
  add column if not exists refresh_expires_at timestamptz;

-- Backfill access_expires_at from the existing access-token expiry so the
-- column is never null for already-connected companies.
update public.company_shaam_connections
  set access_expires_at = expires_at
  where access_expires_at is null;

-- Expose the two new columns to the UI (SAFE columns only; RLS still applies).
grant select (access_expires_at, refresh_expires_at)
  on public.company_shaam_connections to authenticated;

-- Recreate the SAFE view to include the two new columns.
create or replace view public.company_shaam_connections_safe
with (security_invoker = true)
as
-- NOTE: new columns are appended at the END of the select list. CREATE OR
-- REPLACE VIEW cannot reorder/insert existing view columns — it only allows
-- adding columns after the current ones.
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
  last_error_message,
  access_expires_at,
  refresh_expires_at
from public.company_shaam_connections;

grant select on public.company_shaam_connections_safe to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');

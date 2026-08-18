-- APPLIED IN PRODUCTION 2026-07-29 as part of a0889cc.
-- The code half of that commit was merged only on 18.8.2026,
-- which is why every token upsert returned 42P10 in between.
-- Idempotent: safe to re-run, but it has already been applied.
-- ====================================================
-- 110 - SHAAM: per-environment connections (V1)
-- ====================================================
-- Purpose:
-- - Let a company hold a SANDBOX connection and a PRODUCTION connection at the
--   same time, instead of one row that the other tier overwrites.
--
-- Why this is required before the production switch:
--   The table keyed on company_id alone means the first production connect
--   overwrites the sandbox tokens. Worse, a sandbox refresh token presented to
--   the production token endpoint returns invalid_grant, and the application
--   then marks the row 'expired' — so the sandbox connection is destroyed by a
--   failed production attempt and there is nothing to roll back to.
--
-- Existing rows are sandbox rows: every token in this table today was minted
-- against openapi.taxes.gov.il/shaam/tsandbox. The default backfills them
-- accordingly, so no connection is lost.
--
-- Additive + idempotent. Safe to re-run.
-- ====================================================

begin;

alter table public.company_shaam_connections
  add column if not exists env text not null default 'sandbox';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.company_shaam_connections'::regclass
      and conname = 'company_shaam_connections_env_check'
  ) then
    alter table public.company_shaam_connections
      add constraint company_shaam_connections_env_check
      check (env in ('sandbox', 'production'));
  end if;
end $$;

-- Re-key on (company_id, env). The old single-column primary key is what makes
-- the two tiers collide.
do $$
declare
  pk_name text;
begin
  select conname into pk_name
  from pg_constraint
  where conrelid = 'public.company_shaam_connections'::regclass
    and contype = 'p';

  if pk_name is not null and pk_name <> 'company_shaam_connections_pkey_env' then
    execute format('alter table public.company_shaam_connections drop constraint %I', pk_name);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.company_shaam_connections'::regclass
      and contype = 'p'
  ) then
    alter table public.company_shaam_connections
      add constraint company_shaam_connections_pkey_env primary key (company_id, env);
  end if;
end $$;

create index if not exists idx_company_shaam_connections_env
  on public.company_shaam_connections(env);

-- Expose the column to the UI (SAFE columns only; RLS still applies).
grant select (env) on public.company_shaam_connections to authenticated;

-- Recreate the SAFE view including env.
-- NOTE: new columns must be appended at the END of the select list —
-- CREATE OR REPLACE VIEW cannot reorder or insert existing view columns.
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
  last_error_message,
  access_expires_at,
  refresh_expires_at,
  env
from public.company_shaam_connections;

grant select on public.company_shaam_connections_safe to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');

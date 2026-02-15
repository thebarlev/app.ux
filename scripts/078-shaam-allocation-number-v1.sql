-- ====================================================
-- 078 - SHAAM: allocation number + decision fields (V1)
-- ====================================================
-- Purpose:
-- - Add global threshold setting for invoice allocation number
-- - Add document fields to store allocation number flow and decision handling
-- - Extend shaam_events event_type CHECK constraint with Phase 2 events
--
-- Notes:
-- - Sandbox-only is enforced at the application layer (Phase 1 config).
-- - Threshold is system-wide via global_settings:
--   - default: 10000 ILS
--   - planned manual change on 2026-06-01: set to 5000
-- ====================================================

begin;

-- ----------------------------------------------------
-- 1) Global threshold (system-wide)
-- ----------------------------------------------------
insert into public.global_settings (setting_key, setting_value)
values ('invoice_allocation_threshold_ils', '10000')
on conflict (setting_key) do nothing;

-- ----------------------------------------------------
-- 2) Documents fields (allocation + decision)
-- ----------------------------------------------------
alter table public.documents
  add column if not exists requires_allocation_number boolean not null default false;

alter table public.documents
  add column if not exists allocation_number text null;

alter table public.documents
  add column if not exists allocation_requested_at timestamptz null;

alter table public.documents
  add column if not exists allocation_status text not null default 'not_required';

alter table public.documents
  add column if not exists allocation_provider_response jsonb null;

alter table public.documents
  add column if not exists shaam_error_id text null;

alter table public.documents
  add column if not exists invoice_decision_type text null;

alter table public.documents
  add column if not exists invoice_decision_sent_at timestamptz null;

-- Allowed values constraint (idempotent)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_allocation_status_check'
  ) then
    alter table public.documents
      add constraint documents_allocation_status_check
      check (allocation_status in (
        'not_required',
        'pending',
        'received',
        'failed',
        'pending_decision',
        'skipped_by_user'
      ));
  end if;
end $$;

-- Indexes
create index if not exists idx_documents_company_allocation_status
  on public.documents(company_id, allocation_status);

create index if not exists idx_documents_company_created_at
  on public.documents(company_id, created_at);

-- ----------------------------------------------------
-- 3) shaam_events: extend allowed event_type values
-- ----------------------------------------------------
alter table public.shaam_events
  drop constraint if exists shaam_events_event_type_check;

alter table public.shaam_events
  add constraint shaam_events_event_type_check
  check (event_type in (
    'oauth_start',
    'oauth_connected',
    'oauth_error',
    'oauth_refresh',
    'oauth_expired',
    'oauth_revoked',
    'allocation_request',
    'allocation_received',
    'allocation_failed',
    'decision_cancel',
    'decision_continue',
    'decision_further_objection'
  ));

commit;

select pg_notify('pgrst', 'reload schema');


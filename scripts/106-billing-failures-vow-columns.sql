-- ====================================================
-- 106 - billing_failures: extend for VOW billing API path
-- ====================================================
-- Purpose:
-- - The existing billing_failures table is keyed on checkout_session_id +
--   company_id (designed for the in-app checkout flow). The new
--   /api/billing/create-document path used by external systems (mioshy)
--   does not have a checkout_session row, so we add nullable columns
--   for the VOW path: document_id, user_id, error_code.
-- - Stage strings used by the VOW path:
--     'vow_create_document_validation'
--     'vow_create_document_provider'
--     'vow_create_document_finalize'
--     'vow_create_document_persist'
--     'vow_repair_missing_invoice'
-- ====================================================

begin;

alter table public.billing_failures
  add column if not exists document_id uuid references public.documents(id) on delete set null,
  add column if not exists user_id uuid,
  add column if not exists error_code text;

create index if not exists idx_billing_failures_document on public.billing_failures(document_id);
create index if not exists idx_billing_failures_user on public.billing_failures(user_id);
create index if not exists idx_billing_failures_stage on public.billing_failures(failure_stage);

comment on column public.billing_failures.document_id is
  'For VOW billing path (no checkout_session_id): the issued/attempted document id.';
comment on column public.billing_failures.user_id is
  'For VOW billing path: the originating user id from the calling system (e.g. mioshy user).';
comment on column public.billing_failures.error_code is
  'Stable error code (e.g. provider_error, signing_failed, finalize_unauthorized) for alerting.';

commit;

select pg_notify('pgrst', 'reload schema');

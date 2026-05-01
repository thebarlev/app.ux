-- ====================================================
-- 108 - vow_billing_issued_documents: idempotency_key + unique index
-- ====================================================
-- Purpose:
--   Close the duplicate-invoice race window between the indicator
--   route and the daily repair cron in mioshy.
--
--   The mioshy retry wrapper already sends:
--     - body.idempotency_key  = "mioshy:<deal_number>"
--     - header x-idempotency-key = same value
--
--   Two rapid concurrent calls (e.g. indicator + repair) can otherwise
--   produce two `documents` rows, two signed PDFs, and two billing
--   records — even though the user paid once.
--
-- Design:
--   1. Add nullable `idempotency_key text` to vow_billing_issued_documents.
--      Existing rows stay NULL — backwards compatible.
--   2. PARTIAL unique index over (provider, idempotency_key) WHERE
--      idempotency_key IS NOT NULL. NULLs do not collide, so historic
--      rows are unaffected. The application code does the pre-flight
--      lookup; the index is the safety net for concurrent inserts.
--   3. The application catches the unique-violation (Postgres SQLSTATE
--      23505) on insert, then re-fetches the existing row and returns
--      its document_id with a fresh signed URL.
-- ====================================================

begin;

alter table public.vow_billing_issued_documents
  add column if not exists idempotency_key text;

create unique index if not exists vow_billing_issued_documents_provider_idempotency_uidx
  on public.vow_billing_issued_documents (provider, idempotency_key)
  where idempotency_key is not null;

-- Lookups in createBillingDocument hit this regularly.
create index if not exists vow_billing_issued_documents_idempotency_key_idx
  on public.vow_billing_issued_documents (idempotency_key)
  where idempotency_key is not null;

comment on column public.vow_billing_issued_documents.idempotency_key is
  'Caller-supplied stable key (e.g. "mioshy:<deal_number>"). Combined with provider it is unique. NULL allowed for legacy rows.';

commit;

select pg_notify('pgrst', 'reload schema');

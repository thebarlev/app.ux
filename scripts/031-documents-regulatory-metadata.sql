-- ====================================================
-- 031 - Documents regulatory metadata (minimal additions)
-- ====================================================
-- Purpose: Add missing columns to support:
-- - signed PDF hash
-- - original-once issuance tracking
-- - one-time recovery attempt tracking
--
-- IMPORTANT: Does not rename or remove existing columns.

begin;

-- Signed PDF checksum (hash of signed bytes)
alter table public.documents
  add column if not exists signed_pdf_sha256 text;

comment on column public.documents.signed_pdf_sha256 is
  'SHA256 checksum of the signed PDF bytes (immutable after finalize).';

-- Certificate fingerprint (if you prefer to store it separately)
alter table public.documents
  add column if not exists signing_cert_fingerprint text;

comment on column public.documents.signing_cert_fingerprint is
  'Signing certificate fingerprint used for this document signing.';

-- Track original issuance (\"מקור פעם אחת\")
alter table public.documents
  add column if not exists original_issued_at timestamptz,
  add column if not exists original_issued_to_recipient_identifier text,
  add column if not exists original_issued_language text;

-- Track one-time recovery attempt if storage missing after finalize
alter table public.documents
  add column if not exists original_recovery_attempted_at timestamptz;

-- Indexes for retrieval/audit
create index if not exists idx_documents_doc_number_lookup
  on public.documents(company_id, document_type, document_number);

create index if not exists idx_documents_issue_date_lookup
  on public.documents(company_id, issue_date);

commit;

select pg_notify('pgrst', 'reload schema');


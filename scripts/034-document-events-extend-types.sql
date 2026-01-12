-- ====================================================
-- 034 - Extend document_events.event_type allowed values
-- ====================================================
-- Purpose: record consent/original issuance/recovery/backup events.
-- IMPORTANT: This updates the CHECK constraint to include new values.

begin;

-- Drop and recreate constraint safely (name may vary, so we drop by known name from 006 script)
alter table public.document_events drop constraint if exists document_events_event_type_check;

alter table public.document_events
  add constraint document_events_event_type_check
  check (event_type in (
    'created', 'updated', 'finalized', 'cancelled', 'voided',
    'signed', 'pdf_generated', 'emailed', 'printed', 'viewed',
    'consent_given', 'consent_revoked',
    'original_issued', 'copy_downloaded',
    'pdf_recovered',
    'backup_ran'
  ));

commit;

select pg_notify('pgrst', 'reload schema');


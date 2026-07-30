-- 112 · report_email_sent_at on auditor_scans
--
-- The claim ticket for the report email. The worker selects scans that are
-- status='done' with this column still null, and stamps it once a send is
-- accepted, so a scan is never mailed twice.
--
-- Deliberately nullable with no default and no NOT NULL. A default would make
-- Postgres rewrite every existing row, and a NOT NULL would need a backfill
-- value that would be a lie: no report has been emailed yet, and now() or
-- epoch would both claim otherwise. Null means "not sent", which is true for
-- every row that exists today and needs no backfill to become true.
--
-- Additive only. Nothing reads or writes this column until the worker ships,
-- so applying it early is inert.

alter table public.auditor_scans
  add column if not exists report_email_sent_at timestamptz;

comment on column public.auditor_scans.report_email_sent_at is
  'When the report email was accepted for delivery. Null means not sent. Claimed by the report-email worker; never backfilled.';

-- The worker's only query shape: done scans still awaiting a send. Partial, so
-- the index holds just the work queue rather than every scan ever run — the
-- rows drop out of it as they are stamped.
create index if not exists auditor_scans_report_email_pending_idx
  on public.auditor_scans (finished_at)
  where status = 'done' and report_email_sent_at is null;

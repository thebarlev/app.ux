update auditor_scan_pages
set state = 'queued'
where analysis = '{}'::jsonb
or analysis is null;

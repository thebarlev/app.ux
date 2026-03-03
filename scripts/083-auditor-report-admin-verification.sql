-- =====================================================
-- 083 - Auditor report_admin verification
-- =====================================================
-- Run in Supabase SQL Editor to verify report_admin.rules population.
-- auditor_scans has report_public, report_admin (JSONB). Rules are also in auditor_scan_rules.

-- Verification: compare rules count in report_admin vs auditor_scan_rules
select
  s.id,
  s.status,
  s.step,
  s.normalized_host,
  s.company_id,
  coalesce(jsonb_array_length(s.report_admin->'rules'), 0) as rules_count_admin,
  (select count(*) from public.auditor_scan_rules r where r.scan_id = s.id) as rules_count_raw,
  case
    when s.status = 'done' and coalesce(jsonb_array_length(s.report_admin->'rules'), 0) = 0
      and (select count(*) from public.auditor_scan_rules r where r.scan_id = s.id) > 0
    then 'NEEDS_BACKFILL'
    when s.status = 'done' and coalesce(jsonb_array_length(s.report_admin->'rules'), 0) > 0
    then 'OK'
    else 'N/A'
  end as verification_status
from public.auditor_scans s
where s.status in ('done', 'running')
order by s.updated_at desc
limit 50;

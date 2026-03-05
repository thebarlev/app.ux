-- =====================================================
-- 103 - Auditor: score history table
-- =====================================================

create table if not exists public.auditor_scan_score_history (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.auditor_scans(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  normalized_host text not null,
  score_total integer not null,
  score_breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists auditor_scan_score_history_company_host_created_idx
  on public.auditor_scan_score_history(company_id, normalized_host, created_at desc);

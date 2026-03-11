-- =====================================================
-- 095 - AUDITOR AI analysis engine
-- =====================================================
-- CRITICAL:
-- - Must NOT touch billing/invoicing/subscription objects.
-- - Only auditor_* tables/columns/constraints are introduced here.

begin;

create extension if not exists pgcrypto;

alter table public.auditor_scans
  drop constraint if exists auditor_scans_step_check;

alter table public.auditor_scans
  add constraint auditor_scans_step_check
  check (
    step in (
      'normalize',
      'robots',
      'sitemap',
      'ai_files',
      'sample',
      'fetch_pages',
      'extract',
      'keyword_analysis',
      'topic_discovery',
      'rules',
      'ai_readiness',
      'recommendations',
      'persist',
      'done'
    )
  );

alter table public.auditor_scan_pages
  add column if not exists ai_analysis jsonb not null default '{}'::jsonb;

create table if not exists public.auditor_keywords (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.auditor_scans(id) on delete cascade,
  page_id uuid not null references public.auditor_scan_pages(id) on delete cascade,
  keyword text not null,
  keyword_type text not null check (keyword_type in ('primary','secondary','question','entity')),
  confidence numeric,
  created_at timestamptz not null default now()
);

create index if not exists auditor_keywords_scan_idx
  on public.auditor_keywords (scan_id);

create index if not exists auditor_keywords_page_idx
  on public.auditor_keywords (page_id);

create index if not exists auditor_keywords_keyword_idx
  on public.auditor_keywords (keyword);

alter table public.auditor_keywords enable row level security;
-- No policies: admin/service-role only.

create table if not exists public.auditor_topics (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.auditor_scans(id) on delete cascade,
  topic text not null,
  coverage_score numeric,
  missing_pages integer,
  created_at timestamptz not null default now()
);

create index if not exists auditor_topics_scan_idx
  on public.auditor_topics (scan_id);

alter table public.auditor_topics enable row level security;
-- No policies: admin/service-role only.

create table if not exists public.auditor_recommendations (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.auditor_scans(id) on delete cascade,
  type text not null,
  priority text not null check (priority in ('low','medium','high')),
  title text not null,
  description text not null,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists auditor_recommendations_scan_idx
  on public.auditor_recommendations (scan_id);

create index if not exists auditor_recommendations_priority_idx
  on public.auditor_recommendations (priority);

alter table public.auditor_recommendations enable row level security;
-- No policies: admin/service-role only.

commit;

select pg_notify('pgrst', 'reload schema');

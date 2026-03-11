-- =====================================================
-- 096 - AUDITOR competitor discovery engine
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
      'competitor_discovery',
      'competitor_crawl',
      'competitor_keywords',
      'content_gap_analysis',
      'recommendations',
      'persist',
      'done'
    )
  );

create table if not exists public.auditor_competitors (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.auditor_scans(id) on delete cascade,
  domain text not null,
  source text not null check (source in ('serp', 'heuristic')),
  confidence numeric,
  rank integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(scan_id, domain)
);

create index if not exists auditor_competitors_scan_idx
  on public.auditor_competitors (scan_id);

create index if not exists auditor_competitors_domain_idx
  on public.auditor_competitors (domain);

alter table public.auditor_competitors enable row level security;
-- No policies: admin/service-role only.

create table if not exists public.auditor_competitor_pages (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.auditor_scans(id) on delete cascade,
  competitor_id uuid not null references public.auditor_competitors(id) on delete cascade,
  url text not null,
  path text,
  page_type text not null default 'page' check (page_type in ('homepage', 'service', 'blog', 'page')),
  state text not null default 'queued' check (state in ('queued', 'fetched', 'extracted', 'skipped', 'failed')),
  status_code integer,
  title text,
  content jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  fetched_at timestamptz,
  extracted_at timestamptz,
  unique(scan_id, competitor_id, url)
);

create index if not exists auditor_competitor_pages_scan_idx
  on public.auditor_competitor_pages (scan_id);

create index if not exists auditor_competitor_pages_competitor_idx
  on public.auditor_competitor_pages (competitor_id);

alter table public.auditor_competitor_pages enable row level security;
-- No policies: admin/service-role only.

create table if not exists public.auditor_competitor_keywords (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.auditor_scans(id) on delete cascade,
  competitor_id uuid not null references public.auditor_competitors(id) on delete cascade,
  competitor_page_id uuid not null references public.auditor_competitor_pages(id) on delete cascade,
  keyword text not null,
  keyword_type text not null check (keyword_type in ('primary', 'secondary', 'question', 'entity')),
  confidence numeric,
  created_at timestamptz not null default now()
);

create index if not exists auditor_competitor_keywords_scan_idx
  on public.auditor_competitor_keywords (scan_id);

create index if not exists auditor_competitor_keywords_competitor_idx
  on public.auditor_competitor_keywords (competitor_id);

create index if not exists auditor_competitor_keywords_keyword_idx
  on public.auditor_competitor_keywords (keyword);

alter table public.auditor_competitor_keywords enable row level security;
-- No policies: admin/service-role only.

create table if not exists public.auditor_content_gaps (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.auditor_scans(id) on delete cascade,
  keyword text not null,
  topic text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  competitor_count integer not null default 0,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists auditor_content_gaps_scan_idx
  on public.auditor_content_gaps (scan_id);

create index if not exists auditor_content_gaps_priority_idx
  on public.auditor_content_gaps (priority);

alter table public.auditor_content_gaps enable row level security;
-- No policies: admin/service-role only.

commit;

select pg_notify('pgrst', 'reload schema');

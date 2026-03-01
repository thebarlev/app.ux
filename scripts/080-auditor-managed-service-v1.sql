-- =====================================================
-- 080 - AUDITOR (Managed Service): leads + schedules + admin-only internals
-- =====================================================
-- CRITICAL:
-- - Must NOT touch billing/invoicing/subscription objects.
-- - Must keep strict isolation: only auditor_* objects here.

create extension if not exists pgcrypto;

-- =====================================================
-- Leads (anonymous customer intake)
-- =====================================================

create table if not exists public.auditor_leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,

  full_name text not null,
  email text not null,
  phone text not null,

  target_url text not null,
  normalized_host text not null,

  consent_terms boolean not null,
  consent_contact boolean not null,

  created_at timestamptz not null default now()
);

create index if not exists auditor_leads_email_idx on public.auditor_leads (email);
create index if not exists auditor_leads_normalized_host_idx on public.auditor_leads (normalized_host);

alter table public.auditor_leads enable row level security;
-- No policies: written/read via service-role + system admin endpoints only.

-- =====================================================
-- Expand auditor_scans for managed service model
-- =====================================================

-- allow anonymous lead scans: company_id + created_by_user_id become nullable
alter table public.auditor_scans alter column company_id drop not null;
alter table public.auditor_scans alter column created_by_user_id drop not null;

alter table public.auditor_scans
  add column if not exists lead_id uuid references public.auditor_leads(id) on delete set null,
  add column if not exists lead_email_normalized text,
  add column if not exists normalized_host text,
  add column if not exists scan_access_token text,
  add column if not exists created_by_role text not null default 'customer'
    check (created_by_role in ('customer','admin','system')),
  add column if not exists scan_kind text not null default 'initial'
    check (scan_kind in ('initial','verification','scheduled')),
  add column if not exists heartbeat_at timestamptz,
  add column if not exists attempts integer not null default 0,
  add column if not exists last_error text,
  add column if not exists coverage jsonb not null default '{}'::jsonb,
  add column if not exists confidence jsonb not null default '{}'::jsonb,
  add column if not exists report_public jsonb not null default '{}'::jsonb,
  add column if not exists report_admin jsonb not null default '{}'::jsonb,
  add column if not exists parent_scan_id uuid references public.auditor_scans(id) on delete set null;

-- enforce token uniqueness when present (customer flows)
create unique index if not exists auditor_scans_scan_access_token_ux
  on public.auditor_scans (scan_access_token)
  where scan_access_token is not null;

-- one-time initial scan uniqueness: (host,email) for customer initial scans
-- NOTE: lead_email_normalized must be set for initial customer scans.
create unique index if not exists auditor_scans_one_time_initial_customer_ux
  on public.auditor_scans (normalized_host, lead_email_normalized)
  where scan_kind = 'initial' and created_by_role = 'customer';

create index if not exists auditor_scans_kind_status_idx
  on public.auditor_scans (scan_kind, status, updated_at desc);

create index if not exists auditor_scans_company_created_at_idx_v2
  on public.auditor_scans (company_id, created_at desc)
  where company_id is not null;

-- =====================================================
-- Findings + tasks (admin-only internals)
-- =====================================================

create table if not exists public.auditor_scan_findings (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.auditor_scans(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,

  rule_key text not null,
  severity text not null check (severity in ('low','medium','high','critical')),
  status text not null check (status in ('pass','warn','fail')),
  scope text not null default 'site' check (scope in ('site','page')),

  url text,
  title text not null,
  summary text not null,
  recommendation text not null,
  evidence jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists auditor_scan_findings_scan_severity_idx
  on public.auditor_scan_findings (scan_id, severity);

alter table public.auditor_scan_findings enable row level security;
-- No policies: admin/service-role only.

create table if not exists public.auditor_tasks (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.auditor_scans(id) on delete cascade,
  finding_id uuid references public.auditor_scan_findings(id) on delete set null,

  rule_key text,
  status text not null default 'open' check (status in ('open','in_progress','fixed','wont_fix')),
  assigned_to uuid references auth.users(id) on delete set null,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists auditor_tasks_scan_status_idx
  on public.auditor_tasks (scan_id, status);

alter table public.auditor_tasks enable row level security;
-- No policies: admin/service-role only.

-- =====================================================
-- Schedules (paid managed service)
-- =====================================================

create table if not exists public.auditor_scan_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  normalized_host text not null,

  tier text not null check (tier in ('basic','pro')),
  frequency_days integer not null check (frequency_days in (7,14)),

  is_active boolean not null default true,
  next_run_at timestamptz not null,
  last_run_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(company_id, normalized_host)
);

create index if not exists auditor_scan_schedules_next_run_idx
  on public.auditor_scan_schedules (is_active, next_run_at);

alter table public.auditor_scan_schedules enable row level security;
-- No policies: updated by admin/service-role only.

-- =====================================================
-- Extend pages table for managed extraction
-- =====================================================
alter table public.auditor_scan_pages
  add column if not exists headers jsonb not null default '{}'::jsonb,
  add column if not exists extracted jsonb not null default '{}'::jsonb;

-- =====================================================
-- Tighten access to internals for paid customers
-- =====================================================
-- Existing 079 policies allow company members to read pages/rules/logs.
-- Managed-service model: paid customers must NOT access pages/findings/tasks internals.
-- Keep only auditor_scans readable via company_id; everything else service-role/admin only.

-- pages
drop policy if exists auditor_scan_pages_select on public.auditor_scan_pages;
drop policy if exists auditor_scan_pages_insert on public.auditor_scan_pages;
drop policy if exists auditor_scan_pages_update on public.auditor_scan_pages;

-- rules
drop policy if exists auditor_scan_rules_select on public.auditor_scan_rules;
drop policy if exists auditor_scan_rules_insert on public.auditor_scan_rules;
drop policy if exists auditor_scan_rules_update on public.auditor_scan_rules;
drop policy if exists auditor_scan_rules_delete on public.auditor_scan_rules;

-- logs
drop policy if exists auditor_scan_logs_select on public.auditor_scan_logs;
drop policy if exists auditor_scan_logs_insert on public.auditor_scan_logs;

-- Allow pre-payment scans without a company_id.
alter table public.auditor_scan_pages alter column company_id drop not null;
alter table public.auditor_scan_rules alter column company_id drop not null;
alter table public.auditor_scan_logs alter column company_id drop not null;

-- scans: keep company read-only select
drop policy if exists auditor_scans_select on public.auditor_scans;
create policy auditor_scans_select on public.auditor_scans
  for select
  using (company_id is not null and company_id in (select public.user_company_ids()));


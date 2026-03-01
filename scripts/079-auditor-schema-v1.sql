-- =====================================================
-- 079 - AUDITOR POC (Isolated): schema + RLS + RPCs
-- =====================================================
-- CRITICAL: This migration must NOT touch billing/invoicing/subscription objects.
-- Only auditor_* tables/functions/policies are introduced here.

create extension if not exists pgcrypto;

-- =====================================================
-- Tables
-- =====================================================

create table if not exists public.auditor_scans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,

  target_url text not null,
  normalized_url text,
  hostname text,

  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed')),
  step text not null default 'normalize'
    check (step in ('normalize','robots','sitemap','ai_files','sample','fetch_pages','extract','rules','persist','done')),

  locked_at timestamptz,
  locked_by text,
  lock_version integer not null default 0,

  score_total integer,
  score_breakdown jsonb not null default '{}'::jsonb,
  artifacts jsonb not null default '{}'::jsonb,

  error text,

  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists auditor_scans_company_created_at_idx
  on public.auditor_scans(company_id, created_at desc);
create index if not exists auditor_scans_created_by_created_at_idx
  on public.auditor_scans(created_by_user_id, created_at desc);
create index if not exists auditor_scans_status_idx
  on public.auditor_scans(status);

create table if not exists public.auditor_scan_pages (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.auditor_scans(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,

  url text not null,
  path text,

  state text not null default 'queued'
    check (state in ('queued','fetched','extracted','skipped','failed')),

  status_code integer,
  content_type text,
  fetch_ms integer,
  content_bytes integer,

  html text,

  title text,
  meta_description text,
  canonical text,
  lang text,
  dir text,

  has_og boolean,
  has_twitter boolean,
  jsonld_types jsonb not null default '[]'::jsonb,
  tracking jsonb not null default '{}'::jsonb,

  error text,

  created_at timestamptz not null default now(),
  fetched_at timestamptz,
  extracted_at timestamptz,

  unique(scan_id, url)
);

create index if not exists auditor_scan_pages_scan_state_idx
  on public.auditor_scan_pages(scan_id, state);

create table if not exists public.auditor_scan_rules (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.auditor_scans(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,

  rule_key text not null,
  category text not null
    check (category in ('technical','schema','ai_readiness','tracking')),
  weight integer not null default 0 check (weight >= 0 and weight <= 100),

  status text not null
    check (status in ('pass','warn','fail')),
  impact text not null
    check (impact in ('low','medium','high')),
  effort text not null
    check (effort in ('low','medium','high')),

  evidence jsonb not null default '{}'::jsonb,
  recommendation_he text not null,

  created_at timestamptz not null default now(),

  unique(scan_id, rule_key)
);

create index if not exists auditor_scan_rules_scan_category_idx
  on public.auditor_scan_rules(scan_id, category);

create table if not exists public.auditor_scan_logs (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.auditor_scans(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,

  ts timestamptz not null default now(),
  level text not null default 'info'
    check (level in ('debug','info','warn','error')),
  message text not null,
  data jsonb not null default '{}'::jsonb
);

create index if not exists auditor_scan_logs_scan_ts_idx
  on public.auditor_scan_logs(scan_id, ts desc);

create table if not exists public.auditor_user_daily_usage (
  day date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  count integer not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day, user_id, company_id)
);

create table if not exists public.auditor_global_daily_usage (
  day date primary key,
  count integer not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================
-- RPCs (atomic usage increments)
-- =====================================================

create or replace function public.auditor_inc_user_daily_usage(
  p_company_id uuid,
  p_day date,
  p_limit integer
)
returns table(allowed boolean, new_count integer, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_count integer;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return query select false, 0, 0;
    return;
  end if;

  insert into public.auditor_user_daily_usage(day, user_id, company_id, count)
  values (p_day, v_uid, p_company_id, 1)
  on conflict (day, user_id, company_id)
  do update set
    count = public.auditor_user_daily_usage.count + 1,
    updated_at = now()
  returning count into v_count;

  if v_count > p_limit then
    -- rollback the increment by decrementing back (best-effort).
    update public.auditor_user_daily_usage
      set count = greatest(0, count - 1), updated_at = now()
      where day = p_day and user_id = v_uid and company_id = p_company_id;
    return query select false, v_count - 1, 0;
    return;
  end if;

  return query select true, v_count, greatest(0, p_limit - v_count);
end;
$$;

comment on function public.auditor_inc_user_daily_usage(uuid, date, integer)
  is 'Atomic per-user daily auditor usage increment for current auth.uid().';

create or replace function public.auditor_inc_global_daily_usage(
  p_day date,
  p_limit integer
)
returns table(allowed boolean, new_count integer, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_count integer;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return query select false, 0, 0;
    return;
  end if;

  insert into public.auditor_global_daily_usage(day, count)
  values (p_day, 1)
  on conflict (day)
  do update set
    count = public.auditor_global_daily_usage.count + 1,
    updated_at = now()
  returning count into v_count;

  if v_count > p_limit then
    update public.auditor_global_daily_usage
      set count = greatest(0, count - 1), updated_at = now()
      where day = p_day;
    return query select false, v_count - 1, 0;
    return;
  end if;

  return query select true, v_count, greatest(0, p_limit - v_count);
end;
$$;

comment on function public.auditor_inc_global_daily_usage(date, integer)
  is 'Atomic global daily auditor usage increment (per day). Requires authenticated user.';

-- =====================================================
-- RLS (auditor tables only)
-- =====================================================

alter table public.auditor_scans enable row level security;
alter table public.auditor_scan_pages enable row level security;
alter table public.auditor_scan_rules enable row level security;
alter table public.auditor_scan_logs enable row level security;
alter table public.auditor_user_daily_usage enable row level security;
alter table public.auditor_global_daily_usage enable row level security;

-- auditor_scans
drop policy if exists auditor_scans_select on public.auditor_scans;
create policy auditor_scans_select on public.auditor_scans
  for select
  using (company_id in (select public.user_company_ids()));

drop policy if exists auditor_scans_insert on public.auditor_scans;
create policy auditor_scans_insert on public.auditor_scans
  for insert
  with check (
    company_id in (select public.user_company_ids())
    and created_by_user_id = auth.uid()
  );

drop policy if exists auditor_scans_update on public.auditor_scans;
create policy auditor_scans_update on public.auditor_scans
  for update
  using (company_id in (select public.user_company_ids()));

-- auditor_scan_pages
drop policy if exists auditor_scan_pages_select on public.auditor_scan_pages;
create policy auditor_scan_pages_select on public.auditor_scan_pages
  for select
  using (company_id in (select public.user_company_ids()));

drop policy if exists auditor_scan_pages_insert on public.auditor_scan_pages;
create policy auditor_scan_pages_insert on public.auditor_scan_pages
  for insert
  with check (company_id in (select public.user_company_ids()));

drop policy if exists auditor_scan_pages_update on public.auditor_scan_pages;
create policy auditor_scan_pages_update on public.auditor_scan_pages
  for update
  using (company_id in (select public.user_company_ids()));

-- auditor_scan_rules
drop policy if exists auditor_scan_rules_select on public.auditor_scan_rules;
create policy auditor_scan_rules_select on public.auditor_scan_rules
  for select
  using (company_id in (select public.user_company_ids()));

drop policy if exists auditor_scan_rules_insert on public.auditor_scan_rules;
create policy auditor_scan_rules_insert on public.auditor_scan_rules
  for insert
  with check (company_id in (select public.user_company_ids()));

drop policy if exists auditor_scan_rules_update on public.auditor_scan_rules;
create policy auditor_scan_rules_update on public.auditor_scan_rules
  for update
  using (company_id in (select public.user_company_ids()));

drop policy if exists auditor_scan_rules_delete on public.auditor_scan_rules;
create policy auditor_scan_rules_delete on public.auditor_scan_rules
  for delete
  using (company_id in (select public.user_company_ids()));

-- auditor_scan_logs
drop policy if exists auditor_scan_logs_select on public.auditor_scan_logs;
create policy auditor_scan_logs_select on public.auditor_scan_logs
  for select
  using (company_id in (select public.user_company_ids()));

drop policy if exists auditor_scan_logs_insert on public.auditor_scan_logs;
create policy auditor_scan_logs_insert on public.auditor_scan_logs
  for insert
  with check (company_id in (select public.user_company_ids()));

-- usage tables
drop policy if exists auditor_user_daily_usage_select on public.auditor_user_daily_usage;
create policy auditor_user_daily_usage_select on public.auditor_user_daily_usage
  for select
  using (company_id in (select public.user_company_ids()) and user_id = auth.uid());

drop policy if exists auditor_user_daily_usage_update on public.auditor_user_daily_usage;
create policy auditor_user_daily_usage_update on public.auditor_user_daily_usage
  for update
  using (company_id in (select public.user_company_ids()) and user_id = auth.uid());

drop policy if exists auditor_user_daily_usage_insert on public.auditor_user_daily_usage;
create policy auditor_user_daily_usage_insert on public.auditor_user_daily_usage
  for insert
  with check (company_id in (select public.user_company_ids()) and user_id = auth.uid());

drop policy if exists auditor_global_daily_usage_select on public.auditor_global_daily_usage;
create policy auditor_global_daily_usage_select on public.auditor_global_daily_usage
  for select
  using (auth.uid() is not null);

drop policy if exists auditor_global_daily_usage_update on public.auditor_global_daily_usage;
create policy auditor_global_daily_usage_update on public.auditor_global_daily_usage
  for update
  using (auth.uid() is not null);

drop policy if exists auditor_global_daily_usage_insert on public.auditor_global_daily_usage;
create policy auditor_global_daily_usage_insert on public.auditor_global_daily_usage
  for insert
  with check (auth.uid() is not null);


-- ====================================================
-- 083 - Auditor marketing purchase links + attribution
-- ====================================================
-- Purpose:
-- - Support marketing purchase flow: link_id -> plan_id mapping (server-truth)
-- - Store UTM/attribution metadata on auditor checkout sessions
-- - Align auditor plans catalog for marketing (Basic/Pro only)
-- Notes:
-- - Keep strict isolation: only auditor_* objects
-- - Prices in auditor_plans are treated as "display/gross" (existing auditor billing logic)
-- ====================================================

begin;

create extension if not exists pgcrypto;

-- -----------------------
-- auditor_marketing_links
-- -----------------------
create table if not exists public.auditor_marketing_links (
  id text primary key,
  plan_id text not null references public.auditor_plans(id),
  is_active boolean not null default true,
  source text not null default 'vow',
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_auditor_marketing_links_plan_id on public.auditor_marketing_links(plan_id);
create index if not exists idx_auditor_marketing_links_is_active on public.auditor_marketing_links(is_active);

-- Seed stable link IDs (idempotent)
insert into public.auditor_marketing_links (id, plan_id, is_active, source, notes)
values
  ('a_basic', 'basic', true, 'vow', 'Marketing: Basic monthly'),
  ('a_pro', 'pro', true, 'vow', 'Marketing: Pro monthly')
on conflict (id) do nothing;

-- -----------------------
-- Attribution columns on auditor_checkout_sessions
-- -----------------------
alter table public.auditor_checkout_sessions
  add column if not exists marketing_source text,
  add column if not exists link_id text,
  add column if not exists created_from_url text,
  add column if not exists utm_json jsonb;

create index if not exists idx_auditor_checkout_sessions_link_id on public.auditor_checkout_sessions(link_id);

-- -----------------------
-- Align plans for marketing (do NOT drop/rename IDs; just adjust and deactivate)
-- -----------------------
update public.auditor_plans
set monthly_amount = 497, updated_at = now()
where id = 'pro' and (monthly_amount is distinct from 497);

update public.auditor_plans
set is_active = false, updated_at = now()
where id = 'premium' and is_active is distinct from false;

commit;

select pg_notify('pgrst', 'reload schema');


-- ====================================================
-- 094 - Auditor registration log
-- ====================================================
-- Tracks every new Auditor user registration for internal CRM/lead purposes.
-- Separate from auditor_leads (which is used by the Cardcom payment checkout flow).

create table if not exists public.auditor_registration_log (
  id           uuid        primary key default gen_random_uuid(),
  email        text        not null,
  name         text,
  company_name text,
  website      text,
  source       text        not null default 'self_register',
  created_at   timestamptz not null default now()
);

create index if not exists idx_auditor_registration_log_email
  on public.auditor_registration_log(email);

alter table public.auditor_registration_log enable row level security;
-- No public policies — written and read via service-role only.

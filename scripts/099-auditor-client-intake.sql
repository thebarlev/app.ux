begin;

create table if not exists public.auditor_client_intake (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  company_name text,
  website text,
  business_age text,
  seo_done_before boolean,
  google_ads_before boolean,
  keywords text,
  competitors text,
  country text,
  languages text,
  ga_status text,
  gsc_status text,
  gtm_status text,
  website_access text,
  created_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists auditor_client_intake_company_created_at_idx
  on public.auditor_client_intake(company_id, created_at desc);

create index if not exists auditor_client_intake_user_created_at_idx
  on public.auditor_client_intake(user_id, created_at desc);

alter table public.auditor_client_intake enable row level security;

drop policy if exists auditor_client_intake_select on public.auditor_client_intake;
create policy auditor_client_intake_select on public.auditor_client_intake
  for select
  using (
    user_id = auth.uid()
    and company_id in (select public.user_company_ids())
  );

drop policy if exists auditor_client_intake_insert on public.auditor_client_intake;
create policy auditor_client_intake_insert on public.auditor_client_intake
  for insert
  with check (
    user_id = auth.uid()
    and company_id in (select public.user_company_ids())
  );

drop policy if exists auditor_client_intake_update on public.auditor_client_intake;
create policy auditor_client_intake_update on public.auditor_client_intake
  for update
  using (
    user_id = auth.uid()
    and company_id in (select public.user_company_ids())
  )
  with check (
    user_id = auth.uid()
    and company_id in (select public.user_company_ids())
  );

commit;

select pg_notify('pgrst', 'reload schema');

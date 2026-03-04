-- ====================================================
-- 099 - Auditor: project notes + CRM-style tasks
-- ====================================================

begin;

-- Notes (comments)
create table if not exists public.auditor_project_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.auditor_projects(id) on delete cascade,
  content text not null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_auditor_project_notes_project on public.auditor_project_notes(project_id);

-- CRM-style tasks
create table if not exists public.auditor_project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.auditor_projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'cancelled')),
  due_date date,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_auditor_project_tasks_project on public.auditor_project_tasks(project_id);
create index if not exists idx_auditor_project_tasks_status on public.auditor_project_tasks(status);

alter table public.auditor_project_notes enable row level security;
alter table public.auditor_project_tasks enable row level security;

-- Admin-only: system_admins can access (service_role bypasses RLS)
drop policy if exists auditor_project_notes_admin on public.auditor_project_notes;
create policy auditor_project_notes_admin on public.auditor_project_notes
  for all using (exists (select 1 from public.system_admins where auth_user_id = auth.uid()));

drop policy if exists auditor_project_tasks_admin on public.auditor_project_tasks;
create policy auditor_project_tasks_admin on public.auditor_project_tasks
  for all using (exists (select 1 from public.system_admins where auth_user_id = auth.uid()));

commit;

select pg_notify('pgrst', 'reload schema');

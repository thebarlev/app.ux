-- ====================================================
-- ROLLBACK for 119
-- ====================================================
-- Recreates templates_update exactly as scripts/023:55-98 defined it, with all
-- three branches including the third.
--
-- Running this reopens the hole: any authenticated user regains UPDATE on every
-- global template row, html_template and css included, and those are rendered
-- into other tenants' documents.
--
-- If the live definition had drifted from scripts/023 before 119 ran, this file
-- restores the FILE's version, not that drift. Use the capture taken before 119
-- if the two differ.
-- ====================================================

begin;

drop policy if exists templates_update on public.templates;

create policy templates_update on public.templates
  for update
  using (
    (
      company_id is null
      and exists (
        select 1 from public.system_admins
        where auth_user_id = auth.uid()
      )
    )
    or
    (
      company_id is not null
      and company_id in (select public.user_company_ids())
    )
    or
    (
      company_id is null
      and auth.uid() is not null
    )
  )
  with check (
    (
      company_id is null
      and exists (
        select 1 from public.system_admins
        where auth_user_id = auth.uid()
      )
    )
    or
    (
      company_id is not null
      and company_id in (select public.user_company_ids())
    )
    or
    (
      company_id is null
      and auth.uid() is not null
    )
  );

commit;

-- ── VERIFY the rollback landed ────────────────────────────────────────────────
select policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'templates'
  and policyname = 'templates_update';

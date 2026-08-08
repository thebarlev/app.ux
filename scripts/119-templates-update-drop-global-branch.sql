-- ====================================================
-- 119 - templates_update: drop the "any authenticated user" global branch
-- ====================================================
-- Stage 1.5 part B, item 4.
--
-- THE PROBLEM
-- templates_update (scripts/023:55-98) carries three branches, in both USING and
-- WITH CHECK. The third is:
--
--   OR (company_id IS NULL AND auth.uid() IS NOT NULL)
--
-- company_id IS NULL means a global template — one shared by every tenant. So any
-- authenticated user could UPDATE any column of it, including html_template and
-- css, which the PDF pipeline renders for other tenants' documents. Its comment
-- says the intent was narrow ("User setting is_default on global template"), but
-- RLS cannot restrict which columns an UPDATE touches, so the branch grants the
-- whole row.
--
-- WHY REMOVING IT BREAKS NOTHING — the flow it was written for moved
-- Choosing a template is no longer done by writing is_default on the shared row:
--   * public.company_template_selections (scripts/020:9) holds the per-company,
--     per-document-type choice. It is wired: app/dashboard/settings/
--     template-selection-actions.ts reads and writes it at :46, :149, :237, :278.
--   * lib/pdf-service.ts resolves the template with that selection as priority 0
--     (:417 comment, :612 query) — ahead of any is_default flag.
--   * app/dashboard/templates/actions.ts:188 stores the other selection path on
--     companies.selected_template_id, again not on the template row.
-- In the tenant-facing code, templates.is_default is only ever READ — in select
-- lists and ORDER BY (app/dashboard/templates/actions.ts:57,69 and
-- app/dashboard/settings/template-selection-actions.ts:121,162). No tenant path
-- writes it. Nothing depends on being able to update a global template.
--
-- Admin edits are unaffected: CASE 1 keeps them, and since S1.2 the Server Action
-- app/admin/(app)/templates/actions.ts also checks system_admins in application
-- code, so the two layers now agree.
--
-- WHAT REMAINS AFTER THIS
--   CASE 1 — system admin may update a global template (company_id IS NULL)
--   CASE 2 — a user may update a template belonging to one of their companies
--
-- VERIFY BEFORE RUNNING — this migration REPLACES a whole policy
-- Unlike 116-118 this one recreates a policy body, so if the live definition has
-- drifted from scripts/023 the replacement would silently discard that drift.
-- Capture the live definition first and compare it against CASE 1 and CASE 2
-- below; the pre-flight query is in the accompanying report. Do not run this until
-- that comparison has been made.
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
  );

commit;

-- ── VERIFY ────────────────────────────────────────────────────────────────────
-- Expected: one UPDATE row for templates_update whose qual and with_check both
-- mention system_admins and user_company_ids, and in which the substring
-- "auth.uid() IS NOT NULL" no longer appears.
select policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'templates'
  and policyname = 'templates_update';

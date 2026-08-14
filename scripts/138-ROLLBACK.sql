-- =====================================================================================
-- 138 ROLLBACK — restore the policy state as it was measured before 138
-- =====================================================================================
--
-- ⛔ This puts back a state in which an authenticated user can UPDATE a final document
--    through the Data API. Use it only to unblock a production incident, and only if the
--    incident is actually caused by 138 — a user-identity write to a non-draft document
--    failing silently as a zero-row UPDATE.
--
-- ⚠️ Roll the CODE back too, or leave it. The three relocated paths (issuance stamp, pdf
--    issuance stamp, admin goal toggle) run as service role and keep working either way;
--    they do not depend on these policies.
--
-- Restores documents_update to its 044-allow-final-close.sql definition and the line-item
-- policies to their 007-tenant-rls-policies.sql definitions, recreates the three
-- "Business owners can ..." policies from 005-business-owner-rls.sql verbatim, and recreates
-- "System admins can update documents" from 002-enable-rls.sql verbatim.
--
-- ⚠️ Restoring that last one gives every system admin UPDATE on every document of every
--    tenant in every status again, with no WITH CHECK. If you are rolling back for a reason
--    unrelated to admin writes, consider leaving it out — nothing in the application needs
--    it, since admin writes go through requireSystemAdmin() server routes.

begin;

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents
  for update
  using (
    company_id in (select public.user_company_ids())
  )
  with check (
    company_id in (select public.user_company_ids())
    and document_status in ('draft', 'final', 'cancelled', 'voided', 'pdf_ready')
  );

drop policy if exists line_items_update on public.document_line_items;
create policy line_items_update on public.document_line_items
  for update
  using (company_id in (select public.user_company_ids()))
  with check (company_id in (select public.user_company_ids()));

drop policy if exists line_items_delete on public.document_line_items;
create policy line_items_delete on public.document_line_items
  for delete
  using (company_id in (select public.user_company_ids()));

create policy "Business owners can view own documents" on public.documents
  for select
  using (
    company_id in (select id from public.companies where auth_user_id = auth.uid())
  );

create policy "Business owners can insert own documents" on public.documents
  for insert
  with check (
    company_id in (select id from public.companies where auth_user_id = auth.uid())
  );

create policy "Business owners can update own documents" on public.documents
  for update
  using (
    company_id in (select id from public.companies where auth_user_id = auth.uid())
  );

-- From 002-enable-rls.sql, verbatim. See the warning at the top before restoring this one.
create policy "System admins can update documents" on public.documents
  for update
  using (
    exists (
      select 1 from public.system_admins
      where system_admins.auth_user_id = auth.uid()
    )
  );

commit;

select '138-ROLLBACK.sql applied' as migration;

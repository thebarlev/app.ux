-- ====================================================
-- ROLLBACK for 114 and 115  (stage 1.5, part A)
-- ====================================================
-- Paste and run as a single block to put the database back the way it was
-- before 114-fix-company-members-self-join.sql and 115-lock-system-admins.sql.
--
-- Running this REOPENS both holes:
--   * any authenticated user can join any company and read its books
--   * any authenticated user can make themselves a system administrator
-- That is the point — it exists so a broken production can be restored in one
-- paste. Close them again as soon as the cause is understood.
--
-- 114 and 115 have ALREADY been applied to production and verified. This file is
-- for an incident, not for routine use, and nothing here should be run unless
-- something is actually broken.
--
-- All four policy definitions below are exact. company_members_signup_insert and
-- system_admins_insert came from the live database map; system_admins_update and
-- system_admins_delete came from the pg_policies capture taken before 115 was
-- applied. Note that those two were already scoped to the caller's own row
-- (auth_user_id = auth.uid()) — only the INSERT policy was the hole.
--
-- The one thing this file does not reconstruct is whether anon and authenticated
-- held UPDATE and DELETE grants on system_admins before 115 revoked them. Only
-- INSERT-to-authenticated was confirmed present, so only that is restored here.
-- If the grant capture from step 0 of the test plan shows more, add them.
-- ====================================================

begin;

-- ── 1. company_members_signup_insert ──────────────────────────────────────────
-- The permissive form: user_id must be the caller, but company_id is
-- unconstrained. This is the self-join hole.
drop policy if exists company_members_signup_insert on public.company_members;

create policy company_members_signup_insert on public.company_members
  for insert
  with check (user_id = auth.uid());

-- ── 2. system_admins_insert ───────────────────────────────────────────────────
-- Any authenticated caller passes this check. This is the escalation hole.
drop policy if exists system_admins_insert on public.system_admins;

create policy system_admins_insert on public.system_admins
  for insert
  with check (auth.uid() is not null);

-- ── 3. system_admins_update ───────────────────────────────────────────────────
drop policy if exists system_admins_update on public.system_admins;

create policy system_admins_update on public.system_admins
  for update
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- ── 4. system_admins_delete ───────────────────────────────────────────────────
drop policy if exists system_admins_delete on public.system_admins;

create policy system_admins_delete on public.system_admins
  for delete
  using (auth_user_id = auth.uid());

-- ── 5. The write grant 115 revoked ────────────────────────────────────────────
grant insert on public.system_admins to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');

-- ── Verify the rollback landed ────────────────────────────────────────────────
--   select policyname, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'public' and tablename in ('system_admins','company_members')
--   order by tablename, policyname;

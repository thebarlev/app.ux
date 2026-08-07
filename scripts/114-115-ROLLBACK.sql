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
-- HONEST LIMITATION, READ IT
-- The policies being restored were created outside scripts/, so the repository
-- has no record of them. Sections 1 and 2 below are exact: those two definitions
-- were supplied from the live database map. Section 3 is NOT verified — the
-- definitions of system_admins_update and system_admins_delete were never
-- captured, and neither was the exact grant list. If you ran the capture query
-- in the header of 115 before applying it, use that output instead of section 3
-- and ignore what is written there.
-- ====================================================

begin;

-- ── 1. Restore company_members_signup_insert (exact) ──────────────────────────
-- Reverts 114. This is the permissive form: user_id must be the caller, but
-- company_id is unconstrained, which is the self-join hole.
drop policy if exists company_members_signup_insert on public.company_members;

create policy company_members_signup_insert on public.company_members
  for insert
  with check (user_id = auth.uid());

-- ── 2. Restore system_admins_insert (exact) ───────────────────────────────────
-- Reverts the insert half of 115. Any authenticated caller passes this check.
drop policy if exists system_admins_insert on public.system_admins;

create policy system_admins_insert on public.system_admins
  for insert
  with check (auth.uid() is not null);

-- Restore the write grant that 115 revoked. Only INSERT-to-authenticated was
-- confirmed present beforehand, so only that is restored here. If the capture
-- query showed UPDATE or DELETE grants as well, add them explicitly.
grant insert on public.system_admins to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');

-- ── 3. system_admins_update / system_admins_delete — NOT RESTORED ─────────────
-- 115 dropped these, but their definitions were never captured, so restoring
-- them faithfully is not possible from the repository. They are left out rather
-- than recreated from a guess: inventing a policy on the system-administrator
-- table is worse than leaving it absent, and nothing in the application writes
-- to this table, so their absence breaks no application flow.
--
-- If you captured them with the query in the header of 115, recreate them from
-- that output. If you did not and something genuinely needs them, the shape
-- below matches the insert policy that did exist — treat it as a hypothesis to
-- confirm against a backup, NOT as the original:
--
--   create policy system_admins_update on public.system_admins
--     for update using (auth.uid() is not null);
--
--   create policy system_admins_delete on public.system_admins
--     for delete using (auth.uid() is not null);
--
--   grant update, delete on public.system_admins to authenticated;
--
-- ── Verify the rollback landed ────────────────────────────────────────────────
--   select policyname, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'public' and tablename in ('system_admins','company_members')
--   order by tablename, policyname;

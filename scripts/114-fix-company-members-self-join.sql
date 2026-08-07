-- ====================================================
-- 114 - Fix: company_members self-join  (stage 1.5, part A)
-- ====================================================
-- Numbered 114, not 112: 112 and 113 are already taken on main by
-- 112-auditor-report-email-sent-at.sql and 113-auditor-leads-consent-evidence.sql.
-- New migrations go at the end of the sequence.
--
-- THE HOLE
-- company_members_signup_insert was:
--     WITH CHECK (user_id = auth.uid())
-- Nothing constrained company_id. Any authenticated user could insert a
-- membership row pointing at ANY company and immediately gain full access to
-- that tenant's books, because public.user_company_ids() (scripts/006:218)
-- resolves membership straight out of this table and every tenant policy in
-- scripts/007 is written against it. No trigger and no constraint blocked it.
--
-- THE FIX
-- Additionally require that the company is one the caller owns.
--
-- WHY REGISTRATION STILL WORKS
-- All four browser paths create the company FIRST, with auth_user_id set to the
-- signed-in user, and only then insert the membership row. Verified in code:
--   app/(auth)/register4/page.tsx                  :159,169  ->  :203,205
--   components/registration/step-business-profile.tsx :134,147  ->  :186,189
--   components/registration/step-onboarding.tsx       :162,175  ->  :214,217
--   components/registration/step-address.tsx          :85,87    ->  :119
-- By the time the membership insert runs, companies.auth_user_id = auth.uid()
-- already holds, so the tightened check passes.
--
-- WHAT IS NOT AFFECTED
-- * Team invites. They insert a row for someone else, so they could never
--   satisfy user_id = auth.uid() and never used this policy. They run through
--   company_members_insert (scripts/007:15-28), which is deliberately untouched.
-- * Service-role writes, which bypass RLS entirely:
--     app/api/auditor/auth/bootstrap-company/route.ts:124,203,210
--     lib/auditor/billing/process-indicator-event.ts:194,232,256,405
-- * Every read path. All other references to this table are SELECTs.
--
-- READ THIS BEFORE RUNNING — the one way this can bite
-- A policy expression is evaluated with the caller's own privileges, so the
-- SELECT on public.companies below is itself subject to companies' RLS. This
-- migration therefore assumes a registrant can SELECT the company row they just
-- created. That is almost certainly true, but public.companies' policies were
-- created outside scripts/ and could not be verified from the repository.
--
-- If end-to-end registration of a NEW user fails after this migration with a
-- row-level-security error on company_members, this is the cause. Run
-- 114-115-ROLLBACK.sql, report it, and do not patch forward on production: the
-- fix would be to swap the subquery for the SECURITY DEFINER helper
-- public.user_company_ids(), which is not subject to the caller's RLS. That is
-- a decision, not a guess to make mid-incident.
--
-- NOTE ON THE ROLE CLAUSE
-- The live policy's TO clause is unknown (dashboard-created), so none is
-- specified here and the policy applies to PUBLIC. This is not a widening:
-- for anon, auth.uid() is NULL, so `user_id = auth.uid()` evaluates to NULL and
-- the insert is denied.
-- ====================================================

begin;

drop policy if exists company_members_signup_insert on public.company_members;

create policy company_members_signup_insert on public.company_members
  for insert
  with check (
    user_id = auth.uid()
    and company_id in (
      select c.id
      from public.companies c
      where c.auth_user_id = auth.uid()
    )
  );

commit;

select pg_notify('pgrst', 'reload schema');

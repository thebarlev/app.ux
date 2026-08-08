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
-- Additionally require that company_id is one of the caller's own companies,
-- resolved through public.user_company_ids() — memberships union owned
-- companies. See "WHY user_company_ids()" below for why the lookup goes through
-- that helper rather than an inline select on public.companies.
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
-- WHY user_company_ids() AND NOT AN INLINE SELECT ON companies
-- A policy expression is evaluated with the caller's own privileges, so an
-- inline `select id from public.companies where auth_user_id = auth.uid()`
-- inside this WITH CHECK would itself be subject to companies' RLS. If that
-- policy did not return the row, registration would break in production and we
-- would find out on a real user. public.companies' policies were created outside
-- scripts/ and cannot be verified from the repository, so that risk is not worth
-- taking.
--
-- public.user_company_ids() (scripts/006:218) is SECURITY DEFINER, so it is not
-- subject to the caller's RLS and cannot come back empty because of a policy.
-- The risk disappears.
--
-- The check is exactly as strong. user_company_ids() is
-- `company_members ∪ companies WHERE auth_user_id = auth.uid()`, i.e.
-- memberships plus owned companies. The attack is joining a company you have no
-- relationship with, and a stranger is in neither set. It is also the pattern
-- every other policy in the project already uses, so this introduces no
-- exception to the house style.
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
    and company_id in (select public.user_company_ids())
  );

commit;

select pg_notify('pgrst', 'reload schema');

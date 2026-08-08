-- ====================================================
-- 115 - Lock system_admins  (stage 1.5, part A)
-- ====================================================
-- Numbered 115, not 113: 113 is already taken on main by
-- 113-auditor-leads-consent-evidence.sql. New migrations go at the end.
--
-- THE HOLE
-- system_admins_insert was:
--     WITH CHECK (auth.uid() IS NOT NULL)
-- and `authenticated` holds GRANT INSERT on the table. Any registered user could
-- insert their own auth_user_id and become a system administrator. That grants
-- the whole /admin surface and every policy in the database that trusts an
-- EXISTS against this table.
--
-- THE FIX
-- Remove the write policies and the write grants. From here on, system
-- administrators are created in SQL only, by service_role or the table owner.
--
-- WHY THIS BREAKS NOTHING
-- Nothing in the application writes to this table. All 31 references across
-- app/, lib/ and components/ are reads — verified by checking for
-- .insert/.update/.delete/.upsert within three lines of every
-- from("system_admins"), which returned nothing. The reads are the admin gate
-- in app/admin/(app)/layout.tsx:26, lib/security/system-admin.ts:46,
-- lib/supabase/proxy.ts:91,116 and the template Server Actions.
--
-- SELECT IS DELIBERATELY LEFT ALONE
-- Neither the SELECT policy nor the SELECT grant is touched. Other policies
-- evaluate EXISTS against this table in the caller's context, and removing read
-- access would break them. Note the SELECT policy created in scripts/002:52 is
-- named "System admins can view system admins"; the live database may also carry
-- a dashboard-created system_admins_select. Nothing here drops either.
--
-- service_role is NOT revoked, so server-side administration keeps working.
--
-- BEFORE YOU RUN THIS — capture the current state, or rollback is guesswork.
-- The policies being dropped were created outside scripts/, so the repository
-- has no record of their definitions. 114-115-ROLLBACK.sql can restore
-- system_admins_insert exactly (its definition is known) but NOT the update and
-- delete policies. Run this first and keep the output:
--
--   select policyname, cmd, permissive, roles, qual, with_check
--   from pg_policies
--   where schemaname = 'public' and tablename in ('system_admins','company_members')
--   order by tablename, policyname;
--
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'system_admins'
--   order by grantee, privilege_type;
-- ====================================================

begin;

drop policy if exists system_admins_insert on public.system_admins;
drop policy if exists system_admins_update on public.system_admins;
drop policy if exists system_admins_delete on public.system_admins;

revoke insert, update, delete on public.system_admins from anon, authenticated;

commit;

select pg_notify('pgrst', 'reload schema');

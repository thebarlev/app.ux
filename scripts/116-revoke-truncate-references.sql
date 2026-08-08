-- ====================================================
-- 116 - Revoke TRUNCATE and REFERENCES from anon and authenticated
-- ====================================================
-- Stage 1.5 part B, item 1.
--
-- THE PROBLEM
-- TRUNCATE and REFERENCES are granted to anon and authenticated on every table
-- in schema public. TRUNCATE is the dangerous one:
--   * it is NOT subject to row level security — policies govern
--     SELECT/INSERT/UPDATE/DELETE only;
--   * it fires no row-level triggers, so the two layers protecting a finalized
--     document (policy scripts/007:130-135 and the BEFORE DELETE trigger
--     scripts/006:338-355) are both bypassed;
--   * TRUNCATE ... CASCADE takes referencing tables with it.
--
-- SEVERITY IN CONTEXT
-- Not reachable from the browser: PostgREST exposes no verb for TRUNCATE and it
-- cannot be injected through it. Exploiting this requires the ability to run
-- arbitrary SQL, and no such primitive is known to exist in this system — the
-- dynamic SQL in scripts/082:307 and scripts/085:316 builds statements from a
-- hardcoded column allowlist with quote_literal() values, not from caller input.
-- So this is defence in depth, not an open door.
--
-- DEPENDENCY SCAN (item 1 precondition)
-- * No SQL TRUNCATE anywhere in scripts/ or in application code. Every "truncate"
--   match in the codebase is the Tailwind CSS class.
-- * No application code issues DDL, so nothing needs the REFERENCES privilege.
--   Migrations create foreign keys as the table owner, which does not consult it.
--
-- SUPABASE WILL SILENTLY UNDO THIS
-- A later `grant all on all tables in schema public to authenticated` — a common
-- Supabase idiom, whether run by hand, inside a migration, or by a setup script —
-- restores TRUNCATE with no error and no warning. This migration is not
-- self-defending. The verification query at the bottom is the control, and it
-- should be re-run after any migration that touches grants.
-- ====================================================

begin;

revoke truncate, references on all tables in schema public from anon, authenticated;

commit;

-- ── VERIFY: must return zero rows ─────────────────────────────────────────────
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('TRUNCATE', 'REFERENCES')
order by table_name, grantee, privilege_type;

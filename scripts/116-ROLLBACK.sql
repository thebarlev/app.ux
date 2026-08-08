-- ====================================================
-- ROLLBACK for 116
-- ====================================================
-- Restores TRUNCATE and REFERENCES to anon and authenticated on every table in
-- schema public, i.e. puts back the state 116 removed.
--
-- Running this restores a path to irreversible destruction of all accounting
-- data by anyone able to execute SQL as those roles. Only run it if 116 is proven
-- to have broken something, and close it again immediately afterwards.
-- ====================================================

begin;

grant truncate, references on all tables in schema public to anon, authenticated;

commit;

-- ── VERIFY the rollback landed: rows should be present again ──────────────────
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('TRUNCATE', 'REFERENCES')
order by table_name, grantee, privilege_type;

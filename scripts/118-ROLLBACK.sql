-- ====================================================
-- ROLLBACK for 118
-- ====================================================
-- Recreates sequences_update exactly as scripts/QUICK_SETUP.sql:284-288 defined
-- it, i.e. without the is_locked condition.
--
-- Running this re-nullifies the sequence lock: because permissive policies combine
-- with OR, restoring this policy again allows updating a locked numbering sequence
-- and undoes the whole point of 118.
-- ====================================================

begin;

drop policy if exists sequences_update on public.document_sequences;

create policy sequences_update on public.document_sequences
  for update
  using (company_id in (select public.user_company_ids()))
  with check (company_id in (select public.user_company_ids()));

commit;

-- ── VERIFY the rollback landed: two UPDATE policies should be present ─────────
select policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'document_sequences'
order by cmd, policyname;

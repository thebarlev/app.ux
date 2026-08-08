-- ====================================================
-- 118 - Drop the duplicate UPDATE policy on document_sequences
-- ====================================================
-- Stage 1.5 part B, item 3.
--
-- THE PROBLEM
-- document_sequences carries two UPDATE policies:
--
--   document_sequences_update   (scripts/007:96-99)
--     using / with check: company_id in (select public.user_company_ids())
--                         AND is_locked = false
--
--   sequences_update            (scripts/QUICK_SETUP.sql:284-288)
--     using / with check: company_id in (select public.user_company_ids())
--                         -- no is_locked condition
--
-- Permissive policies combine with OR, so the second one grants everything the
-- first withholds. The `is_locked = false` guard — the sequence lock listed in
-- appendix A item 2 of the work order as something that must not be broken — has
-- therefore never actually held. A tenant could update a locked numbering
-- sequence for their own company.
--
-- THE FIX
-- Drop sequences_update. document_sequences_update remains and its is_locked
-- guard becomes effective for the first time.
--
-- ON THE OTHER TWO DUPLICATES — NOT TOUCHED
-- QUICK_SETUP.sql also created sequences_select (:275) and sequences_insert
-- (:280). Both are byte-equivalent in effect to document_sequences_select and
-- document_sequences_insert in scripts/007:86-93, so they weaken nothing; they
-- are redundant, not harmful. Removing them is cleanup outside this item's scope
-- and is left for an explicit decision.
--
-- VERIFY BEFORE RUNNING
-- Confirm against pg_policies what actually exists — the database has been edited
-- outside migrations, so scripts/ is not a reliable record of the live state. The
-- pre-flight query is in the accompanying report. This migration uses
-- `drop policy if exists`, so it is safe whether or not the policy is present.
-- ====================================================

begin;

drop policy if exists sequences_update on public.document_sequences;

commit;

-- ── VERIFY ────────────────────────────────────────────────────────────────────
-- Expected: exactly one UPDATE row, document_sequences_update, and its qual and
-- with_check both mention is_locked. No UPDATE policy without is_locked may remain.
select policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'document_sequences'
order by cmd, policyname;

-- =====================================================================================
-- 138 - RLS: a document may be edited only while it is a draft
-- =====================================================================================
--
-- ⛔⛔ RUN ORDER — THE CODE DEPLOYS FIRST, THIS FILE RUNS SECOND.
--
--     Three code paths write to `documents` under the signed-in user's identity today and
--     would start failing the moment this file lands. They were moved to the service role
--     in the same change set that carries this migration:
--
--       app/api/documents/[documentId]/issuance/route.ts   original_issued_at stamp
--       app/api/documents/[documentId]/pdf/route.ts        original_issued_at stamp
--       components/admin/company-details.tsx               is_goal_marked toggle,
--                                                          now /api/admin/documents/[id]/goal-marked
--
--     Run this file against a deployment that already contains them. Running it first
--     breaks issuance stamping and the admin goal toggle in production, between the two.
--
-- ─────────────────────────────────────────────────────────────────────────────────────
-- WHAT WAS MEASURED
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- Read from pg_policies in production, not assumed:
--
--   documents_update      USING carries no status condition at all. Its live definition is
--                         the one from 044-allow-final-close.sql, which dropped the status
--                         test that 007-tenant-rls-policies.sql originally had. An
--                         authenticated user can therefore UPDATE a final document straight
--                         through the Data API.
--   line_items_update     company_id only, in both USING and WITH CHECK. No status test.
--   line_items_delete     company_id only. No status test. Lines can be deleted off a
--                         finalised document.
--
--   "Business owners can update own documents"   FOR UPDATE, USING company ownership, and
--                         no WITH CHECK — which in PostgreSQL means the USING expression is
--                         reused as the check. No status test anywhere in it. Policies for
--                         the same command combine with OR, so while this one exists it
--                         grants everything the tightened documents_update is about to
--                         refuse. ⚠️ Without dropping it, the rest of this file is decorative.
--
--   "System admins can update documents"         The same hole, one role over, and it was
--                         missed on the first pass of this file. From 002-enable-rls.sql:
--                         FOR UPDATE, USING nothing but `exists (select 1 from system_admins
--                         where auth_user_id = auth.uid())`. No WITH CHECK, no status test,
--                         and no company scoping of any kind — it is every document of every
--                         tenant in every status. OR'd beside documents_update it means a
--                         signed-in admin can still edit a finalised tax invoice straight
--                         through the Data API after this migration. It goes too.
--
-- Two policies were measured and are CORRECT. This file does not touch them:
--
--   documents_delete            ... and document_status = 'draft'
--   document_sequences_update   ... and is_locked = false
--
-- ─────────────────────────────────────────────────────────────────────────────────────
-- WHAT CHANGES
-- ─────────────────────────────────────────────────────────────────────────────────────
--
--   1. documents_update, line_items_update, line_items_delete gain a draft test, in USING
--      and in WITH CHECK.
--   2. The three duplicate "Business owners can ..." policies on documents are dropped.
--   3. "System admins can update documents" is dropped. A finalised tax invoice is not
--      editable by anyone — not by its owner and not by an operator — and that is precisely
--      what the registrar declaration asserts. An admin who needs to write to a document
--      does it through a server route behind requireSystemAdmin(), the way
--      /api/admin/documents/[id]/goal-marked in this change set does. The pattern exists;
--      nothing needs the blanket policy.
--
-- On the WITH CHECK value, deliberately 'draft' and not 'draft','final':
-- allowing 'final' in the check would let a caller flip a draft to final directly through
-- the API — with no number allocated, no sequence locked and no period guard, because all
-- of those live in finalize_document_with_period_guard_service. A final document with no
-- number is worse than what this migration closes. Every status transition therefore goes
-- through SECURITY DEFINER functions only.
--
-- ─────────────────────────────────────────────────────────────────────────────────────
-- WHAT MIGHT BREAK
-- ─────────────────────────────────────────────────────────────────────────────────────
--
--   * Any user-identity write to a non-draft document. The three known ones are listed at
--     the top and were moved to the service role first. If a fourth exists that the sweep
--     of app/, lib/ and components/ missed, it will surface as a silent no-op — an UPDATE
--     that matches zero rows and reports success. Look there before blaming the trigger.
--
--   * Cancelling and voiding. 044 loosened documents_update precisely so a user could take
--     a final document to 'cancelled'. That path now runs as service role
--     (lib/documents/actions.ts:2243 and :2279, both createAdminClient), so the policy
--     allowance is vestigial and its removal changes nothing. Verified before writing this.
--
--   * ⚠️ NOT a substitute for the immutability trigger, and not in conflict with it.
--     enforce_document_immutability (BEFORE UPDATE, from 044) still guards the column-level
--     rules on final documents, and triggers are NOT bypassed by the service role — only
--     RLS is. The two stack: RLS decides who may target the row, the trigger decides which
--     columns may move. The three relocated paths pass the trigger because they leave
--     document_status untouched, which reaches its `return new` branch.
--
--   * Anything that reached documents only through "Business owners can view own documents"
--     or "... insert own documents". Nothing does: user_company_ids() is
--     `company_members ∪ companies.auth_user_id` (006-tenant-isolation-and-audit.sql), a
--     strict superset of the ownership predicate those two used. Every caller they admitted
--     is already admitted by documents_select / documents_insert.
--
-- =====================================================================================

begin;

-- ── install guard: dependencies this file does not create ───────────────────────────
do $$
begin
  if to_regprocedure('public.user_company_ids()') is null then
    raise exception '138: public.user_company_ids() is missing. Apply 006-tenant-isolation-and-audit.sql first.';
  end if;
  if to_regclass('public.documents') is null then
    raise exception '138: public.documents is missing.';
  end if;
  if to_regclass('public.document_line_items') is null then
    raise exception '138: public.document_line_items is missing.';
  end if;
end $$;


-- ═════════════════════════════════════════════════════════════════════════════════════
-- 1. documents_update — draft only, on the old row and on the new one
-- ═════════════════════════════════════════════════════════════════════════════════════
drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents
  for update
  using (
    company_id in (select public.user_company_ids())
    and document_status = 'draft'
  )
  with check (
    company_id in (select public.user_company_ids())
    and document_status = 'draft'
  );


-- ═════════════════════════════════════════════════════════════════════════════════════
-- 2. document_line_items — the status lives on the parent document
-- ═════════════════════════════════════════════════════════════════════════════════════
-- document_line_items carries company_id but not document_status, so the draft test has
-- to reach the parent row. USING sees the old parent, WITH CHECK the new one, which also
-- stops a line being re-pointed from a draft onto a finalised document.

drop policy if exists line_items_update on public.document_line_items;
create policy line_items_update on public.document_line_items
  for update
  using (
    company_id in (select public.user_company_ids())
    and exists (
      select 1
      from public.documents d
      where d.id = public.document_line_items.document_id
        and d.document_status = 'draft'
    )
  )
  with check (
    company_id in (select public.user_company_ids())
    and exists (
      select 1
      from public.documents d
      where d.id = public.document_line_items.document_id
        and d.document_status = 'draft'
    )
  );

drop policy if exists line_items_delete on public.document_line_items;
create policy line_items_delete on public.document_line_items
  for delete
  using (
    company_id in (select public.user_company_ids())
    and exists (
      select 1
      from public.documents d
      where d.id = public.document_line_items.document_id
        and d.document_status = 'draft'
    )
  );


-- ═════════════════════════════════════════════════════════════════════════════════════
-- 3. The duplicate owner-era policies on documents
-- ═════════════════════════════════════════════════════════════════════════════════════
--
-- All three are from 005-business-owner-rls.sql, written before user_company_ids() and the
-- documents_* family existed. Each is now a second, looser grant OR'd next to the real one.

-- FOR UPDATE. USING company ownership, no WITH CHECK, no status test. This is the one that
-- makes the rest of this migration meaningless while it stands: OR'd with documents_update
-- it re-permits editing a final document. Dropping it leaves documents_update as the only
-- UPDATE grant, which is the intent.
drop policy if exists "Business owners can update own documents" on public.documents;

-- FOR SELECT. Narrower than documents_select — it lacks the buyer and auditor-charge arms
-- from 072 and 090 — and admits nobody documents_select does not already admit. Dropping it
-- removes a redundant OR arm and changes no caller's visibility.
drop policy if exists "Business owners can view own documents" on public.documents;

-- FOR INSERT. WITH CHECK on company ownership, identical in effect to documents_insert but
-- expressed against companies.auth_user_id instead of user_company_ids(). Redundant; a user
-- who passes it passes documents_insert too.
drop policy if exists "Business owners can insert own documents" on public.documents;

-- FOR UPDATE, from 002-enable-rls.sql. USING is only "caller appears in system_admins" —
-- no WITH CHECK, no status test, no company scoping. It is the same hole as the owner policy
-- above with a wider blast radius: every document, every tenant, every status. Measured as a
-- surviving UPDATE grant AFTER the first draft of this migration, which is why V3 below now
-- expects exactly one UPDATE policy and would have caught it.
--
-- ⚠️ Dropping it removes the ability of an admin to edit documents through the Data API.
-- That is the intent. Admin writes go through a server route behind requireSystemAdmin() —
-- see /api/admin/documents/[documentId]/goal-marked, which is the pattern to copy. Measured
-- before dropping: zero write paths to `documents` run under a browser identity, and zero
-- run under an admin's session identity; every remaining write is service role or is scoped
-- to a draft.
--
-- ⛔ "System admins can view all documents" is NOT dropped. Reading across tenants is what an
-- operator surface legitimately does, and no immutability claim depends on it.
drop policy if exists "System admins can update documents" on public.documents;


-- ═════════════════════════════════════════════════════════════════════════════════════
-- 4. Deliberately untouched
-- ═════════════════════════════════════════════════════════════════════════════════════
--   documents_delete           already `and document_status = 'draft'`
--   document_sequences_update  already `and is_locked = false`
--   enforce_document_immutability + trigger_enforce_document_immutability  (044)
--   every policy on companies, document_links, document_events

commit;


-- =====================================================================================
-- VERIFICATION — run after, paste the output back
-- =====================================================================================

-- V1. The three tightened policies must now show a draft test in qual AND with_check.
--     Expect exactly three rows.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and policyname in ('documents_update','line_items_update','line_items_delete')
order by tablename, policyname;

-- V2. The four dropped policies must return ZERO rows.
select policyname
from pg_policies
where schemaname = 'public'
  and tablename = 'documents'
  and policyname in (
    'Business owners can update own documents',
    'Business owners can view own documents',
    'Business owners can insert own documents',
    'System admins can update documents'
  );

-- V3. Every remaining UPDATE grant on documents, so no looser OR arm survives unnoticed.
--     ⛔ Expect EXACTLY ONE row: documents_update, with document_status = 'draft' present in
--     both qual and with_check. Any second row here is another OR arm and defeats this file —
--     that is exactly how "System admins can update documents" was caught.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'documents' and cmd in ('UPDATE','ALL')
order by policyname;

-- V4. The two correct policies must be unchanged.
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and policyname in ('documents_delete','document_sequences_update')
order by tablename;

-- V5. No business table left with RLS off.
select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
order by c.relname;

-- V6. The immutability trigger must still be attached.
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.documents'::regclass
  and not tgisinternal
order by tgname;

-- V7. Every policy left on documents, in one glance.
--     Expect one grant per command and nothing spare:
--
--       documents_select              SELECT   own tenant + billing buyer + auditor charge
--       System admins can view all documents
--                                     SELECT   operator read across tenants (kept on purpose)
--       documents_insert              INSERT
--       documents_update              UPDATE   draft only
--       documents_delete              DELETE   draft only
--
--     Anything else on this list is a policy nobody has justified. Read it before moving on.
select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'documents'
order by cmd, policyname;

select '138-rls-draft-only-document-edits.sql applied' as migration;

-- =====================================================================================
-- 139 - finalize_document_with_period_guard becomes SECURITY DEFINER
-- =====================================================================================
--
-- ⛔ FIXES A LIVE PRODUCTION BREAKAGE INTRODUCED BY 138.
--    Issuing a document fails with:
--      new row violates row-level security policy for table "documents"
--
-- ─────────────────────────────────────────────────────────────────────────────────────
-- WHAT WAS MEASURED
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- There are two functions whose names differ only by a suffix, and they are NOT the same
-- function. The report that led to 138's WITH CHECK decision conflated them:
--
--   finalize_document_with_period_guard_service   SECURITY DEFINER
--       Called only from billing:
--         lib/billing/vow-billing/providers/internal-provider.ts:49
--         app/api/billing/repair-missing-invoices/route.ts:190
--
--   finalize_document_with_period_guard           no security clause → SECURITY INVOKER
--       Called from the user-facing issue path:
--         app/dashboard/documents/tax-invoice/TaxInvoiceFormClient.tsx:895
--           → lib/documents/actions.ts:910   issueDocumentAction   (session client)
--           → lib/documents/actions.ts:1235  finalizeDocument
--           → lib/document-helpers.ts:1600   supabase.rpc("finalize_document_with_period_guard")
--
-- The live definition is scripts/105-finalize-with-period-guard-free-patur-cap.sql. It
-- declares `language plpgsql` and `set search_path = public`, and no SECURITY clause at
-- all — PostgreSQL therefore defaults it to SECURITY INVOKER. Its body does, at :148:
--
--       update public.documents set document_status = 'final', ... where ... ;
--
-- Run as the caller, that UPDATE is subject to RLS, and 138's
-- `with check (... and document_status = 'draft')` rejects the new row. That is the error.
--
-- ⚠️ Five migrations define this function — 059, 064, 075, 091, 105 — and all five declare
-- the identical 7-parameter signature (uuid, uuid, timestamptz, numeric, numeric, numeric,
-- text). Each `create or replace` replaced the same function rather than adding an overload,
-- so exactly one function should carry this name. The guard below refuses to run if that is
-- not true, instead of altering one overload and leaving another behind.
--
-- ⚠️ It is the outlier among its own siblings, which is the clearest sign this was an
-- oversight rather than a decision:
--       finalize_document_with_period_guard_service    SECURITY DEFINER   (107, 126)
--       finalize_document_with_usage_guard             SECURITY DEFINER   (047, 075)
--       finalize_document_with_period_guard            INVOKER            ← this one
--
-- ─────────────────────────────────────────────────────────────────────────────────────
-- WHY THIS DOES NOT WIDEN PERMISSIONS
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- The function already performs, in its own body, every check RLS was performing for it.
-- Quoted from the live definition (105):
--
--   :41   if auth.uid() is null then
--           return query select false, 'unauthorized', null::integer, null::integer;
--
--   :46   if p_company_id not in (select public.user_company_ids()) then
--           return query select false, 'unauthorized', null::integer, null::integer;
--
--   :157  where id = p_document_id
--           and company_id = p_company_id
--           and document_status = 'draft';
--
-- So: anonymous callers are refused, a company the caller does not belong to is refused,
-- and only a row that is still a draft is ever promoted. A caller cannot reach another
-- tenant's document and cannot re-finalise something already final.
--
-- ⚠️ auth.uid() keeps identifying the CALLER under SECURITY DEFINER. It reads the request's
-- JWT claim from a GUC, not the session user, so the ownership test above does not silently
-- become a test about the function owner. `finalized_by = auth.uid()` likewise keeps
-- recording the human who issued the document, not the migration role.
--
-- The function already carries `set search_path = public`, which is the hardening SECURITY
-- DEFINER requires; this migration does not have to add it.
--
-- ─────────────────────────────────────────────────────────────────────────────────────
-- WHAT MIGHT BREAK
-- ─────────────────────────────────────────────────────────────────────────────────────
--
--   * The function stops being subject to RLS on every table it touches, not only on the
--     UPDATE that needed it. It reads subscriptions, plans and documents to compute the
--     period usage cap. Those reads were previously filtered by the caller's policies and
--     will now see all rows. The counting query at :125 is already scoped by
--     `d.company_id = p_company_id`, and p_company_id was validated at :46 — but any FUTURE
--     edit to this body must re-scope its own reads, because RLS will no longer do it.
--     ⛔ That is the standing obligation this change creates. Note it before editing 105.
--
--   * Nothing else changes. 138 stays exactly as applied: documents_update remains
--     draft-only in USING and WITH CHECK, the line-item policies keep their draft test, and
--     the four dropped policies stay dropped. This migration touches one function attribute.
--
--   * ⛔ The body is NOT rewritten here. Only the attribute changes. A rewrite would be a
--     second opportunity to introduce the very class of error that caused this.
--
-- =====================================================================================

begin;

-- ── install guard: exactly one function, with the expected signature ─────────────────
do $$
declare
  v_count integer;
begin
  if to_regprocedure('public.finalize_document_with_period_guard(uuid, uuid, timestamptz, numeric, numeric, numeric, text)') is null then
    raise exception '139: public.finalize_document_with_period_guard(uuid, uuid, timestamptz, numeric, numeric, numeric, text) does not exist. Do not guess — list the live overloads first (see the pre-flight query at the bottom of this file).';
  end if;

  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'finalize_document_with_period_guard';

  if v_count <> 1 then
    raise exception '139: expected exactly 1 function named finalize_document_with_period_guard, found %. Overloads exist; altering one would leave the others INVOKER. Stop and inspect.', v_count;
  end if;
end $$;


-- ── the change: one attribute, nothing else ──────────────────────────────────────────
alter function public.finalize_document_with_period_guard(
  uuid, uuid, timestamptz, numeric, numeric, numeric, text
) security definer;

commit;


-- =====================================================================================
-- VERIFICATION — run after, paste the output back
-- =====================================================================================

-- V1. prosecdef must be true for this exact signature. Expect exactly one row, t.
select n.nspname                                  as schema,
       p.proname                                  as function,
       pg_get_function_identity_arguments(p.oid)  as signature,
       p.prosecdef                                as security_definer,
       p.proconfig                                as settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'finalize_document_with_period_guard'
order by signature;

-- V2. The whole finalize family, so the three siblings agree. All four must show t.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as signature,
       p.prosecdef                               as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'finalize_document_with_period_guard',
    'finalize_document_with_period_guard_service',
    'finalize_document_with_usage_guard'
  )
order by p.proname, signature;

-- V3. 138 is untouched: documents_update is still the only UPDATE grant on documents, and
--     still draft-only in qual AND with_check. Expect exactly one row.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'documents' and cmd in ('UPDATE','ALL')
order by policyname;

-- V4. 138's line-item tightening is still in place. Expect two rows, both with the draft test.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and policyname in ('line_items_update','line_items_delete')
order by policyname;

-- V5. 138's four drops are still dropped. Expect ZERO rows.
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

select '139-finalize-period-guard-security-definer.sql applied' as migration;


-- =====================================================================================
-- PRE-FLIGHT, if the install guard above refuses to run
-- =====================================================================================
-- Lists every live overload of the name with its real signature and current mode, so the
-- ALTER can be pointed at the right one instead of guessed:
--
--   select p.oid::regprocedure                          as exact_signature,
--          p.prosecdef                                  as security_definer,
--          pg_get_function_identity_arguments(p.oid)    as identity_arguments
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname = 'finalize_document_with_period_guard'
--   order by exact_signature;

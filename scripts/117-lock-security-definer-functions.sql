-- ====================================================
-- 117 - Restrict EXECUTE on server-only SECURITY DEFINER functions
-- ====================================================
-- Stage 1.5 part B, item 2 — PARTIAL. Three of the nine functions are handled
-- here. The other six are deliberately left alone; each reason is recorded below,
-- because getting this wrong breaks either document issuance or PDF upload.
--
-- HANDLED HERE — server-only, safe to revoke
--
-- 1. public.recompute_document_accounting(uuid)          (latest: scripts/111:54)
--    No application call site. Its only callers are the trigger functions
--    public.on_document_links_change_recompute() (scripts/041:112, scripts/043:7)
--    and they are themselves SECURITY DEFINER, so the inner PERFORM runs as the
--    function owner and never consults the caller's EXECUTE privilege.
--    Verified rather than assumed: the claim "triggers do not check EXECUTE" is
--    true of the trigger function itself, but a function CALLED FROM a trigger
--    body is checked against the current role unless the calling function is
--    SECURITY DEFINER. Here it is, on both definitions. Revoking is safe.
--
-- 2. public.auditor_repair_duplicate_companies()         (scripts/088:37)
--    No call site in the codebase; an operator-run repair. Already revoked in
--    scripts/088:105-106. Re-asserted here so the end state does not depend on
--    whether 088 ran, and because REVOKE is idempotent.
--
-- 3. public.auditor_billing_events_claim_pending(text, int)  (scripts/085:24)
--    Called only through createAdminClient() at
--    app/api/auditor/billing/process-pending/route.ts:44, i.e. as service_role.
--    Already revoked in scripts/085:60-61. Re-asserted for the same reason.
--
-- DELIBERATELY NOT TOUCHED
--
-- 4. public.get_document_company_id(text)                (scripts/027:13)
--    MUST KEEP EXECUTE FOR authenticated. It is called inside a storage RLS
--    policy granted TO authenticated (scripts/027:41-53). A policy expression is
--    evaluated with the caller's privileges, so revoking EXECUTE would make that
--    policy error and break PDF upload for every user. The policy already performs
--    its own ownership comparison; the function only resolves a company_id.
--    Residual exposure is information disclosure — learning which company owns a
--    given document id — which is not worth breaking uploads for.
--
-- 5. public.generate_document_number(uuid, text)         (scripts/006:237)
--    NOT server-only. It is invoked as `authenticated` from
--    lib/document-helpers.ts:299 and lib/documents/actions.ts:675, where the
--    `supabase` handle is a parameter typed Awaited<ReturnType<typeof
--    createClient>> — the cookie-based user client. Only
--    lib/billing/vow-billing/providers/internal-provider.ts:193 uses the admin
--    client. Revoking from authenticated would break document issuance, the money
--    path. It needs an in-body ownership check instead, which requires its live
--    definition first: the repository already holds two different versions
--    (scripts/006:237 and scripts/QUICK_SETUP.sql:55) and the database is known to
--    have been edited outside migrations, so rewriting the body from a file could
--    silently revert the live numbering logic. Blocked pending capture.
--
-- 6-9. public.allocate_document_number, public.lock_sequence_start (both
--    signatures) and public.select_company_template exist in NEITHER scripts/ NOR
--    the application code. Their bodies, argument types and current grants are
--    unknown, so neither a revoke nor a body change can be written safely.
--    Blocked pending capture.
--
-- Capture query for the blocked five is in the accompanying report.
-- ====================================================

begin;

revoke all on function public.recompute_document_accounting(uuid) from public, anon, authenticated;
grant execute on function public.recompute_document_accounting(uuid) to service_role;

revoke all on function public.auditor_repair_duplicate_companies() from public, anon, authenticated;
grant execute on function public.auditor_repair_duplicate_companies() to service_role;

revoke all on function public.auditor_billing_events_claim_pending(text, int) from public, anon, authenticated;
grant execute on function public.auditor_billing_events_claim_pending(text, int) to service_role;

commit;

-- ── VERIFY ────────────────────────────────────────────────────────────────────
-- Expected for all three rows: acl contains service_role=X/ and shows neither
-- anon= nor authenticated=, and no bare "=X/" entry (which would mean PUBLIC
-- still holds EXECUTE). A NULL/default acl means PUBLIC still has EXECUTE.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  coalesce(array_to_string(p.proacl, ' | '), 'DEFAULT — PUBLIC STILL HAS EXECUTE') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'recompute_document_accounting',
    'auditor_repair_duplicate_companies',
    'auditor_billing_events_claim_pending'
  )
order by p.proname, args;

-- ====================================================
-- ROLLBACK for 117
-- ====================================================
-- Restores EXECUTE to PUBLIC on the three functions 117 restricted, which is the
-- PostgreSQL default state for a newly created function and therefore what these
-- had before any revoke ran.
--
-- Note that scripts/085:60-61 and scripts/088:105-106 had already revoked two of
-- them long before 117. Running this rollback returns them to the default, i.e.
-- it undoes those earlier migrations too, not just 117. Prefer rolling back only
-- the one function that is actually implicated.
-- ====================================================

begin;

grant execute on function public.recompute_document_accounting(uuid) to public;
grant execute on function public.auditor_repair_duplicate_companies() to public;
grant execute on function public.auditor_billing_events_claim_pending(text, int) to public;

commit;

-- ── VERIFY the rollback landed ────────────────────────────────────────────────
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  coalesce(array_to_string(p.proacl, ' | '), 'DEFAULT') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'recompute_document_accounting',
    'auditor_repair_duplicate_companies',
    'auditor_billing_events_claim_pending'
  )
order by p.proname, args;

-- ====================================================
-- 120 - The five SECURITY DEFINER functions 117 could not reach
-- ====================================================
-- Stage 1.5 part B, item 2 — completion. 117 handled three of the nine functions
-- and left five blocked because their live definitions were unknown. Those
-- definitions have since been captured, so each one is resolved here.
--
-- ── 1. generate_document_number(uuid, text) — ownership check, NOT a revoke ────
-- It is called as `authenticated`, not service_role: at
-- lib/document-helpers.ts:299 and lib/documents/actions.ts:675 the `supabase`
-- handle is a parameter typed Awaited<ReturnType<typeof createClient>>, the
-- cookie-based user client. Only
-- lib/billing/vow-billing/providers/internal-provider.ts:193 uses the admin
-- client. Revoking EXECUTE would break document issuance, so the check goes in
-- the body instead.
--
-- The live definition was confirmed identical to scripts/006:237, so the body
-- below is that body reproduced verbatim. The only change is the guard inserted
-- immediately after `begin`. Nothing else in the function is touched — the
-- SELECT ... FOR UPDATE that makes numbering atomic (appendix A) is unchanged, as
-- are the sequence-locking branch, the greatest() computation and the prefix
-- concatenation.
--
-- The guard is written `if auth.uid() is not null and ...` on purpose: under
-- service_role auth.uid() is null, so the server-to-server path is unaffected,
-- while any authenticated caller is confined to their own companies.
--
-- ── 2. allocate_document_number(uuid, text, text) — revoke ────────────────────
-- No call site anywhere in the codebase.
--
-- ── 3. lock_sequence_start(uuid, text, bigint) — revoke, and it is dead code ──
-- No call site. It is also broken: its body addresses columns business_id,
-- doc_type, start_number and next_number, none of which exist on
-- public.document_sequences (see scripts/006 for the real columns —
-- company_id, document_type, starting_number, current_number). Any invocation
-- raises undefined_column. It is left in place rather than dropped, because
-- dropping a function is harder to reverse than revoking one and this migration
-- only needs to close the grant.
--
-- ── 4. lock_sequence_start(uuid, text, integer, text, uuid) — revoke ──────────
-- The working overload of the same name. Still no call site.
--
-- ── 5. select_company_template(uuid, text, uuid) — revoke ────────────────────
-- Abandoned path. It writes to public.company_selected_templates, while the
-- application reads and writes public.company_template_selections
-- (scripts/020:9, wired at app/dashboard/settings/template-selection-actions.ts
-- :46,:149,:237,:278 and priority 0 in lib/pdf-service.ts:417,612). Two tables
-- with transposed names; only the latter is live.
--
-- ── Accepted risk on the four revokes ─────────────────────────────────────────
-- If a call site was missed, the symptom is an immediate permission-denied on
-- that path and 120-ROLLBACK.sql restores the grant in one statement. That is
-- preferable to leaving a SECURITY DEFINER function callable by anon with no
-- ownership check.
--
-- ── Deliberately NOT included ─────────────────────────────────────────────────
-- get_document_company_id(text) keeps EXECUTE for authenticated. A storage RLS
-- policy granted TO authenticated calls it (scripts/027:41-53) and policy
-- expressions evaluate with the caller's privileges, so revoking would break PDF
-- upload for every user. The policy performs its own ownership comparison.
-- ====================================================

begin;

-- ── 1. generate_document_number: body from scripts/006:237, guard added ───────
create or replace function public.generate_document_number(
  p_company_id uuid,
  p_document_type text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sequence record;
  v_next_number integer;
  v_document_number text;
begin
  if auth.uid() is not null
     and p_company_id not in (select public.user_company_ids()) then
    raise exception 'unauthorized';
  end if;

  select * into v_sequence
  from public.document_sequences
  where company_id = p_company_id and document_type = p_document_type
  for update;

  if not found then
    insert into public.document_sequences (company_id, document_type, starting_number, current_number, is_locked)
    values (p_company_id, p_document_type, 1, 1, true)
    returning * into v_sequence;

    v_next_number := 1;
  else
    if not v_sequence.is_locked then
      update public.document_sequences
      set is_locked = true, locked_at = now()
      where id = v_sequence.id;
    end if;

    v_next_number := greatest(v_sequence.current_number + 1, v_sequence.starting_number);

    update public.document_sequences
    set current_number = v_next_number, updated_at = now()
    where id = v_sequence.id;
  end if;

  -- Return pure number without zero-padding
  -- Examples: 1, 99, 100, 1543 (no leading zeros)
  v_document_number := coalesce(v_sequence.prefix, '') || v_next_number::text;
  return v_document_number;
end;
$$;

-- ── 2-5. Revoke EXECUTE on the four functions with no call sites ──────────────
revoke all on function public.allocate_document_number(uuid, text, text) from public, anon, authenticated;
grant execute on function public.allocate_document_number(uuid, text, text) to service_role;

revoke all on function public.lock_sequence_start(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.lock_sequence_start(uuid, text, bigint) to service_role;

revoke all on function public.lock_sequence_start(uuid, text, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.lock_sequence_start(uuid, text, integer, text, uuid) to service_role;

revoke all on function public.select_company_template(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.select_company_template(uuid, text, uuid) to service_role;

commit;

-- ── VERIFY, part 1: the guard is in the function body ─────────────────────────
-- Expected: has_ownership_guard = true, and security_definer = true.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer,
  position('user_company_ids' in pg_get_functiondef(p.oid)) > 0 as has_ownership_guard
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'generate_document_number';

-- ── VERIFY, part 2: EXECUTE is confined on the four revoked functions ─────────
-- Expected for each row: acl lists service_role=X/ (and the owner), with no
-- anon= and no authenticated= entry, and no bare "=X/" which would mean PUBLIC
-- still holds EXECUTE. A DEFAULT acl means the revoke did not apply.
-- generate_document_number is included so its grants can be seen to be UNCHANGED:
-- it must still be executable by authenticated.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  coalesce(array_to_string(p.proacl, ' | '), 'DEFAULT — PUBLIC STILL HAS EXECUTE') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'allocate_document_number',
    'lock_sequence_start',
    'select_company_template',
    'generate_document_number'
  )
order by p.proname, args;

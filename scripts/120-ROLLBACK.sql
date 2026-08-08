-- ====================================================
-- ROLLBACK for 120
-- ====================================================
-- Two independent halves. Run only the half that is actually implicated — they
-- undo different things and there is rarely a reason to run both.
--
-- HALF A restores EXECUTE to PUBLIC on the four functions 120 revoked. Use this
-- if a call site was missed and something now fails with permission denied. The
-- symptom is specific: an error naming one of these four functions.
--
-- HALF B removes the ownership guard from generate_document_number, restoring the
-- body exactly as scripts/006:237 defines it. Use this ONLY if legitimate
-- document issuance started raising 'unauthorized' — which would mean a caller
-- runs as authenticated against a company outside public.user_company_ids().
-- Running half B reopens cross-tenant document numbering, so treat it as an
-- incident measure and close it again.
--
-- Half B is a full create-or-replace of the live body. It is faithful to
-- scripts/006:237, which was confirmed identical to the live definition before
-- 120 ran. If anything else has since changed the function, this overwrites it.
-- ====================================================


-- ══════════════════════════════════════════════════════════════════════════════
-- HALF A — restore EXECUTE on the four revoked functions
-- ══════════════════════════════════════════════════════════════════════════════

begin;

grant execute on function public.allocate_document_number(uuid, text, text) to public;
grant execute on function public.lock_sequence_start(uuid, text, bigint) to public;
grant execute on function public.lock_sequence_start(uuid, text, integer, text, uuid) to public;
grant execute on function public.select_company_template(uuid, text, uuid) to public;

commit;


-- ══════════════════════════════════════════════════════════════════════════════
-- HALF B — remove the ownership guard from generate_document_number
-- ══════════════════════════════════════════════════════════════════════════════

begin;

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

commit;


-- ── VERIFY whichever half was run ─────────────────────────────────────────────
-- After half A: acl for the four functions shows a bare "=X/" entry (PUBLIC).
-- After half B: has_ownership_guard is false.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  position('user_company_ids' in pg_get_functiondef(p.oid)) > 0 as has_ownership_guard,
  coalesce(array_to_string(p.proacl, ' | '), 'DEFAULT') as acl
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

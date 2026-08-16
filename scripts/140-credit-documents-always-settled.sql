-- =====================================================
-- 140 - A credit note is settled the moment it is issued
-- =====================================================
-- Date: 2026-08-16
--
-- ✅ BASE: THE LIVE DEFINITION, CONFIRMED FROM TWO INDEPENDENT SOURCES
-- --------------------------------------------------------------------
-- The function body below is the output of
--     select pg_get_functiondef('public.recompute_document_accounting(uuid)'::regprocedure);
-- taken from Supabase project hpvomklpmblxhejehiyq on 2026-08-16
-- (scripts/live-recompute-definition.sql), and diffed byte-for-byte against
-- scripts/111-conversion-amount-aware.sql. The two bodies are IDENTICAL — 116 lines,
-- empty diff. The base is therefore corroborated by the database and by the repo.
--
-- ⛔ THE LIVE VERSION IS scripts/111, NOT scripts/110.
-- Commits 3310b44 and c8c8d22 claimed 111 was "NOT applied". They are wrong.
-- scripts/117-lock-security-definer-functions.sql:10 ("latest: scripts/111:54") is right.
-- Full account: scripts/111-CORRECTION-applied-status.md
--
-- An earlier draft of this migration was built on the scripts/110 body and would have
-- silently reverted the amount-aware conversion branch. It was discarded, not edited.
--
-- ⛔ PRE-FLIGHT — STILL MANDATORY, AND THE RULE IS INVERTED
-- ---------------------------------------------------------
-- Re-run the pg_get_functiondef query above immediately before applying this file.
--   * output CONTAINS `total_converted`     -> correct, 111 is live. Proceed.
--   * output LACKS `total_converted`        -> STOP. Something reverted the database to
--                                              110 or 043. Do not run this file. Report.
-- And in either case: diff that output against the definition below. It must differ on
-- the document_type line ONLY. Anything else means this file was built on a body that is
-- no longer what runs.
--
-- Problem
-- -------
-- 80 final credit_note rows sit at accounting_status='open' carrying their full
-- outstanding_balance, 126,418.67 in total.
--
-- The settled-on-issue branch lists only ('invoice_receipt','receipt'). A credit note is
-- the SOURCE of its `credit` link
-- (app/dashboard/documents/credit-note/CreditNoteFormClient.tsx:754), while the generic
-- branch sums links by target_document_id, so both sums come back 0 and the CASE falls
-- through to `else 'open'`.
--
-- lib/document-helpers.ts:1563 already classifies credit_note as always-closed and writes
-- 'paid' at issue; the link trigger (scripts/043:158-160, which recomputes BOTH ends)
-- overwrites that correct value moments later. This migration stops the overwrite by
-- teaching the function what the application already knows.
--
-- ⚠️ This is a defect of the GENERIC branch, which scripts/111 never touched. It is
-- unaffected by the 110-vs-111 correction and was measured independently.
--
-- Scope
-- -----
-- ONE logic change: 'credit_note' added to the settled-on-issue document_type list.
-- Everything else — the whole amount-aware conversion branch with its three arms, the
-- generic payment/credit logic, the CASE, the final UPDATE — is the live definition
-- VERBATIM. Verified by diff against the live text, not by reading.
--
-- ⚠️ TWO diff lines, not one. The second is not logic:
--   1. the document_type line               <- the intended change
--   2. `$function$` -> `$function$;`        <- pg_get_functiondef omits the statement
--                                              terminator; without it the file will not
--                                              execute. Declared rather than hidden.
--
-- ⚠️ The inline comment above the changed line still reads "a receipt and an
-- invoice-receipt are settled on issue" and now understates the list. It is left
-- UNTOUCHED ON PURPOSE, to hold the logic diff to a single line. Corrected here instead.
--
-- ⛔ DELIBERATELY NOT TREATED HERE: self_credit_note
-- -------------------------------------------------
-- 5 self_credit_note rows are also 'open' (2,503.96). They stay that way ON PURPOSE:
-- they are open for a DIFFERENT reason, and treating them here would make one document
-- type behave two ways.
--
--   credit_note       lib/document-helpers.ts:1563 lists it -> issued 'paid', then the
--                     link trigger overwrites it to 'open'. A trigger destroying a
--                     correct value. That is what this file fixes.
--
--   self_credit_note  lib/document-helpers.ts:1563 does NOT list it -> written 'open' at
--                     INSERT and never revisited. And it is never the source of a link:
--                     chaining.ts:201 excludes it from SUPERSEDING_TYPES, so
--                     TaxInvoiceFormClient.tsx:985-991 gives it a 'related' link with
--                     amount 0 in which it is the TARGET.
--
-- Adding it below would close a self_credit_note only when a link happened to exist and
-- recompute happened to run, and leave it open when it did not — the same document type
-- in two states depending on an accident. That is worse than the bug. Treating it means
-- changing lib/document-helpers.ts:1563, which is application code and out of scope here.
-- Recorded, not fixed.
--
-- Depends on (NOT created here — the guard below refuses if absent):
--   public.documents.accounting_status / paid_amount / credited_amount / outstanding_balance
--   public.document_links.link_type / source_document_id / target_document_id / amount
--   public.recompute_document_accounting(uuid) already existing
--
-- ⚠️ scripts/117:65-66 revoked EXECUTE from public/anon/authenticated and granted it to
-- service_role. CREATE OR REPLACE preserves the existing ACL; this file does not touch
-- grants. The verification query in the companion file re-checks them.
--
-- Rollback: scripts/140-ROLLBACK.sql (the live definition as it stands now, unchanged).
-- =====================================================

-- ---- install guard: refuse rather than half-apply -------------------------
do $guard$
begin
  if to_regclass('public.documents') is null then
    raise exception '140: public.documents is missing';
  end if;
  if to_regclass('public.document_links') is null then
    raise exception '140: public.document_links is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents'
      and column_name in ('accounting_status','paid_amount','credited_amount','outstanding_balance')
    having count(*) = 4
  ) then
    raise exception '140: documents is missing one of accounting_status/paid_amount/credited_amount/outstanding_balance';
  end if;
  if to_regprocedure('public.recompute_document_accounting(uuid)') is null then
    raise exception '140: recompute_document_accounting(uuid) does not exist';
  end if;
end
$guard$;

CREATE OR REPLACE FUNCTION public.recompute_document_accounting(p_document_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  doc_record record;
  has_conversion boolean;
  target_type text;
  total_paid numeric(12,2);
  total_credited numeric(12,2);
  total_converted numeric(12,2);
  new_status text;
  doc_total numeric(12,2);
begin
  select *
    into doc_record
  from public.documents
  where id = p_document_id;

  if not found then
    return;
  end if;

  doc_total := coalesce(doc_record.total_amount::numeric(12,2), 0);

  -- From scripts/110: a receipt and an invoice-receipt are settled on issue.
  if doc_record.document_type in ('invoice_receipt', 'receipt', 'credit_note')
     and doc_record.document_status = 'final' then
    update public.documents
    set
      accounting_status = 'paid',
      paid_amount = doc_total,
      credited_amount = 0,
      outstanding_balance = 0
    where id = p_document_id;
    return;
  end if;

  -- Conversion: this document is the SOURCE of one or more conversion links.
  select exists(
    select 1
    from public.document_links
    where source_document_id = p_document_id
      and link_type = 'conversion'
  )
  into has_conversion;

  if has_conversion then
    -- CHANGED: how much of this document has actually been superseded.
    select coalesce(sum(amount), 0)::numeric(12,2)
      into total_converted
    from public.document_links
    where source_document_id = p_document_id
      and link_type = 'conversion';

    select d.document_type
      into target_type
    from public.document_links dl
    join public.documents d on d.id = dl.target_document_id
    where dl.source_document_id = p_document_id
      and dl.link_type = 'conversion'
    order by dl.created_at desc
    limit 1;

    -- CHANGED: close only when fully accounted for; otherwise keep the remainder
    -- visible so the rest can still be invoiced.
    if total_converted >= doc_total and doc_total > 0 then
      new_status := case
        when target_type = 'invoice_receipt' then 'paid'
        else 'converted'
      end;

      update public.documents
      set
        accounting_status = new_status,
        paid_amount = doc_total,
        credited_amount = 0,
        outstanding_balance = 0
      where id = p_document_id;
    else
      update public.documents
      set
        accounting_status = case when total_converted > 0 then 'partially_paid' else 'open' end,
        paid_amount = total_converted,
        credited_amount = 0,
        outstanding_balance = (doc_total - total_converted)::numeric(12,2)
      where id = p_document_id;
    end if;
    return;
  end if;

  -- Regular logic (target of payments/credits/cancellations)
  select coalesce(sum(amount), 0)::numeric(12,2)
    into total_paid
  from public.document_links
  where target_document_id = p_document_id
    and link_type = 'payment';

  select coalesce(sum(amount), 0)::numeric(12,2)
    into total_credited
  from public.document_links
  where target_document_id = p_document_id
    and link_type in ('credit','cancellation');

  new_status := case
    when total_paid + total_credited >= doc_total and doc_total > 0 then 'paid'
    when doc_total = 0 and doc_record.document_status = 'final' then 'paid'
    when total_paid > 0 then 'partially_paid'
    when total_credited > 0 then 'credited'
    else 'open'
  end;

  update public.documents
  set
    paid_amount = total_paid,
    credited_amount = total_credited,
    outstanding_balance = (doc_total - total_paid - total_credited)::numeric(12,2),
    accounting_status = new_status
  where id = p_document_id;
end;
$function$;

-- =====================================================
-- Applied file: scripts/140-credit-documents-always-settled.sql
-- =====================================================

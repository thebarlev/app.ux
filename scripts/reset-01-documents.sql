-- =====================================================================
-- Reset · stage 1 of 5 — delete every document
-- =====================================================================
-- ONE TRANSACTION. Nothing is committed unless every assertion passes.
--
-- Run stage 0 first (scripts/reset-evidence-export.mjs) and keep its output. Run
-- scripts/reset-preflight-original-issued.sql immediately before this. Do not run
-- stage 2 until stage 1 is committed and verified.
--
-- Requires the table owner (postgres) — `alter table ... disable trigger` is not
-- available to service_role. Run it in the Supabase SQL editor.
--
-- ── WHY THE TRIGGER IS SUSPENDED AND NOT CHANGED ────────────────────────────
-- trigger_prevent_final_delete is a BEFORE DELETE trigger that refuses to delete a
-- finalised document, and 119 of the 154 are finalised. It is suspended for the
-- span of this transaction and restored two statements later. The protective
-- function itself is NOT modified: weakening a guard in order to pass it once is
-- worse than suspending it under control.
--
-- ALTER TABLE ... DISABLE TRIGGER takes SHARE ROW EXCLUSIVE, which blocks
-- concurrent INSERT/UPDATE/DELETE on public.documents and allows reads, and DDL in
-- PostgreSQL is transactional — so the suspension is invisible to other sessions
-- until COMMIT and is undone by ROLLBACK. There is no window in which another
-- session can delete a finalised document.
--
-- ── ⚠️ TWO TRIGGERS ON THIS TABLE HAVE NO KNOWN DEFINITION ──────────────────
-- trg_auditor_invoice_document_company_check and
-- trigger_enforce_document_number_integrity run in production and have no migration
-- in this repo, so it is NOT known whether either fires on DELETE. If one does, this
-- transaction will fail — which is the safe direction, but capture
--     select tgname, tgtype, pg_get_triggerdef(oid) from pg_trigger
--     where tgrelid = 'public.documents'::regclass and not tgisinternal;
-- before running, so a failure is diagnosable. See FOLLOWUPS, db-code drift.
--
-- ── WHAT DELETES ITSELF ─────────────────────────────────────────────────────
-- CASCADE from documents: document_line_items (207), document_events (440),
--   document_links (0 rows), receipt_payments (0 rows).
-- SET NULL from documents: billing_failures.document_id — 96 rows across 49
--   documents lose their link, silently and by design. That is why stage 0 captures
--   the whole table while the links still exist.
-- RESTRICT from documents: auditor_invoice_documents (14 rows) and
--   billing_documents (0 rows). The 14 are deleted first, explicitly, below. They
--   are auditor subscription invoices for documents 1023-1027 and 1029-1037.
-- =====================================================================

begin;

-- ── 1. snapshot the five sequence rows that must not move ───────────────────
-- Compared value by value at the end of the transaction. document_sequences has no
-- foreign key to documents and no trigger, so nothing here should touch it — this
-- proves it rather than assuming it.
create temporary table _seq_before on commit drop as
select * from public.document_sequences
where company_id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d';

do $$
declare v_n integer;
begin
  select count(*) into v_n from _seq_before;
  if v_n <> 5 then
    raise exception 'expected 5 sequence rows for Bogo Media, found %', v_n;
  end if;
end $$;

-- ── 2. preconditions ────────────────────────────────────────────────────────
do $$
declare
  v_docs integer;
  v_orig integer;
  v_restrict integer;
begin
  select count(*) into v_docs from public.documents;
  if v_docs <> 154 then
    raise exception 'expected 154 documents, found % — scope has changed since it was measured', v_docs;
  end if;

  -- Drift detector, not an exclusion rule: the nine are inside the approved scope.
  -- Listed in scripts/reset-preflight-original-issued.sql.
  select count(*) into v_orig from public.documents where original_issued_at is not null;
  if v_orig <> 9 then
    raise exception 'expected 9 documents with original_issued_at, found %', v_orig;
  end if;

  select count(*) into v_restrict from public.auditor_invoice_documents;
  if v_restrict <> 14 then
    raise exception 'expected 14 auditor_invoice_documents rows, found %', v_restrict;
  end if;

  raise notice 'preconditions passed: 154 documents, 9 with an issued original, 14 RESTRICT rows';
end $$;

-- ── 3. clear the RESTRICT references, then the documents ────────────────────
delete from public.auditor_invoice_documents;

alter table public.documents disable trigger trigger_prevent_final_delete;
delete from public.documents;
alter table public.documents enable trigger trigger_prevent_final_delete;

-- ── 4. verify after ─────────────────────────────────────────────────────────
do $$
declare
  v_docs integer; v_items integer; v_events integer; v_aid integer;
  v_moved integer;
begin
  select count(*) into v_docs   from public.documents;
  select count(*) into v_items  from public.document_line_items;
  select count(*) into v_events from public.document_events;
  select count(*) into v_aid    from public.auditor_invoice_documents;

  if v_docs <> 0 then raise exception 'documents should be 0, found %', v_docs; end if;
  if v_items <> 0 then raise exception 'document_line_items should be 0 by cascade, found %', v_items; end if;
  if v_events <> 0 then raise exception 'document_events should be 0 by cascade, found %', v_events; end if;
  if v_aid <> 0 then raise exception 'auditor_invoice_documents should be 0, found %', v_aid; end if;

  -- The five sequence rows, every column, both directions.
  select count(*) into v_moved from (
    (select * from public.document_sequences
      where company_id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'
     except select * from _seq_before)
    union all
    (select * from _seq_before
     except select * from public.document_sequences
      where company_id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d')
  ) diff;

  if v_moved <> 0 then
    raise exception 'document_sequences moved: % differing row(s). Rolling back.', v_moved;
  end if;

  raise notice 'stage 1 verified: 0 documents, cascades empty, 5 sequence rows byte-identical';
end $$;

commit;

-- After COMMIT, for the record. Expected: 0, 0, 0, 0, and 5 rows with
-- invoice_receipt at current_number 1156.
select
  (select count(*) from public.documents)                  as documents,
  (select count(*) from public.document_line_items)         as line_items,
  (select count(*) from public.document_events)             as events,
  (select count(*) from public.auditor_invoice_documents)   as auditor_invoice_documents,
  (select count(*) from public.billing_failures
     where document_id is not null)                        as billing_failures_still_linked;

select company_id, document_type, prefix, starting_number, current_number, is_locked, locked_at
from public.document_sequences
where company_id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'
order by document_type;

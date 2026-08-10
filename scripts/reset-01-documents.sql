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
-- ── ONE TRIGGER FIRES ON DELETE, AND IT IS THE ONE SUSPENDED ────────────────
-- Settled from pg_trigger against production rather than assumed. Six triggers sit
-- on public.documents and only trigger_prevent_final_delete fires on DELETE:
--
--   before_invoice_receipt_insert                BEFORE INSERT              no
--   trg_auditor_invoice_document_company_check   BEFORE UPDATE OF company_id  no
--   trigger_enforce_document_immutability        BEFORE UPDATE              no
--   trigger_enforce_document_number_integrity    BEFORE INSERT OR UPDATE    no
--   trigger_log_document_event                   AFTER INSERT OR UPDATE     no
--   trigger_prevent_final_delete                 BEFORE DELETE              YES
--
-- Suspending that one is therefore sufficient. The full table with definitions is
-- in docs/RESET-2026-08-10.md. Note that two of the six still have no migration in
-- this repo — that is unchanged and recorded in FOLLOWUPS under db-code drift; it is
-- simply no longer a risk to THIS transaction.
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

-- ── 1b. pin the deletion scope, by id ───────────────────────────────────────
-- Every statement below deletes BY THIS SET and never by an open predicate. A
-- statement without a WHERE has a blast radius that depends on a fact that was true
-- when it was written; naming the rows makes the radius part of the statement.
--
-- The scope is every document, which is what was approved — so this table and
-- public.documents hold the same 154 ids today. That is precisely why it is written
-- down: if it is ever run against a narrower scope, the statements narrow with it
-- instead of taking the table.
create temporary table _documents_to_delete on commit drop as
select id from public.documents;

-- ── 2. preconditions ────────────────────────────────────────────────────────
do $$
declare
  v_docs integer;
  v_orig integer;
  v_restrict integer;
  v_scope integer;
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

  select count(*) into v_restrict from public.auditor_invoice_documents
  where document_id in (select id from _documents_to_delete);
  if v_restrict <> 14 then
    raise exception 'expected 14 auditor_invoice_documents rows in scope, found %', v_restrict;
  end if;

  select count(*) into v_scope from _documents_to_delete;
  if v_scope <> 154 then
    raise exception 'expected 154 documents in the deletion scope, found %', v_scope;
  end if;

  raise notice 'preconditions passed: 154 documents in scope, 9 with an issued original, 14 RESTRICT rows';
end $$;

-- ── 3. clear the RESTRICT references, then the documents ────────────────────
-- auditor_invoice_documents is ON DELETE RESTRICT: it does not cascade, and it
-- blocks the document delete until the reference is gone. Clearing the reference is
-- the way past a RESTRICT; disabling the constraint would not be.
--
-- 14 before, 0 after, and the count of rows actually removed is checked against 14.
do $$
declare v_deleted integer;
begin
  delete from public.auditor_invoice_documents
  where document_id in (select id from _documents_to_delete);

  get diagnostics v_deleted = row_count;
  if v_deleted <> 14 then
    raise exception 'expected to delete 14 auditor_invoice_documents rows, deleted %', v_deleted;
  end if;

  if exists (select 1 from public.auditor_invoice_documents
             where document_id in (select id from _documents_to_delete)) then
    raise exception 'auditor_invoice_documents still references documents in scope';
  end if;

  raise notice 'auditor_invoice_documents: 14 deleted, 0 remaining in scope';
end $$;

alter table public.documents disable trigger trigger_prevent_final_delete;

do $$
declare v_deleted integer;
begin
  delete from public.documents
  where id in (select id from _documents_to_delete);

  get diagnostics v_deleted = row_count;
  if v_deleted <> 154 then
    raise exception 'expected to delete 154 documents, deleted %', v_deleted;
  end if;

  raise notice 'documents: 154 deleted';
end $$;

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
  -- Both hold because the scope is every document; the scoped one is the assertion
  -- that matters, the total is the corroboration.
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

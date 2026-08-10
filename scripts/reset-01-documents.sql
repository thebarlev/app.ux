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
-- ── THE COMPANY THAT SURVIVES IS RESOLVED, NOT ASSUMED ──────────────────────
-- A hardcoded company id was the single point of failure in this reset: every guard
-- downstream checked that the surviving company was not in the delete set, and none
-- of them checked that it was the RIGHT company. If the literal were wrong, they
-- would all have passed.
--
-- So the company is resolved from itzikbab@gmail.com through company_members, and
-- five facts about the result are asserted before a single row is deleted. Four of
-- them are checked here; the fifth — that it is not in the delete set — belongs to
-- stage 2, where that set exists, and is checked there.
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
-- session can delete a finalised document. If an assertion fails after the
-- suspension, the ENABLE never runs — and the rollback restores the trigger anyway.
--
-- ── ONE TRIGGER FIRES ON DELETE, AND IT IS THE ONE SUSPENDED ────────────────
-- Settled from pg_get_triggerdef against production. Six triggers sit on
-- public.documents and only trigger_prevent_final_delete fires on DELETE:
--
--   before_invoice_receipt_insert                BEFORE INSERT                no
--   trg_auditor_invoice_document_company_check   BEFORE UPDATE OF company_id  no
--   trigger_enforce_document_immutability        BEFORE UPDATE                no
--   trigger_enforce_document_number_integrity    BEFORE INSERT OR UPDATE      no
--   trigger_log_document_event                   AFTER INSERT OR UPDATE       no
--   trigger_prevent_final_delete                 BEFORE DELETE                YES
--
-- Suspending that one is sufficient. This transaction performs no INSERT and no
-- UPDATE on public.documents, so the other five never fire. Full definitions are in
-- docs/RESET-2026-08-10.md.
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

-- ── 1. resolve the surviving company from the account that owns it ──────────
-- Through company_members, from the email. companies.auth_user_id agrees, but the
-- membership row is the relationship the application uses.
create temporary table _kept_company on commit drop as
select
  c.id,
  c.company_name,
  c.registration_number,
  (select count(*) from public.documents d where d.company_id = c.id) as document_count
from public.companies c
join public.company_members m on m.company_id = c.id
join auth.users u on u.id = m.user_id
where lower(u.email) = 'itzikbab@gmail.com';

do $$
declare
  v_n integer;
  v_id uuid;
  v_reg text;
  v_docs integer;
begin
  -- Fact 1: exactly one company resolves. Zero means the account or the membership
  -- is gone; more than one means the relationship is ambiguous. Either way, stop.
  select count(*) into v_n from _kept_company;
  if v_n <> 1 then
    raise exception
      'resolved % company(ies) from itzikbab@gmail.com via company_members, expected exactly 1 — refusing to delete anything',
      v_n;
  end if;

  select id, registration_number, document_count
    into v_id, v_reg, v_docs
  from _kept_company;

  -- Fact 2: it is the company we mean.
  if v_id <> '4ae68334-15a0-4fa3-a9ba-fd77deccc95d' then
    raise exception 'resolved company is % — expected 4ae68334-15a0-4fa3-a9ba-fd77deccc95d', v_id;
  end if;

  -- Fact 3: the registration number of Bogo Media. Note that companies.tax_id is
  -- NULL for this row and the number lives in registration_number — which is also
  -- why the BKMV export falls back to that column.
  if v_reg is distinct from '515960508' then
    raise exception 'resolved company registration_number is % — expected 515960508', v_reg;
  end if;

  -- Fact 4: it holds the documents we measured.
  if v_docs <> 145 then
    raise exception 'resolved company holds % documents — expected 145', v_docs;
  end if;

  raise notice 'company resolved: % (%) · registration_number % · % documents',
    v_id, (select company_name from _kept_company), v_reg, v_docs;
end $$;

-- ── 2. snapshot the five sequence rows that must not move ───────────────────
-- Compared value by value at the end of the transaction. document_sequences has no
-- foreign key to documents and no trigger, so nothing here should touch it — this
-- proves it rather than assuming it.
create temporary table _seq_before on commit drop as
select * from public.document_sequences
where company_id = (select id from _kept_company);

do $$
declare v_n integer;
begin
  select count(*) into v_n from _seq_before;
  if v_n <> 5 then
    raise exception 'expected 5 sequence rows for the resolved company, found %', v_n;
  end if;
end $$;

-- ── 3. pin the deletion scope, by id ────────────────────────────────────────
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

-- ── 4. preconditions ────────────────────────────────────────────────────────
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

-- ── 5. clear the RESTRICT references, then the documents ────────────────────
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

-- ── 6. verify after ─────────────────────────────────────────────────────────
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

  -- The five sequence rows, every column, both directions, against the resolved company.
  select count(*) into v_moved from (
    (select * from public.document_sequences
      where company_id = (select id from _kept_company)
     except select * from _seq_before)
    union all
    (select * from _seq_before
     except select * from public.document_sequences
      where company_id = (select id from _kept_company))
  ) diff;

  if v_moved <> 0 then
    raise exception 'document_sequences moved: % differing row(s). Rolling back.', v_moved;
  end if;

  -- The company itself must still be here. Stage 1 deletes no company.
  if not exists (select 1 from public.companies where id = (select id from _kept_company)) then
    raise exception 'the resolved company is gone — stage 1 must not delete a company';
  end if;

  raise notice 'stage 1 verified: 0 documents, cascades empty, 5 sequence rows byte-identical, company intact';
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

select s.company_id, s.document_type, s.prefix, s.starting_number, s.current_number,
       s.is_locked, s.locked_at
from public.document_sequences s
join public.companies c on c.id = s.company_id
join public.company_members m on m.company_id = c.id
join auth.users u on u.id = m.user_id
where lower(u.email) = 'itzikbab@gmail.com'
order by s.document_type;

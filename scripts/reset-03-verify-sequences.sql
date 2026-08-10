-- =====================================================================
-- Reset · stage 3 of 5 — the five sequence rows are untouched
-- =====================================================================
-- READ ONLY. Selects and a RAISE. Run after stage 2 commits.
--
-- Stages 1 and 2 each verify the sequences inside their own transaction and roll
-- back on any movement. This stage exists because that is not the same thing: it
-- checks the values against what was measured BEFORE the reset began, from outside
-- any transaction that could have produced them. It is the evidence, not the guard.
--
-- Measured 2026-08-10, before stage 0:
--
--   company_id  document_type     prefix  starting  current  is_locked
--   ----------  ----------------  ------  --------  -------  ---------
--   4ae68334    delivery_note     ''           100      100  true
--   4ae68334    invoice_receipt   ''          1000     1156  true
--   4ae68334    receipt           ''          2000     2000  true
--   4ae68334    tax_invoice       ''          1000     1014  true
--   4ae68334    work_order        ''          1000     1000  true
--
-- Not touched by any stage: no update, no delete, no insert. current_number stays
-- 1156 for invoice_receipt, so the next invoice-receipt issued is 1157 — the
-- numbering continues where it stopped and no number is ever reused. Resetting it to
-- 1000 would reissue numbers that already existed on deleted documents, and those
-- numbers are in the regulatory file kept as evidence.
-- =====================================================================

do $$
declare
  v_rows integer;
  v_current integer;
  v_unlocked integer;
begin
  select count(*) into v_rows from public.document_sequences;
  if v_rows <> 5 then
    raise exception 'expected 5 sequence rows in total, found %', v_rows;
  end if;

  select count(*) into v_rows from public.document_sequences
  where company_id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d';
  if v_rows <> 5 then
    raise exception 'expected all 5 remaining rows to be Bogo Media''s, found %', v_rows;
  end if;

  -- Value by value, against the pre-reset measurement.
  select count(*) into v_rows from (
    values
      ('delivery_note',   100,  100),
      ('invoice_receipt', 1000, 1156),
      ('receipt',         2000, 2000),
      ('tax_invoice',     1000, 1014),
      ('work_order',      1000, 1000)
  ) as expected(document_type, starting_number, current_number)
  join public.document_sequences s
    on s.document_type   = expected.document_type
   and s.starting_number = expected.starting_number
   and s.current_number  = expected.current_number
   and s.company_id      = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d';

  if v_rows <> 5 then
    raise exception
      'sequence values do not match the pre-reset measurement: % of 5 rows matched', v_rows;
  end if;

  select count(*) into v_unlocked from public.document_sequences where is_locked is not true;
  if v_unlocked <> 0 then
    raise exception '% sequence row(s) are no longer locked', v_unlocked;
  end if;

  select current_number into v_current from public.document_sequences
  where company_id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'
    and document_type = 'invoice_receipt';
  if v_current <> 1156 then
    raise exception 'invoice_receipt current_number is % — expected 1156', v_current;
  end if;

  raise notice 'stage 3 passed: 5 rows, all Bogo Media, all locked, invoice_receipt at 1156 (next: 1157)';
end $$;

-- For the evidence bundle. Compare against
-- evidence-2026-08-10/document_sequences.json, filtered to company 4ae68334.
select company_id, document_type, prefix, starting_number, current_number,
       is_locked, locked_at, created_at, updated_at
from public.document_sequences
order by document_type;

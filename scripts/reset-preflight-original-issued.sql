-- =====================================================================
-- Reset preflight — documents from which an original was issued
-- =====================================================================
-- READ ONLY. One SELECT and a RAISE. No insert, update or delete.
-- Run it on its own, before anything else, and again immediately before the
-- deletion transaction.
--
-- What it is for: `original_issued_at` is written once, when an original is
-- successfully downloaded, and it is never cleared. It is the strongest evidence
-- in this schema that a document left the building. This file pins how many
-- documents carry it, so that a count that has changed since it was measured
-- stops the reset instead of being discovered afterwards.
--
-- Measured 2026-08-10 against production: EXACTLY 9, across four companies.
-- Six belong to Bogo Media (4ae68334), and three do not.
--
--   number  type             issue_date   amount   currency  original_issued_at
--   ------  ---------------  -----------  -------  --------  --------------------------
--   1       receipt          2026-02-18      1.00  ILS       2026-02-18T15:40:01.072Z
--             company 88843b67-9bae-4f8a-9378-e4e545ba9935  "Pain Resolution Therapy"
--   1072    invoice_receipt  2026-03-08    111.00  USD       2026-03-08T17:51:09.944Z
--             company 4ae68334-15a0-4fa3-a9ba-fd77deccc95d  Bogo Media
--   1080    invoice_receipt  2026-03-08     11.00  USD       2026-03-08T18:57:53.631Z
--             company 4ae68334  Bogo Media
--   1081    invoice_receipt  2026-03-08     11.00  USD       2026-03-08T19:02:18.458Z
--             company 4ae68334  Bogo Media
--   1083    invoice_receipt  2026-03-08     11.00  USD       2026-03-08T19:19:50.553Z
--             company 4ae68334  Bogo Media
--   1008    tax_invoice      2026-03-08    484.00  USD       2026-03-08T20:15:55.340Z
--             company 4ae68334  Bogo Media
--   1000    work_order       2026-05-04     25.96  ILS       2026-05-04T17:54:54.969Z
--             company 4ae68334  Bogo Media
--   1001    tax_invoice      2026-08-08     14.16  ILS       2026-08-08T18:23:12.545Z
--             company 9254c0f6-d078-4bcf-85b7-cf32526d04f7  "test" (itzik+test1@uxellent.com)
--   1000    receipt          2026-08-09    122.00  ILS       2026-08-09T12:35:14.080Z
--             company 6a6b00a1-3eb9-4617-b163-0fa8a4fd7291  "test" (itzik+test2@gmail.com)
--
-- Two of the nine are from 8 and 9 August 2026 — the day before this was written —
-- and one belongs to a company whose name and address do not read as test data.
-- That is a fact about the data, not a decision, and it is recorded here so the
-- decision is made with it in view.
--
-- NOTE ON SCOPE. The count of 9 is over EVERY document in public.documents, which
-- is the deletion scope as instructed ("all 154 documents"). If the scope narrows,
-- the expected number changes with it — Bogo Media alone is 6 — and this file must
-- be edited deliberately rather than left to fail. That it would fail is the point.
-- =====================================================================

do $$
declare
  v_expected constant integer := 9;
  v_actual   integer;
  v_listing  text;
begin
  select count(*) into v_actual
  from public.documents
  where original_issued_at is not null;

  if v_actual <> v_expected then
    -- Name every one of them in the error, so a changed count is diagnosable from
    -- the message alone without a second query.
    select string_agg(
             format('%s/%s %s %s %s', d.document_number, d.document_type,
                    d.issue_date, d.total_amount, d.company_id),
             E'\n  ' order by d.issue_date, d.document_number)
      into v_listing
    from public.documents d
    where d.original_issued_at is not null;

    raise exception
      'reset preflight failed: expected % document(s) with original_issued_at, found %.%',
      v_expected, v_actual,
      coalesce(E'\n  ' || v_listing, ' (none)');
  end if;

  raise notice 'reset preflight passed: % document(s) with original_issued_at, as measured.', v_actual;
end $$;

-- Companion listing, for the evidence bundle. Read-only; run it and keep the output.
select
  d.document_number,
  d.document_type,
  d.issue_date,
  d.total_amount,
  d.currency,
  d.company_id,
  c.company_name,
  c.email as company_email,
  d.original_issued_at,
  d.id as document_id
from public.documents d
left join public.companies c on c.id = d.company_id
where d.original_issued_at is not null
order by d.issue_date, d.document_number;

-- ====================================================
-- 122 - Company dealer-number uniqueness  (customer register · step 0ב)
-- ====================================================
-- ⛔ DEFERRED 2026-08-10. NOT MERGED, NOT RUN. Dealer-number uniqueness matters
-- for going to market, not for the רשם בתי התוכנה submission. Resumes after the
-- submission. The file is kept as-is so the analysis below is not redone.
--
-- ⛔ AND IT MUST NOT BE RUN AS WRITTEN. Section 1 below carries a
-- `create or replace function public.normalize_registration_number(...)`.
-- That was written on the false premise that the function did not exist.
--
-- ── SETTLED 2026-08-10 · normalize_registration_number DOES EXIST ────────────
-- It exists in production. Confirmed from pg_proc in the SQL editor:
--
--   · IMMUTABLE — so it is usable in an index expression, which is what the whole
--     design of this file depends on.
--   · its regex is [^0-9] — it strips every non-digit. Clean; it does NOT carry
--     the '[\\s-]+' bug that scripts/050 has (documented at the end of
--     scripts/121). Note it is BROADER than what section 1 below would have
--     installed: [^0-9] removes letters too, not only whitespace and hyphens.
--
-- WHEN THIS FILE RESUMES:
--   1. DELETE section 1 entirely. Use the existing function as it is. No
--      create, no replace, no wrapper that shadows it.
--   2. The dependency question is moot — nothing is being redefined, so nothing
--      can be silently invalidated and no REINDEX discipline is needed for it.
--      The caveat still applies to company_dealer_number, which IS created here.
--   3. STILL UNVERIFIED, and it decides one thing: does the existing function
--      left-pad to 9 digits? If it does not, '15960508' and '015960508' are two
--      dealer numbers to the unique index and one dealer to the checksum in
--      scripts/050. Read pg_get_functiondef before relying on either answer.
--
-- Why this could not be seen from here: a service-role PostgREST client can read
-- tables, but it cannot see a function that is not exposed as an RPC. The repo
-- grep was sound and the repo genuinely has no definition — the claim that went
-- beyond it, that the function was absent from the DATABASE, was never checked.
-- Same blind spot that made receipt_payments look non-existent earlier. A
-- production function with no migration in scripts/ and no caller in the repo is
-- itself another instance of the db↔code drift already in FOLLOWUPS.
-- ====================================================
-- A different constraint from 121, on a different table, for a different reason.
-- 121 is about the BUYER's tax id. This one is about the ISSUING dealer's number —
-- the value that identifies the business to the Tax Authority, that is printed on
-- every document, that fills field 1003 of the BKMV file, and whose first eight
-- digits name the export directory.
--
-- Before the 2026-08-10 reset, THREE company rows carried the same registration
-- number 515960508. That state is gone with the reset; this file is what stops it
-- recurring. Two companies sharing a dealer number means two sets of books
-- claiming to be the same business, and it is a go-to-market blocker: the file
-- registered with רשם בתי התוכנה is per-dealer, and there is no answer to the
-- question of which of the two rows it belongs to.
--
-- ── FIRST, THE PROBLEM WITH THE INSTRUCTION "unique on registration_number" ──
-- There is no single column holding the dealer number. There are THREE, all
-- nullable text, added at three different times, all read as the same concept:
--
--   companies.tax_id              scripts/001:8   — the original column
--   companies.registration_number scripts/010:7   — added later
--   companies.company_number      scripts/012:6   — added later still
--
-- And they are read with FOUR different precedence orders:
--
--   coalesce(registration_number, tax_id)                  067:139, 068:145, 069:144,
--                                                          070:131, 071:153, 073:172,
--                                                          082:129, 085:128, 061:113
--                                                          — the SQL issuance functions
--   tax_id || registration_number || company_number        lib/document-helpers.ts:1004
--                                                          app/api/shaam/invoice-decision:78
--   tax_id || registration_number                          app/api/regulatory/bkmv/export:77
--   registration_number || company_number                  the three PreviewClient.tsx
--
-- So a unique index on registration_number alone does not prevent two companies
-- from holding the same dealer number. Counter-example, all of it legal today:
--
--   company X: registration_number = 'A', tax_id = 'Z'
--   company Y: registration_number = null, tax_id = 'A'
--
-- registration_number is unique across the two, and yet the SQL issuance path
-- computes coalesce(registration_number, tax_id) = 'A' for BOTH and issues both
-- companies' documents under dealer A. The constraint would have passed and the
-- defect it exists to prevent would still be there.
--
-- ── HOW THIS FILE CLOSES IT ─────────────────────────────────────────────────
-- Two constraints, not one:
--
--   1. companies_dealer_number_consistent — a check that the non-null values
--      among the three columns all canonicalise to the SAME number. A row may
--      leave any of them null; it may not have them disagree.
--
--   2. companies_dealer_number_unique — a unique index on the canonical value.
--
-- (1) is what makes (2) sufficient. Once no row can hold two different numbers,
-- every one of the four precedence orders above returns the same value for that
-- row, and a single unique index over one of them constrains all of them. The
-- ordering divergence stops being a correctness question. It is still a mess and
-- still wants collapsing into one column; that is a separate change, and it is
-- SAFE to defer precisely because of (1).
--
-- ── IS (1) SAFE AGAINST THE LIVE WRITE PATHS? MEASURED, NOT ASSUMED ─────────
-- Every path that inserts a company writes exactly one of the three:
--
--   app/(auth)/register4/page.tsx:152                registration_number only
--   components/registration/step-business-profile:127  registration_number only
--   components/registration/step-onboarding:155        registration_number only
--   components/registration/step-address.tsx:91        registration_number only
--   app/api/auditor/auth/bootstrap-company:164         tax_id: null explicitly
--   lib/auditor/billing/process-indicator-event:287    tax_id: null explicitly
--
-- Nothing writes company_number at all. All four signup paths normalise in
-- TypeScript first (lib/validation/israeli-id.ts:14) so the stored value is
-- already digits-only. No live path can produce a disagreeing row, so (1) cannot
-- break signup today.
--
-- ── WHAT IT DOES NOT DO: NO REQUIREDNESS, NO NEW CHECKSUM ───────────────────
-- registration_number stays nullable. A company may exist without a dealer
-- number — bootstrap and the auditor paths create exactly that — and the partial
-- index excludes those rows. Making it required is a separate decision with its
-- own consequences for signup.
--
-- The checksum stays where it is: trigger_enforce_company_registration_number_checksum
-- (050:83) already validates registration_number on insert and update. This file
-- adds no validation and removes none. Note the asymmetry it leaves: tax_id and
-- company_number are NOT checksum-validated, so garbage there can occupy the
-- canonical namespace. Constraint (1) contains the damage to one row.
--
-- ── THE CANONICAL FORM ──────────────────────────────────────────────────────
--   strip whitespace and hyphens · empty becomes null · left-pad to 9 digits
--
-- Padding is included here and excluded in 121 (customers) on purpose. This value
-- is an Israeli dealer number: 050:47 computes its checksum over lpad(v, 9, '0'),
-- so '15960508' and '015960508' are the same dealer to the validator and must be
-- the same dealer to the constraint. The TypeScript normaliser does not pad, so
-- the stored value is un-padded and both forms are storable today.
--
-- A value longer than 9 characters is left UNPADDED rather than truncated. lpad()
-- truncates when the input is longer than the target width, and a normaliser that
-- silently shortens a dealer number would create collisions instead of finding
-- them. Such a value cannot pass the checksum trigger anyway (050:41 rejects
-- length > 9), so it can only arrive in tax_id or company_number.
--
-- ── normalize_registration_number DID NOT EXIST ─────────────────────────────
-- It is created here. It is not in scripts/, not anywhere in the repository, and
-- not in the database. The nearest thing was the same normalisation inlined twice
-- inside scripts/050 — and inlined with a regex bug, which is documented at the
-- bottom of scripts/121 and deliberately not repeated here.
--
-- ── CAVEAT ON EXPRESSION INDEXES ────────────────────────────────────────────
-- The index stores values computed by the function definitions that existed when
-- it was built. `create or replace` on normalize_registration_number or on
-- company_dealer_number does NOT rebuild it, and uniqueness silently stops
-- holding. Any change to either body must REINDEX companies_dealer_number_unique
-- in the same migration.
--
-- ── MEASURED IN PRODUCTION 2026-08-10, BEFORE WRITING THIS ──────────────────
-- One company remains after the reset:
--   4ae68334-15a0-4fa3-a9ba-fd77deccc95d · בוגו מדיה בע״מ
--   registration_number '515960508' · tax_id null · company_number null
-- Both constraints pass trivially on it. The preconditions are in the file anyway.
--
-- ── ONE CONSEQUENCE TO HANDLE SEPARATELY ────────────────────────────────────
-- After this lands, a signup that reuses an existing dealer number FAILS at the
-- database. That is the intent. But the four signup call sites surface
-- error.message straight to the user, so what a person will see is a raw
-- 'duplicate key value violates unique constraint "companies_dealer_number_unique"'.
-- It will read as a crash, not as "this business is already registered". A Hebrew
-- message for constraint code 23505 on that index name is needed in those four
-- places. Not done here, because this file must not change application behaviour.
-- A FOLLOWUPS entry for it is proposed but NOT yet written — this comment is the
-- only record of it so far.
-- ====================================================

begin;

-- ── 1. the canonical form of a dealer number ────────────────────────────────
-- immutable: required for an expression index.
-- strict:    null in, null out, without executing the body.
--
-- '[[:space:]-]' is a POSIX class, not a backslash escape, so it is unambiguous
-- under standard_conforming_strings. The hyphen is last in the bracket and is
-- therefore literal. This is the correct form of the expression that scripts/050
-- gets wrong; see the note at the end of scripts/121.
create or replace function public.normalize_registration_number(p_value text)
returns text
language sql
immutable
strict
as $$
  select case
           when v = ''          then null
           when length(v) > 9   then v          -- never truncate: lpad() would
           else lpad(v, 9, '0')
         end
  from (select regexp_replace(p_value, '[[:space:]-]', '', 'g') as v) s
$$;

comment on function public.normalize_registration_number(text) is
  'Canonical form of an Israeli dealer number: whitespace and hyphens removed, '
  'empty becomes null, left-padded to 9 digits, never truncated. Matches how '
  'is_valid_israeli_id (scripts/050) interprets the value. Changing this body '
  'requires REINDEX companies_dealer_number_unique.';

-- ── 2. the one definition of "this company's dealer number" ─────────────────
-- Precedence follows the SQL issuance functions — registration_number first —
-- because those are what write the number onto issued documents. Which order is
-- used stops mattering once companies_dealer_number_consistent holds; a single
-- definition is declared anyway so the check and the index cannot drift apart.
create or replace function public.company_dealer_number(
  p_registration_number text,
  p_tax_id              text,
  p_company_number      text
)
returns text
language sql
immutable
as $$
  select coalesce(
    public.normalize_registration_number(p_registration_number),
    public.normalize_registration_number(p_tax_id),
    public.normalize_registration_number(p_company_number)
  )
$$;

comment on function public.company_dealer_number(text, text, text) is
  'The single definition of a company''s dealer number, over the three columns '
  'that have historically held it. Used by both companies_dealer_number_consistent '
  'and companies_dealer_number_unique so they cannot diverge. Changing this body '
  'requires REINDEX companies_dealer_number_unique.';

-- ── 3. preconditions ────────────────────────────────────────────────────────
-- Both constraints would reject bad rows on their own. These run first so the
-- failure names the rows, rather than reporting a violation and leaving the
-- diagnosis to a second query.
do $$
declare
  v_bad integer;
  v_dupes integer;
  v_listing text;
begin
  -- (a) rows whose three columns disagree
  select count(*), string_agg(
           format('%s (%s) · registration_number %s · tax_id %s · company_number %s',
                  id, company_name,
                  coalesce(registration_number, '<null>'),
                  coalesce(tax_id, '<null>'),
                  coalesce(company_number, '<null>')),
           E'\n  ' order by company_name)
    into v_bad, v_listing
  from public.companies
  where public.company_dealer_number(registration_number, tax_id, company_number) is not null
    and (
         (public.normalize_registration_number(tax_id) is not null
            and public.normalize_registration_number(tax_id)
                <> public.company_dealer_number(registration_number, tax_id, company_number))
      or (public.normalize_registration_number(company_number) is not null
            and public.normalize_registration_number(company_number)
                <> public.company_dealer_number(registration_number, tax_id, company_number))
    );

  if v_bad > 0 then
    -- Built with || rather than as a multi-line format string: PL/pgSQL's RAISE
    -- expects a single format literal. Same below and in scripts/121.
    raise exception '%',
      'REFUSING: ' || v_bad || ' company row(s) hold disagreeing dealer numbers'
      || ' across registration_number / tax_id / company_number. Decide which is'
      || ' correct for each before this constraint is added — this file does not'
      || ' rewrite data:'
      || coalesce(E'\n  ' || v_listing, '');
  end if;

  -- (b) companies already sharing a canonical dealer number
  select count(*), string_agg(t, E'\n  ') into v_dupes, v_listing
  from (
    select format('dealer %s · %s companies · %s',
                  public.company_dealer_number(registration_number, tax_id, company_number),
                  count(*),
                  string_agg(format('%s (%s)', id, company_name), ', ')) as t
    from public.companies
    where public.company_dealer_number(registration_number, tax_id, company_number) is not null
    group by public.company_dealer_number(registration_number, tax_id, company_number)
    having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise exception '%',
      'REFUSING: ' || v_dupes || ' dealer number(s) are held by more than one company.'
      || ' This is the state the constraint exists to prevent and it cannot be added'
      || ' while it exists. Resolve which company owns each number first:'
      || coalesce(E'\n  ' || v_listing, '');
  end if;

  raise notice 'preconditions passed: no disagreeing rows, no shared dealer numbers';
end $$;

-- ── 4. the columns may not disagree ─────────────────────────────────────────
-- This is what makes the single unique index below sufficient despite the four
-- precedence orders in the codebase. The first conjunct is trivially true
-- whenever registration_number is present — it IS the head of the coalesce — and
-- is written out for symmetry, so the rule reads as "every non-null value equals
-- the canonical one" rather than as two special cases.
alter table public.companies drop constraint if exists companies_dealer_number_consistent;
alter table public.companies
  add constraint companies_dealer_number_consistent
  check (
       (public.normalize_registration_number(registration_number) is null
          or public.normalize_registration_number(registration_number)
             = public.company_dealer_number(registration_number, tax_id, company_number))
   and (public.normalize_registration_number(tax_id) is null
          or public.normalize_registration_number(tax_id)
             = public.company_dealer_number(registration_number, tax_id, company_number))
   and (public.normalize_registration_number(company_number) is null
          or public.normalize_registration_number(company_number)
             = public.company_dealer_number(registration_number, tax_id, company_number))
  );

-- ── 5. one dealer number, one company ───────────────────────────────────────
-- Not scoped to anything: a dealer number is unique at the Tax Authority, so it
-- must be unique across the whole table. Partial, so the companies with no
-- number at all — bootstrap rows and the auditor paths — are excluded rather
-- than colliding on null.
--
-- Built non-concurrently, inside the transaction. That blocks writes to
-- public.companies for the duration; the table holds one row. If it is ever run
-- against a large companies table, move it out of the transaction and use
-- CREATE UNIQUE INDEX CONCURRENTLY.
drop index if exists public.companies_dealer_number_unique;
create unique index companies_dealer_number_unique
  on public.companies (public.company_dealer_number(registration_number, tax_id, company_number))
  where public.company_dealer_number(registration_number, tax_id, company_number) is not null;

comment on index public.companies_dealer_number_unique is
  'One company per dealer number. Three companies shared 515960508 before the '
  '2026-08-10 reset. Rebuild with REINDEX if normalize_registration_number or '
  'company_dealer_number changes.';

commit;

-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- Expected: companies_dealer_number_unique present with indisunique = true.
select i.relname as index_name, x.indisunique, pg_get_indexdef(x.indexrelid) as definition
from pg_index x
join pg_class i on i.oid = x.indexrelid
join pg_class t on t.oid = x.indrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public' and t.relname = 'companies'
order by i.relname;

-- Expected: companies_dealer_number_consistent present.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.companies'::regclass and contype = 'c'
order by conname;

-- Expected today: one row, 515960508 -> 515960508, the other two columns null.
select id,
       company_name,
       registration_number,
       tax_id,
       company_number,
       public.company_dealer_number(registration_number, tax_id, company_number) as dealer_number
from public.companies
order by company_name;

-- The checksum trigger is untouched by this file. Expected: still present, still
-- BEFORE INSERT OR UPDATE on public.companies.
select tgname, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.companies'::regclass
  and not tgisinternal
order by tgname;

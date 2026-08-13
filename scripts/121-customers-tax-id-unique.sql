-- ====================================================
-- 121 - Customer tax-id uniqueness  (customer register · step 0א)
-- ====================================================
-- ⛔ DEFERRED 2026-08-10. NOT MERGED, NOT RUN. Tax-id uniqueness matters for
-- going to market, not for the רשם בתי התוכנה submission. Resumes after it.
--
-- The register itself does NOT wait for this file. The header below says step 2
-- needs this index to name in an ON CONFLICT clause; that turned out to be the
-- wrong mechanism anyway. ON CONFLICT could only ever have covered match key 1
-- (tax id) — keys 2 (email) and 3 (exact name) have no unique index and never
-- will, since a unique index on name was rejected for imposing a business
-- limitation to close a rare race. resolve_customer therefore serialises all
-- three keys with pg_advisory_xact_lock, which needs no index and covers them
-- uniformly. See scripts/124.
--
-- When this file does land, the index becomes a second line of defence behind
-- that lock rather than a prerequisite for it.
-- ====================================================
-- Prerequisite for the customer register. Not the register itself: this file adds
-- no column, fills nothing in, and changes no behaviour. It only makes it
-- impossible for one company to hold two customers with the same tax id.
--
-- ── WHY IT COMES FIRST ──────────────────────────────────────────────────────
-- Step 2 of the register resolves a customer during issuance with
-- `insert ... on conflict do nothing` followed by a re-select. That is the only
-- form that is safe against two concurrent issuances for the same buyer, and it
-- needs a unique index to name in the ON CONFLICT clause. Without this file,
-- step 2 has nothing to infer and falls back to read-then-write — which is
-- exactly the race in initializeSequence that the register must not repeat.
--
-- ── WHAT IT DELIBERATELY DOES NOT DO: NO CHECKSUM ───────────────────────────
-- public.is_valid_israeli_id (scripts/050:15) exists and is enforced on
-- public.companies.registration_number by a trigger (050:83). It is NOT applied
-- here, by decision: the VOW/Mioshy path issues to buyers who are not
-- necessarily Israeli, and a database constraint that rejects a buyer breaks
-- issuance at the point of sale. Formal validation of a customer tax id belongs
-- in the form, as a warning. See also the latent bug noted at the bottom.
--
-- ── THE CANONICAL FORM, AND WHY IT IS NOT THE SAME AS 122's ─────────────────
-- Uniqueness has to be over a canonical value, or `515-960-508` and `515960508`
-- are two customers and the register duplicates the same buyer.
--
--   here (customers):  strip whitespace and hyphens. Nothing else.
--   in 122 (companies): strip, then left-pad to 9 digits.
--
-- The difference is deliberate, not an oversight. A company's number is an
-- Israeli dealer number: the checksum trigger caps it at 9 digits and interprets
-- it left-padded, so padding is part of its identity. A customer's tax id may be
-- a foreign VAT number of any shape, and padding a 5-character foreign id to 9
-- would assert a numeric meaning it does not have.
--
-- Neither function changes case and neither strips anything else. No spelling
-- normalisation, no fuzzy matching.
--
-- ── WHAT STEP 2 MUST COPY VERBATIM ──────────────────────────────────────────
-- The match query and the ON CONFLICT clause must use the SAME expression as the
-- index, or neither will use it and the conflict will never be inferred:
--
--   match:
--     where company_id = $1
--       and public.normalize_customer_tax_id(tax_id)
--             = public.normalize_customer_tax_id($2)
--
--   create:
--     on conflict (company_id, public.normalize_customer_tax_id(tax_id))
--       where tax_id is not null and btrim(tax_id) <> ''
--     do nothing
--
-- ── CAVEAT ON EXPRESSION INDEXES ────────────────────────────────────────────
-- An index over a function stores values computed by the definition that existed
-- when it was built. `create or replace` on normalize_customer_tax_id does NOT
-- rebuild it — the index silently keeps stale keys and uniqueness stops holding.
-- If that function is ever changed, REINDEX customers_tax_id_unique in the same
-- migration. This is why the function is marked immutable and why its body is
-- written once, here, and not shared with 122.
--
-- ── MEASURED IN PRODUCTION 2026-08-10, BEFORE WRITING THIS ──────────────────
-- public.customers holds 0 rows (it was empty before the reset, and the reset's
-- cascade from 11 deleted companies could only reduce it). So every precondition
-- below passes trivially today. They are in the file anyway: a migration that is
-- only correct against one snapshot is not a migration.
--
-- ── THE SIMPLER ALTERNATIVE, IF THE EXPRESSION IS UNWANTED ──────────────────
-- Replace the index below with
--   create unique index customers_tax_id_unique on public.customers (company_id, tax_id)
--     where tax_id is not null and btrim(tax_id) <> '';
-- and drop the function. It is one line shorter and needs no REINDEX discipline.
-- The cost is that `515-960-508` and `515960508` become two customers for the
-- same buyer, and step 2's match will not find the existing row. I recommend the
-- expression version; the choice is yours.
--
-- ── OUT OF SCOPE, ON PURPOSE ────────────────────────────────────────────────
-- idx_customers_tax_id (scripts/015:36) is a NON-unique index on the same two
-- columns and becomes redundant once this one exists. It is left in place: this
-- file does one thing, and dropping an index is a separate decision. On a table
-- this size it costs nothing.
-- ====================================================

begin;

-- ── 1. the canonical form ───────────────────────────────────────────────────
-- immutable: required for an expression index.
-- strict:    null in, null out, without executing the body.
--
-- The regex is a POSIX character class, not a backslash escape. `[[:space:]-]`
-- is unambiguous under standard_conforming_strings; the hyphen is last in the
-- bracket and is therefore literal. See the note on scripts/050 at the bottom
-- of this file for why that matters.
create or replace function public.normalize_customer_tax_id(p_value text)
returns text
language sql
immutable
strict
as $$
  select case when v = '' then null else v end
  from (select regexp_replace(p_value, '[[:space:]-]', '', 'g') as v) s
$$;

comment on function public.normalize_customer_tax_id(text) is
  'Canonical form of customers.tax_id for uniqueness and matching: whitespace and '
  'hyphens removed, empty becomes null. No padding (unlike '
  'normalize_registration_number) because a customer tax id may be a foreign VAT '
  'number. Changing this body requires REINDEX customers_tax_id_unique.';

-- ── 2. preconditions ────────────────────────────────────────────────────────
-- Both would be caught by the constraint and the index on their own. They are
-- checked first so the failure message names the offending rows, instead of
-- reporting a violation and leaving the diagnosis to a second query.
do $$
declare
  v_blank integer;
  v_dupes integer;
  v_listing text;
begin
  select count(*) into v_blank
  from public.customers
  where tax_id is not null and btrim(tax_id) = '';

  if v_blank > 0 then
    -- The message is built with || rather than as a multi-line format string:
    -- PL/pgSQL's RAISE expects a single format literal, and relying on adjacent
    -- string-literal concatenation inside that grammar is not worth the risk in a
    -- file that runs against production. Same below and in scripts/122.
    raise exception '%',
      'REFUSING: ' || v_blank || ' customer(s) hold an empty-string tax_id.'
      || ' Decide whether they become null before this constraint is added —'
      || ' this file does not rewrite data.';
  end if;

  select count(*), string_agg(t, E'\n  ') into v_dupes, v_listing
  from (
    select format('company %s · tax_id %s · %s customers', company_id,
                  public.normalize_customer_tax_id(tax_id), count(*)) as t
    from public.customers
    where tax_id is not null and btrim(tax_id) <> ''
    group by company_id, public.normalize_customer_tax_id(tax_id)
    having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise exception '%',
      'REFUSING: ' || v_dupes || ' duplicate (company, tax_id) group(s) already exist.'
      || ' Merge them before adding the constraint:'
      || coalesce(E'\n  ' || v_listing, '');
  end if;

  raise notice 'preconditions passed: no blank tax ids, no duplicate (company, tax_id) groups';
end $$;

-- ── 3. an empty string is not a tax id ──────────────────────────────────────
-- The partial index below excludes '' from uniqueness, so without this a row
-- could carry '' and sit outside the constraint. The CRM insert already writes
-- `|| null` (app/dashboard/customers/actions.ts:119), but that is a convention
-- in one call site, not a rule. This makes it a rule.
alter table public.customers drop constraint if exists customers_tax_id_not_blank;
alter table public.customers
  add constraint customers_tax_id_not_blank
  check (tax_id is null or btrim(tax_id) <> '');

-- ── 4. the constraint ───────────────────────────────────────────────────────
-- Partial, so the many customers with no tax id do not collide with each other:
-- under a plain unique index they would not either (nulls never conflict), but
-- being explicit about the predicate is what lets ON CONFLICT name it in step 2.
--
-- Built non-concurrently, inside the transaction. That takes a lock that blocks
-- writes to public.customers for the duration; the table holds 0 rows, so the
-- duration is negligible. If it is ever run against a large customers table,
-- move it out of the transaction and use CREATE UNIQUE INDEX CONCURRENTLY.
drop index if exists public.customers_tax_id_unique;
create unique index customers_tax_id_unique
  on public.customers (company_id, public.normalize_customer_tax_id(tax_id))
  where tax_id is not null and btrim(tax_id) <> '';

comment on index public.customers_tax_id_unique is
  'One customer per (company, canonical tax id). Named by ON CONFLICT in the '
  'issuance-time customer resolver. Rebuild with REINDEX if '
  'normalize_customer_tax_id changes.';

commit;

-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- Expected: one row for customers_tax_id_unique with indisunique = true, and one
-- row for customers_tax_id_not_blank.
select i.relname as index_name, x.indisunique, pg_get_indexdef(x.indexrelid) as definition
from pg_index x
join pg_class i on i.oid = x.indexrelid
join pg_class t on t.oid = x.indrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public' and t.relname = 'customers'
order by i.relname;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.customers'::regclass and contype = 'c'
order by conname;

-- The canonical form, on the values that exist. Two rows in the same company
-- sharing a canonical value would have failed the precondition above.
select company_id,
       tax_id,
       public.normalize_customer_tax_id(tax_id) as canonical
from public.customers
where tax_id is not null
order by company_id, canonical;

-- ── A LATENT BUG IN scripts/050, REPORTED NOT FIXED ─────────────────────────
-- Both is_valid_israeli_id (050:35) and
-- enforce_company_registration_number_checksum (050:72) normalise with
--
--     regexp_replace(trim(v), '[\\s-]+', '', 'g')
--
-- Under standard_conforming_strings — on in PostgreSQL since 9.1 and on in
-- Supabase — that literal is the regex text `[\\s-]+`, whose bracket expression
-- is the set { backslash, s, hyphen }. It removes the LETTER "s" and backslashes,
-- and does not remove whitespace, which is the opposite of what the comment
-- above it claims. An internal space therefore survives normalisation and is
-- then rejected by the digits-only test as INVALID_TAX_ID.
--
-- It has never bitten, because every live signup path normalises in TypeScript
-- first — lib/validation/israeli-id.ts:14, `replace(/[\s-]/g, "")`, which is
-- correct — so the values reaching the trigger are already digits-only. The bug
-- is latent, not active.
--
-- It is NOT fixed here. Repairing it changes what the production trigger accepts
-- (' 515 960 508' would start passing), which is a behaviour change on a
-- validation path and does not belong in a migration whose subject is customer
-- uniqueness. A FOLLOWUPS entry for it is proposed but NOT yet written — this
-- comment is the only record of it so far.

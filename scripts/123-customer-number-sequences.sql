-- ====================================================
-- 123 - customer_number that cannot be empty  (customer register · step 1)
-- ====================================================
-- Field 1225 of the BKMV file, מפתח הלקוח אצל המוכר, X(15), mandatory-conditional
-- for every document code 100-710 — which is all four this system issues. It reads
-- customers.customer_number. Without a number the field is blank even after the
-- register fills, so this file is a prerequisite for the register being worth
-- anything, not a nicety attached to it.
--
-- 15 characters is the field width, so a plain decimal counter fits with room to
-- spare. No prefix and no zero-padding: a bookkeeper has to be able to read it.
--
-- ── THE RACE THIS MUST NOT REPEAT ───────────────────────────────────────────
-- initializeSequence reads the current value in one PostgREST call, computes the
-- next in TypeScript, and writes it in a second. Two round trips, no lock, no
-- atomicity: two concurrent callers read the same value and both write it. It
-- survives only because document_sequences has a unique key that makes the second
-- writer fail loudly instead of duplicating.
--
-- The rule taken from that: THE NUMBER IS PRODUCED INSIDE THE SAME STATEMENT THAT
-- INSERTS THE ROW, AND UNIQUENESS IS ENFORCED BY THE DATABASE. Here that is a
-- single INSERT ... ON CONFLICT DO UPDATE ... RETURNING against a per-company
-- counter row. One statement, a row lock held to the end of the transaction, no
-- read-then-write anywhere, and no PostgREST round trip in the middle.
-- Serialisation is per company, so two companies never wait on each other.
--
-- ── WHY NOT A COLUMN DEFAULT ────────────────────────────────────────────────
-- A DEFAULT expression cannot see other columns of the row being inserted, so it
-- cannot see company_id. A per-company number is therefore not expressible as a
-- default; it needs a BEFORE INSERT trigger. (A global nextval() WOULD work as a
-- default and is completely race-free, but the number appears in the regulatory
-- file and a key that jumps within one company's register reads as wrong to a
-- person. Rejected for that reason, not a technical one.)
--
-- ── WHY NOT document_sequences ──────────────────────────────────────────────
-- That table is frozen: no update, no delete, no insert. It is also the wrong
-- shape — it is keyed by (company, document_type) and carries a lock flag and a
-- starting number that mean nothing here. A separate counter table.
--
-- ── A MANUAL NUMBER STAYS POSSIBLE ──────────────────────────────────────────
-- The trigger fills customer_number only when it arrives null or blank. A caller
-- that supplies one keeps it, and the pre-existing unique(company_id,
-- customer_number) constraint (scripts/006:64, scripts/014:48) rejects a
-- collision. The CRM insert (app/dashboard/customers/actions.ts:117) does not
-- send the column, so it gets a generated number with no change to the form.
--
-- ── MEASURED IN PRODUCTION 2026-08-10 ───────────────────────────────────────
-- public.customers: 0 rows. public.companies: 1 row. So the backfill and the seed
-- in sections 4 and 5 are no-ops today. They are in the file because a migration
-- that is only correct against one snapshot is not a migration, and because the
-- ORDER of those two sections is the part that is easy to get wrong.
--
-- ── ORDER, AND WHY IT IS THIS ORDER ─────────────────────────────────────────
--   1. the counter table
--   2. the trigger function and the trigger      ← must exist before any insert
--                                                  can satisfy the NOT NULL
--   3. permissions on the counter
--   4. backfill existing null/blank numbers      ← an UPDATE, so it fires no
--                                                  BEFORE INSERT trigger and
--                                                  consumes no counter values
--   5. seed the counter from the resulting max   ← AFTER the backfill, or the
--                                                  seed would hand out numbers
--                                                  the backfill already used
--   6. NOT NULL and a not-blank check            ← last: NOT NULL on a table with
--                                                  nulls fails
--
-- ── THE ONE DATA-WRITING STATEMENT IN THIS FILE ─────────────────────────────
-- Section 4 is an UPDATE on public.customers. It touches only rows whose
-- customer_number is null or blank, it writes only that column, and it reports the
-- row count. On the current database it updates 0 rows. Everything else here is
-- DDL. There is no DELETE anywhere in this file.
-- ====================================================

begin;

-- ── 1. the counter ──────────────────────────────────────────────────────────
-- next_number is the value the NEXT customer of this company will receive. One
-- row per company, created on first use by the trigger — no separate provisioning
-- step that could be missed for a new company.
create table if not exists public.customer_number_sequences (
  company_id  uuid primary key references public.companies(id) on delete cascade,
  next_number bigint not null default 1 check (next_number >= 1),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.customer_number_sequences is
  'Per-company allocator for customers.customer_number (BKMV field 1225). '
  'next_number is the value the next customer will receive. Written only by '
  'public.assign_customer_number(); never read or written by the application.';

-- ── 2. the trigger ──────────────────────────────────────────────────────────
-- SECURITY DEFINER, because the counter table denies all direct access (section 3)
-- and a user-session insert into public.customers must still be able to allocate.
-- search_path is pinned: an unpinned definer function is a privilege-escalation
-- vector, which is what scripts/117 and scripts/120 exist to close.
--
-- The allocation is one statement:
--   · no existing row  -> INSERT (company, 2), so RETURNING next_number - 1 = 1
--   · existing row     -> UPDATE next_number = old + 1, so RETURNING it - 1 = old
-- Both branches return the value being allocated. ON CONFLICT DO UPDATE takes a
-- row lock on the conflicting row, so a second concurrent insert for the same
-- company waits and then reads the incremented value. There is no lost update and
-- no window between a read and a write, because there is no read.
create or replace function public.assign_customer_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allocated bigint;
begin
  -- A number supplied by the caller is respected. Uniqueness is then the job of
  -- unique(company_id, customer_number), which already exists.
  if new.customer_number is not null and btrim(new.customer_number) <> '' then
    return new;
  end if;

  if new.company_id is null then
    raise exception 'assign_customer_number: company_id is null, cannot allocate a customer number';
  end if;

  insert into public.customer_number_sequences as s (company_id, next_number)
  values (new.company_id, 2)
  on conflict (company_id) do update
    set next_number = s.next_number + 1,
        updated_at  = now()
  returning s.next_number - 1 into v_allocated;

  new.customer_number := v_allocated::text;
  return new;
end;
$$;

comment on function public.assign_customer_number() is
  'BEFORE INSERT on public.customers: fills customer_number from '
  'customer_number_sequences when the caller left it blank. Allocation is a single '
  'INSERT ... ON CONFLICT DO UPDATE ... RETURNING — deliberately not a '
  'read-then-write, which is the race in initializeSequence.';

drop trigger if exists trigger_assign_customer_number on public.customers;
create trigger trigger_assign_customer_number
before insert on public.customers
for each row
execute function public.assign_customer_number();

-- ── 3. the counter is not reachable by a tenant client ──────────────────────
-- CORRECTION, 2026-08-10, after this file had already been applied: an earlier
-- version of this comment claimed the table is denied to "every non-superuser
-- client, including service_role's own reads". That is WRONG and the claim was
-- never checked. Verified against production: a service_role client CAN select
-- from public.customer_number_sequences.
--
-- The reason is in the statement below — it revokes from public, anon and
-- authenticated, and NOT from service_role, which keeps the broad grant Supabase
-- gives it and bypasses RLS regardless. The table is also listed in PostgREST's
-- OpenAPI document, so it is visible over the API to a service-role caller.
--
-- What the statement DOES achieve, which is what matters: no tenant — no browser
-- session, no anon caller — can read or move the counter. Only the definer trigger
-- and the master key can. service_role reaching it is not a hole worth closing;
-- overstating the protection in a comment is worth correcting, because the comment
-- is what the next reader will trust.
--
-- Following the grant style of scripts/117:65-72.
alter table public.customer_number_sequences enable row level security;
revoke all on table public.customer_number_sequences from public, anon, authenticated;

-- ── 4. backfill ─────────────────────────────────────────────────────────────
-- Existing customers with no number get one, ordered by creation so the numbering
-- follows the order they were added. Starts above the highest purely-numeric
-- number already present per company, so a manually assigned number is never
-- reissued. A non-numeric existing number is ignored for the purpose of finding
-- the maximum — it cannot be compared — and is left untouched.
do $$
declare
  v_updated integer;
begin
  with base as (
    select company_id,
           coalesce(max(case when customer_number ~ '^[0-9]+$'
                             then customer_number::bigint end), 0) as high
    from public.customers
    group by company_id
  ),
  numbered as (
    select c.id,
           b.high + row_number() over (partition by c.company_id
                                       order by c.created_at, c.id) as n
    from public.customers c
    join base b on b.company_id = c.company_id
    where c.customer_number is null or btrim(c.customer_number) = ''
  )
  update public.customers c
     set customer_number = n.n::text
    from numbered n
   where n.id = c.id;

  get diagnostics v_updated = row_count;
  raise notice 'backfilled customer_number on % row(s)', v_updated;
end $$;

-- ── 5. seed the counter ─────────────────────────────────────────────────────
-- After the backfill, so it accounts for the numbers it just handed out. GREATEST
-- rather than a plain assignment: if a counter row already exists and is ahead of
-- the data — because numbers were allocated and their customers later deleted —
-- it must not be moved backwards, or those numbers would be reissued.
insert into public.customer_number_sequences (company_id, next_number)
select company_id,
       coalesce(max(case when customer_number ~ '^[0-9]+$'
                         then customer_number::bigint end), 0) + 1
from public.customers
group by company_id
on conflict (company_id) do update
  set next_number = greatest(public.customer_number_sequences.next_number,
                             excluded.next_number),
      updated_at  = now();

-- ── 6. the constraints ──────────────────────────────────────────────────────
-- Blank is excluded as well as null. Without the check, '' would satisfy NOT NULL
-- and sit outside unique(company_id, customer_number) in the same way a null does
-- — many blank numbers would coexist and field 1225 would still come out empty.
alter table public.customers drop constraint if exists customers_customer_number_not_blank;
alter table public.customers
  add constraint customers_customer_number_not_blank
  check (btrim(customer_number) <> '');

alter table public.customers alter column customer_number set not null;

commit;

-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- Expected: customer_number is_nullable = NO.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'customers'
  and column_name = 'customer_number';

-- Expected: trigger_assign_customer_number, BEFORE INSERT, FOR EACH ROW.
select tgname, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.customers'::regclass and not tgisinternal
order by tgname;

-- Expected: customers_customer_number_not_blank present.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.customers'::regclass and contype = 'c'
order by conname;

-- Expected: rowsecurity = true, and 0 policies.
select relrowsecurity as rls_enabled,
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'customer_number_sequences') as policy_count
from pg_class where oid = 'public.customer_number_sequences'::regclass;

-- Expected today: 0 rows (no customers, so nothing has allocated yet).
select company_id, next_number, created_at, updated_at
from public.customer_number_sequences
order by company_id;

-- Expected: no row with a null or blank number, and no duplicate within a company.
select count(*) as blank_or_null_numbers
from public.customers
where customer_number is null or btrim(customer_number) = '';

select company_id, customer_number, count(*)
from public.customers
group by company_id, customer_number
having count(*) > 1;

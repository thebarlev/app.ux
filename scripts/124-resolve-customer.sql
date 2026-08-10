-- ====================================================
-- 124 - resolve_customer()  (customer register · step 2, database half)
-- ====================================================
-- One definition of "which customer is this document for", in the database, so the
-- four TypeScript paths and the three SECURITY DEFINER SQL paths cannot drift
-- apart. The SQL issuance functions call it directly; the TypeScript paths call it
-- by RPC. Two implementations of one rule is the single most likely thing to
-- diverge, and there are seven callers.
--
-- This file adds the function ONLY. It wires nothing up: no issuance path calls it
-- yet, and documents.customer_id is still written as null everywhere. Installing it
-- changes no behaviour. The wiring is the next change, and the enforcement check on
-- documents (step 4) comes after that, once a document has been observed carrying
-- customer_id through each of the seven paths in production.
--
-- ── THE RULE, AS DECIDED ────────────────────────────────────────────────────
--   1. tax_id not empty                          -> match, else create
--   2. else email not empty                      -> match, else create
--   3. else exact name, and only if not a
--      placeholder name                          -> match, else create
--   4. else                                      -> always create a new row
--
-- Rule 4 is the substantive one. A buyer who cannot be identified gets a row of
-- their own, not a shared row. A duplicate is a defect that can be cleaned up;
-- gluing two people into one customer is a false record, and it would be false in
-- a file submitted to the Tax Authority.
--
-- No fuzzy matching. No spelling normalisation. Names are compared exactly, after
-- trimming, with no case folding — Hebrew has no case and folding Latin names would
-- be a normalisation rule nobody asked for.
--
-- ── THE PLACEHOLDER NAMES ARE NOT A GUESS ───────────────────────────────────
--   'Customer'  lib/billing/vow-billing/providers/internal-provider.ts:148 —
--               the VOW/Mioshy path's last-resort literal when there is no name
--               and no email.
--   'לקוח'      scripts/068:420 — `if v_company_name is null then
--               v_company_name := 'לקוח'; end if;` in the renewal function.
--   ''          a name that is present but empty.
--
-- Three entries, each traced to a line that produces it. The list is not extended
-- by guessing: a name wrongly called a placeholder stops matching and silently
-- multiplies rows, which is the failure this list exists to prevent.
--
-- Without this guard, rule 3 would match every unnamed VOW buyer to the same
-- 'Customer' row and glue unrelated people together.
--
-- ── WHY AN ADVISORY LOCK AND NOT ON CONFLICT ────────────────────────────────
-- Match-then-create is a read followed by a write. Two concurrent issuances for the
-- same buyer both miss the match and both create.
--
-- ON CONFLICT was the original plan, and it was the wrong mechanism: it needs a
-- unique index to infer, and only rule 1 could ever have had one. Rule 2 has no
-- unique index on email, and rule 3's unique index on name was rejected — it would
-- make two customers with the same name and no tax id impossible, which is a
-- legitimate business situation, and imposing a business limitation to close a rare
-- race is the wrong trade.
--
-- pg_advisory_xact_lock covers all three keys with one mechanism and needs no
-- index. It is taken on (company_id, key) before the match, and released at COMMIT:
-- one caller creates, the other waits and then finds the row. Rule 4 takes no lock,
-- because it is not trying to find anything.
--
-- The lock key is a 64-bit hash. Two different buyers whose keys collide would
-- serialise against each other for a moment; they would never be confused for one
-- another, because the match after the lock is still by the real key. A collision
-- costs a wait, not correctness.
--
-- Because the lock is transaction-scoped, it protects a caller for as long as that
-- caller's transaction lasts. Called by RPC from TypeScript that is one statement;
-- called from inside an issuance function it lasts until that function's COMMIT,
-- which is strictly better.
--
-- ── SECURITY INVOKER, DELIBERATELY ──────────────────────────────────────────
-- Not SECURITY DEFINER. Under INVOKER the existing RLS policies on public.customers
-- do the tenancy enforcement for free and identically for all three calling
-- contexts:
--   · a user session   — customers_select and customers_insert restrict to
--                        company_id in user_company_ids(), so a caller cannot read
--                        or create a customer in someone else's company.
--   · service_role     — bypasses RLS, so the VOW path works.
--   · inside a DEFINER issuance function — runs as the table owner, so RLS does
--                        not apply.
-- A DEFINER version would have to re-implement the tenant check by hand, and
-- scripts/117 and scripts/120 exist because definer functions here have been a
-- problem. search_path is pinned anyway.
--
-- ── THE ONE UPDATE IT MAKES, AND THE FOUR IT DOES NOT ───────────────────────
-- A matched customer gets its email FILLED IN when the column is null and the caller
-- supplied one. Nothing else: not tax_id, not name, not address, not phone.
--
-- The line between them is whether the write can destroy anything. Filling a null
-- cannot: there was no value to lose, and the row becomes findable by rule 2 next
-- time, which is the difference between one customer and several for the same buyer.
-- Overwriting a value that is already there can, and would do it silently from
-- inside an issuance — a customer's email quietly replaced because one document was
-- issued with a different address for them.
--
-- So the update is `set email = v_email where id = v_id and email is null`. The
-- predicate is repeated in the statement rather than checked beforehand: between a
-- check and a write, another transaction can fill the same column, and then the
-- write would be exactly the overwrite this rule forbids. With the predicate in the
-- statement, the second writer updates 0 rows and the first value stands.
--
-- Not done for tax_id in particular, even though the same "filling a null" argument
-- would seem to apply: tax_id is a match key. Filling it changes which rule finds
-- this row in future and can make two existing customers collide on a key that had
-- distinguished them. Email is only ever a key for rows that had none.
--
-- ── COUPLING TO scripts/121, WHICH IS DEFERRED ──────────────────────────────
-- Rule 1 compares tax ids as exact trimmed strings, not canonicalised, because
-- normalize_customer_tax_id lives in scripts/121 and 121 is deferred until after
-- the רשם submission. Measured: all 22 tax ids across the 154 pre-reset documents
-- were the same value and already digits-only, so canonicalisation would change
-- nothing about the real data today.
--
-- WHEN 121 LANDS, BOTH SIDES MOVE TOGETHER: the match below and the unique index
-- there must use the same expression, or the index constrains a value the match
-- never looks up. It is one line, marked ⚠ 121 in section 2.
--
-- ── MEASURED AGAINST THE REAL DATA, BEFORE WRITING THIS ─────────────────────
-- Replaying the rule over the 129 final documents that existed before the reset:
--
--   rule 1 (tax id)   22 documents
--   rule 2 (email)    40
--   rule 3 (name)     67
--   rule 4 (new)       0
--   → 83 customers for 129 documents
--
-- For contrast, the name-derived key that was measured and rejected earlier
-- produced 64 single-document keys out of 75 — a key per document in all but name.
-- 83 for 129 is a register. Rule 4 never fires on a final document in the real
-- data; it fired on exactly one draft.
-- ====================================================

begin;

-- ── 1. the placeholder list, in one place ───────────────────────────────────
-- A function rather than a literal inside resolve_customer, so the list can be
-- read, tested and reviewed on its own, and so a future caller cannot apply a
-- different list.
create or replace function public.is_placeholder_customer_name(p_name text)
returns boolean
language sql
immutable
as $$
  select btrim(coalesce(p_name, '')) in ('', 'Customer', 'לקוח')
$$;

comment on function public.is_placeholder_customer_name(text) is
  'The three names that must never be used as a match key: '''', ''Customer'' '
  '(internal-provider.ts:148) and ''לקוח'' (scripts/068:420). Each traced to the '
  'line that produces it. Do not extend by guessing — a real name wrongly listed '
  'here stops matching and multiplies register rows.';

-- ── 2. the resolver ─────────────────────────────────────────────────────────
create or replace function public.resolve_customer(
  p_company_id uuid,
  p_name       text,
  p_tax_id     text,
  p_email      text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tax   text := nullif(btrim(coalesce(p_tax_id, '')), '');
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_name  text := nullif(btrim(coalesce(p_name,  '')), '');
  v_rule  integer;
  v_key   text;
  v_id    uuid;
begin
  if p_company_id is null then
    raise exception 'resolve_customer: p_company_id is required';
  end if;

  -- Turns the opaque "new row violates row-level security policy" that a
  -- cross-tenant call would otherwise produce into a named error. A no-op for
  -- service_role and for calls from inside a definer function, where auth.uid()
  -- is null. Remove these four lines if the dependency on user_company_ids() is
  -- unwanted; RLS still blocks the call either way.
  if auth.uid() is not null
     and p_company_id not in (select public.user_company_ids()) then
    raise exception 'resolve_customer: company % is not accessible to the caller', p_company_id;
  end if;

  -- ── pick the rule ─────────────────────────────────────────────────────────
  if v_tax is not null then
    v_rule := 1; v_key := 'tax:' || v_tax;
  elsif v_email is not null then
    v_rule := 2; v_key := 'email:' || v_email;
  elsif v_name is not null and not public.is_placeholder_customer_name(v_name) then
    v_rule := 3; v_key := 'name:' || v_name;
  else
    v_rule := 4; v_key := null;
  end if;

  -- ── rule 4: unidentifiable buyer, always a new row ────────────────────────
  -- No lock and no match attempt. name is NOT NULL with char_length > 0
  -- (scripts/014:72), so a value is required; the placeholder itself is written
  -- rather than something invented. A row created this way carries a placeholder
  -- name and is therefore invisible to rule 3 forever, which is correct — it was
  -- never identifiable in the first place.
  if v_rule = 4 then
    insert into public.customers (company_id, name, tax_id, email)
    values (p_company_id, coalesce(v_name, 'לקוח'), v_tax, v_email)
    returning id into v_id;
    return v_id;
  end if;

  -- ── serialise this (company, key) for the rest of the transaction ─────────
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || '|' || v_key, 0));

  -- ── match ─────────────────────────────────────────────────────────────────
  -- order by created_at, id limit 1: deterministic. If duplicates ever exist —
  -- and rules 2 and 3 have no unique index preventing them — every caller picks
  -- the same one, so the duplicate is a row to clean up rather than a moving
  -- target. Ties on created_at are broken by id, which is unique.
  if v_rule = 1 then
    -- ⚠ 121: when scripts/121 lands, both sides of this comparison become
    -- public.normalize_customer_tax_id(...) and the unique index there uses the
    -- same expression. Changing one without the other breaks the pairing.
    select id into v_id
    from public.customers
    where company_id = p_company_id
      and btrim(coalesce(tax_id, '')) = v_tax
    order by created_at, id
    limit 1;

  elsif v_rule = 2 then
    select id into v_id
    from public.customers
    where company_id = p_company_id
      and lower(btrim(coalesce(email, ''))) = v_email
    order by created_at, id
    limit 1;

  else
    -- Exact, trimmed, case-sensitive. No normalisation.
    select id into v_id
    from public.customers
    where company_id = p_company_id
      and btrim(coalesce(name, '')) = v_name
    order by created_at, id
    limit 1;
  end if;

  if v_id is not null then
    -- Fill a null email, never overwrite one. `email is null` lives in the
    -- statement, not in an `if` above it: a concurrent caller could fill the same
    -- column between a check and a write, and this must lose that race rather than
    -- win it. Zero rows updated is the correct outcome there.
    --
    -- Only reachable under rules 1 and 3 — under rule 2 the row was found BY its
    -- email, so it cannot be null. Written unconditionally anyway, because a rule
    -- ordering that changes later must not silently turn this into a no-op.
    -- updated_at is not set here: customers_updated_at_trigger (scripts/014:114)
    -- is BEFORE UPDATE on this table and sets it. Setting it again would work and
    -- would read as though that trigger did not exist.
    if v_email is not null then
      update public.customers
         set email = v_email
       where id = v_id
         and email is null;
    end if;

    -- Nothing else is touched: not tax_id, not name, not address, not phone.
    return v_id;
  end if;

  -- ── create ────────────────────────────────────────────────────────────────
  -- customer_number is left out: trigger_assign_customer_number (scripts/123)
  -- fills it inside this same INSERT.
  insert into public.customers (company_id, name, tax_id, email)
  values (p_company_id, coalesce(v_name, 'לקוח'), v_tax, v_email)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.resolve_customer(uuid, text, text, text) is
  'The single definition of which customer a document belongs to. Match order: '
  'tax_id, then email, then exact non-placeholder name; otherwise always create. '
  'Serialised per (company, key) with pg_advisory_xact_lock. On a matched row it '
  'fills a null email and changes nothing else — it never overwrites a value. '
  'Called by RPC from the TypeScript issuance paths and directly by the SECURITY '
  'DEFINER issuance functions — do not fork it.';

-- ── 3. grants ───────────────────────────────────────────────────────────────
-- authenticated: the form path calls it by RPC from a user session, where RLS
-- confines it to the caller's own company.
-- service_role: the VOW path and the three issuance functions' callers.
-- anon: never.
-- Style follows scripts/117:65-72.
revoke all on function public.resolve_customer(uuid, text, text, text) from public, anon;
grant execute on function public.resolve_customer(uuid, text, text, text) to authenticated, service_role;

revoke all on function public.is_placeholder_customer_name(text) from public, anon;
grant execute on function public.is_placeholder_customer_name(text) to authenticated, service_role;

commit;

-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- Expected: prosecdef = false (INVOKER) for resolve_customer, and a pinned
-- search_path in proconfig.
select p.oid::regprocedure as signature,
       p.prosecdef         as security_definer,
       p.provolatile,
       p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('resolve_customer', 'is_placeholder_customer_name')
order by p.proname;

-- Expected: EXECUTE for authenticated and service_role; nothing for anon or PUBLIC.
select p.oid::regprocedure as signature, p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('resolve_customer', 'is_placeholder_customer_name')
order by p.proname;

-- The placeholder list, read back from the function rather than from this comment.
select public.is_placeholder_customer_name('')          as blank_is_placeholder,
       public.is_placeholder_customer_name('Customer')  as customer_is_placeholder,
       public.is_placeholder_customer_name('לקוח')      as lakoach_is_placeholder,
       public.is_placeholder_customer_name('בוגו מדיה') as real_name_is_not;

-- Expected: 0. Nothing calls resolve_customer yet, so no customer has been created
-- by it and every document still carries a null customer_id.
select count(*) as customers_total from public.customers;
select count(*) as documents_with_customer_id from public.documents where customer_id is not null;

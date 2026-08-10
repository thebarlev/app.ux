-- ====================================================
-- 124-VERIFY - exercise the four rules, then throw the rows away
-- ====================================================
-- Run AFTER scripts/123 and scripts/124 are applied. It proves the rule behaves as
-- decided instead of asserting that it does.
--
-- ⚠️ THIS FILE WRITES ROWS, AND THEN ROLLS BACK.
-- It creates customers through resolve_customer inside a single transaction that
-- ends in ROLLBACK. Nothing is committed: no customer survives, and the
-- customer_number counter is not advanced either, because the counter is an
-- ordinary table row and rolls back with everything else — there is no PostgreSQL
-- sequence object involved, which is exactly why the allocator was built as a table
-- and not as a nextval.
--
-- The last line is ROLLBACK. There is no COMMIT anywhere in this file. If any
-- assertion fails, the transaction aborts and nothing is committed either way — so
-- both the passing and the failing path leave the database untouched.
--
-- It runs against the real company, deliberately: a test against a fabricated
-- company id would not exercise the foreign key or the counter.
-- ====================================================

begin;

do $$
declare
  v_co     uuid;
  v_a      uuid; v_b uuid; v_c uuid; v_d uuid; v_e uuid; v_f uuid; v_g uuid; v_h uuid;
  v_num_a  text; v_num_b text;
  v_mail_a text; v_mail_b text;
  v_before integer;
  v_after  integer;
  v_nulls  integer;
  v_dupes  integer;
begin
  -- The surviving company, resolved rather than hardcoded, same as the reset files.
  select c.id into v_co
  from public.companies c
  join public.company_members m on m.company_id = c.id
  join auth.users u on u.id = m.user_id
  where lower(u.email) = 'itzikbab@gmail.com';

  if v_co is null then
    raise exception 'could not resolve a company from itzikbab@gmail.com — nothing to test against';
  end if;

  select count(*) into v_before from public.customers;
  raise notice 'starting with % customer(s) for company %', v_before, v_co;

  -- ── RULE 1 · tax id wins, and a different name does not create a second row ──
  v_a := public.resolve_customer(v_co, 'שם ראשון',  '032834558', null);
  v_b := public.resolve_customer(v_co, 'שם אחר',    '032834558', 'other@example.com');
  if v_a is distinct from v_b then
    raise exception 'RULE 1 FAILED: same tax id produced two customers (% and %)', v_a, v_b;
  end if;
  raise notice 'rule 1 ok: tax id matched across a different name AND a different email';

  -- Trimming, but nothing more. A padded tax id is the same tax id.
  v_c := public.resolve_customer(v_co, 'שם שלישי', '  032834558  ', null);
  if v_c is distinct from v_a then
    raise exception 'RULE 1 FAILED: a whitespace-padded tax id produced a second customer';
  end if;

  -- ── RULE 2 · email, when there is no tax id ─────────────────────────────────
  v_d := public.resolve_customer(v_co, 'קונה בדוא"ל', null, 'buyer@example.com');
  if v_d = v_a then
    raise exception 'RULE 2 FAILED: an email-only buyer collapsed into the tax-id customer';
  end if;

  v_e := public.resolve_customer(v_co, 'שם אחר לגמרי', null, 'BUYER@EXAMPLE.COM');
  if v_e is distinct from v_d then
    raise exception 'RULE 2 FAILED: the same email in different case produced two customers';
  end if;
  raise notice 'rule 2 ok: email matched case-insensitively, and did not collide with rule 1';

  -- A tax id present alongside an email must take precedence over the email.
  v_f := public.resolve_customer(v_co, 'שם', '032834558', 'buyer@example.com');
  if v_f is distinct from v_a then
    raise exception 'PRECEDENCE FAILED: tax id did not win over a matching email (got %, expected %)', v_f, v_a;
  end if;
  raise notice 'precedence ok: rule 1 beats rule 2 when both keys are present';

  -- ── RULE 3 · exact name, when there is neither tax id nor email ─────────────
  v_g := public.resolve_customer(v_co, 'חברה בשם מלא בע״מ', null, null);
  if public.resolve_customer(v_co, '  חברה בשם מלא בע״מ  ', null, null) is distinct from v_g then
    raise exception 'RULE 3 FAILED: the same name with surrounding whitespace produced two customers';
  end if;
  raise notice 'rule 3 ok: exact name matched after trimming';

  -- Case is NOT folded. Two spellings are two customers, by decision.
  if public.resolve_customer(v_co, 'Acme Ltd', null, null)
     = public.resolve_customer(v_co, 'ACME LTD', null, null) then
    raise exception 'RULE 3 FAILED: names were matched case-insensitively — no normalisation was authorised';
  end if;
  raise notice 'rule 3 ok: no case folding, no spelling normalisation';

  -- ── RULE 4 · a buyer who cannot be identified never shares a row ────────────
  -- This is the assertion the whole design turns on.
  if public.resolve_customer(v_co, 'Customer', null, null)
     = public.resolve_customer(v_co, 'Customer', null, null) then
    raise exception 'RULE 4 FAILED: two "Customer" buyers were glued into one row';
  end if;

  if public.resolve_customer(v_co, 'לקוח', null, null)
     = public.resolve_customer(v_co, 'לקוח', null, null) then
    raise exception 'RULE 4 FAILED: two "לקוח" buyers were glued into one row';
  end if;

  if public.resolve_customer(v_co, '', null, null)
     = public.resolve_customer(v_co, null, null, null) then
    raise exception 'RULE 4 FAILED: two nameless buyers were glued into one row';
  end if;
  raise notice 'rule 4 ok: placeholder and nameless buyers each got their own row';

  -- ── ENRICHMENT · a null email is filled, a present one is never touched ────
  -- On its own customer, with its own tax id. The rule-1 and precedence tests above
  -- already pass emails, so reusing v_a here would make these assertions depend on
  -- the order of everything before them.
  v_h := public.resolve_customer(v_co, 'לקוח לבדיקת העשרה', '999999999', null);

  select email into v_mail_a from public.customers where id = v_h;
  if v_mail_a is not null then
    raise exception 'TEST SETUP BROKEN: the enrichment customer was created with an email (%)', v_mail_a;
  end if;

  -- Test A: a null email is filled from the caller.
  if public.resolve_customer(v_co, 'שם אחר', '999999999', 'filled-in@example.com') is distinct from v_h then
    raise exception 'ENRICHMENT FAILED: resolving by tax id stopped matching once an email was supplied';
  end if;

  select email into v_mail_a from public.customers where id = v_h;
  if v_mail_a is distinct from 'filled-in@example.com' then
    raise exception 'ENRICHMENT FAILED: a null email was not filled in (got %)', coalesce(v_mail_a, '<null>');
  end if;
  raise notice 'enrichment ok: a null email was filled from the caller';

  -- Test B: a present email is never replaced.
  if public.resolve_customer(v_co, 'שם שלישי', '999999999', 'someone-else@example.com') is distinct from v_h then
    raise exception 'ENRICHMENT FAILED: the second resolve created a new customer';
  end if;

  select email into v_mail_b from public.customers where id = v_h;
  if v_mail_b is distinct from 'filled-in@example.com' then
    raise exception
      'ENRICHMENT FAILED: an existing email was OVERWRITTEN — was ''filled-in@example.com'', now %',
      coalesce(v_mail_b, '<null>');
  end if;
  raise notice 'enrichment ok: an existing email was left alone';

  -- And nothing else moved. Both calls above passed a different name; neither the
  -- name nor the tax id may have changed.
  if (select name from public.customers where id = v_h) is distinct from 'לקוח לבדיקת העשרה' then
    raise exception 'ENRICHMENT FAILED: name was rewritten on a matched customer';
  end if;
  if (select btrim(tax_id) from public.customers where id = v_h) is distinct from '999999999' then
    raise exception 'ENRICHMENT FAILED: tax_id was rewritten on a matched customer';
  end if;
  raise notice 'enrichment ok: name and tax_id untouched on a matched customer';

  -- And the enrichment did not leak onto the OTHER tax-id customer.
  if (select email from public.customers where id = v_a) = 'filled-in@example.com' then
    raise exception 'ENRICHMENT FAILED: the update was not scoped to one row';
  end if;

  -- ── scripts/123 · every row got a number, and no two share one ─────────────
  select count(*) into v_nulls from public.customers
  where customer_number is null or btrim(customer_number) = '';
  if v_nulls > 0 then
    raise exception 'NUMBERING FAILED: % customer(s) have no customer_number', v_nulls;
  end if;

  select count(*) into v_dupes from (
    select company_id, customer_number
    from public.customers
    group by company_id, customer_number
    having count(*) > 1
  ) d;
  if v_dupes > 0 then
    raise exception 'NUMBERING FAILED: % duplicate customer_number group(s)', v_dupes;
  end if;

  select customer_number into v_num_a from public.customers where id = v_a;
  select customer_number into v_num_b from public.customers where id = v_d;
  if v_num_a = v_num_b then
    raise exception 'NUMBERING FAILED: two customers share number %', v_num_a;
  end if;

  select count(*) into v_after from public.customers;
  raise notice 'numbering ok: % customer(s) now exist, all numbered, all distinct', v_after;
  raise notice 'created % customer(s) in this test — all of them are about to be rolled back', v_after - v_before;

  -- A manually supplied number must be respected rather than overwritten.
  insert into public.customers (company_id, name, customer_number)
  values (v_co, 'לקוח עם מספר ידני', 'MANUAL-1');
  if not exists (select 1 from public.customers
                 where company_id = v_co and customer_number = 'MANUAL-1') then
    raise exception 'NUMBERING FAILED: a caller-supplied customer_number was overwritten';
  end if;
  raise notice 'numbering ok: a caller-supplied number was left alone';

  raise notice 'ALL ASSERTIONS PASSED — rolling back';
end $$;

-- Everything above is discarded. This is the last statement in the file.
rollback;

-- ── AFTER THE ROLLBACK ──────────────────────────────────────────────────────
-- Expected: the same counts as before the test. On the current database, 0 and 0.
select count(*) as customers_after_rollback from public.customers;

-- Expected: 0 rows. The counter was never committed either.
select company_id, next_number from public.customer_number_sequences order by company_id;

-- =====================================================================
-- Reset · stage 2 of 5 — delete every company and user except two accounts
-- =====================================================================
-- SEPARATE TRANSACTION. Run only after stage 1 is committed and verified.
--
-- ── THE TWO ACCOUNTS THAT SURVIVE ───────────────────────────────────────────
--   support@uxellent.com   — system admin. auth user 174a0421-237d-4a4d-9a11-c3c43502d05a
--                            (public.system_admins). Owns no company.
--   itzikbab@gmail.com     — auth user d9186573-a7d5-46f9-90da-a05c4b762b47, owner of
--                            Bogo Media 4ae68334-15a0-4fa3-a9ba-fd77deccc95d, which is
--                            linked to Mioshy.
--
-- Both are protected by an explicit raise exception below: if either appears in the
-- delete set, the transaction fails. The company id is checked as well as the users.
--
-- The ids are NOT hardcoded into the guard. They are resolved from auth.users by
-- email at run time and the transaction aborts if either lookup comes back empty —
-- a protection keyed to an id that has changed protects nothing.
--
-- ── ⚠️ A NAME THAT DOES NOT MATCH ITS OWNER ─────────────────────────────────
-- public.companies for 4ae68334 still carries email = 'support@uxellent.com', while
-- its auth_user_id is itzikbab's. That is the state left by stage 1.5c, which moved
-- ownership without rewriting companies.email. So the surviving company is matched
-- BY ID, never by email — matching by email would keep the wrong row.
--
-- ── WHAT ELSE GOES, BY CASCADE FROM public.companies ────────────────────────
-- company_members (10 of 11 rows) · document_sequences (7 of 12 rows, for the
-- deleted companies — approved) · customers (0) · recipient_consents (0) ·
-- and every other company-scoped table.
--
-- KEPT: public.system_admins (support's row) and
--       public.unlimited_document_companies (its single row is 4ae68334).
--
-- ── be2ed4f5 IS DELETED, AND THAT HAS ONE CONSEQUENCE WORTH NAMING ──────────
-- be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed is the third "בוגו מדיה בע״מ" row — the husk
-- left by stage 1.5c: auth_user_id null, no membership, no documents. It carries
-- email = 'itzikbab@gmail.com'. Deleting it means no company row holds that address
-- afterwards, so the email-based attachment path recorded in FOLLOWUPS can no longer
-- match it. That path runs in bootstrap-company, which is currently blocked, so
-- nothing depends on it today — but it is a behaviour change, not a no-op.
--
-- ── auth.users IS NOT DELETED HERE ──────────────────────────────────────────
-- Deleting auth users belongs to the Supabase Admin API, not to SQL over public.
-- The ten ids to delete are printed at the end of this file. The two protected ids
-- must be excluded there too, and that exclusion is not enforced by this file.
-- =====================================================================

begin;

-- ── 1. snapshot the five sequence rows that must survive ────────────────────
create temporary table _seq_before on commit drop as
select * from public.document_sequences
where company_id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d';

-- ── 2. resolve the protected accounts, and refuse to proceed without them ───
create temporary table _protected on commit drop as
select id, lower(email) as email
from auth.users
where lower(email) in ('support@uxellent.com', 'itzikbab@gmail.com');

do $$
declare
  v_n integer;
  v_support uuid;
  v_itzik uuid;
begin
  select count(*) into v_n from _protected;
  if v_n <> 2 then
    raise exception
      'expected to resolve 2 protected accounts by email, resolved % — refusing to delete anything', v_n;
  end if;

  select id into v_support from _protected where email = 'support@uxellent.com';
  select id into v_itzik   from _protected where email = 'itzikbab@gmail.com';

  if v_support is null then raise exception 'support@uxellent.com not found in auth.users'; end if;
  if v_itzik   is null then raise exception 'itzikbab@gmail.com not found in auth.users'; end if;

  raise notice 'protected: support=% · itzikbab=%', v_support, v_itzik;
end $$;

-- ── 3. the delete set, and the guards on it ─────────────────────────────────
create temporary table _companies_to_delete on commit drop as
select id, company_name, email, auth_user_id
from public.companies
where id <> '4ae68334-15a0-4fa3-a9ba-fd77deccc95d';

do $$
declare
  v_n integer;
  v_bad integer;
  v_names text;
begin
  select count(*) into v_n from _companies_to_delete;
  if v_n <> 11 then
    raise exception 'expected 11 companies in the delete set, found % — the estate has changed', v_n;
  end if;

  -- Guard A: the surviving company must never be in the set.
  if exists (select 1 from _companies_to_delete
             where id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d') then
    raise exception 'REFUSING: Bogo Media 4ae68334 is in the delete set';
  end if;

  -- Guard B: no company owned by either protected account may be in the set.
  select count(*), string_agg(format('%s (%s)', c.id, c.company_name), ', ')
    into v_bad, v_names
  from _companies_to_delete c
  join _protected p on p.id = c.auth_user_id;

  if v_bad > 0 then
    raise exception 'REFUSING: % company(ies) owned by a protected account are in the delete set: %',
      v_bad, v_names;
  end if;

  -- Guard C: documents must already be gone. Stage 2 never deletes a document.
  select count(*) into v_n from public.documents;
  if v_n <> 0 then
    raise exception 'stage 1 has not completed: % document(s) still present', v_n;
  end if;

  raise notice 'guards passed: 11 companies to delete, none protected, 0 documents remaining';
end $$;

-- ── 4. delete ───────────────────────────────────────────────────────────────
delete from public.companies
where id in (select id from _companies_to_delete);

-- ── 5. verify after ─────────────────────────────────────────────────────────
do $$
declare
  v_co integer; v_id uuid; v_members integer; v_seq integer; v_moved integer;
  v_admins integer; v_unlimited integer;
begin
  select count(*) into v_co from public.companies;
  if v_co <> 1 then raise exception 'expected exactly 1 company remaining, found %', v_co; end if;

  select id into v_id from public.companies;
  if v_id <> '4ae68334-15a0-4fa3-a9ba-fd77deccc95d' then
    raise exception 'the surviving company is % — expected 4ae68334', v_id;
  end if;

  select count(*) into v_members from public.company_members;
  if v_members <> 1 then raise exception 'expected 1 company_members row, found %', v_members; end if;

  -- The admin row and the unlimited flag must both survive.
  select count(*) into v_admins from public.system_admins where lower(email) = 'support@uxellent.com';
  if v_admins <> 1 then raise exception 'support@uxellent.com is no longer in system_admins'; end if;

  select count(*) into v_unlimited from public.unlimited_document_companies
    where company_id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d';
  if v_unlimited <> 1 then raise exception 'Bogo Media lost its unlimited_document_companies row'; end if;

  -- Seven sequence rows fall by cascade; the five must be untouched, every column.
  select count(*) into v_seq from public.document_sequences;
  if v_seq <> 5 then raise exception 'expected 5 sequence rows to remain, found %', v_seq; end if;

  select count(*) into v_moved from (
    (select * from public.document_sequences except select * from _seq_before)
    union all
    (select * from _seq_before except select * from public.document_sequences)
  ) diff;
  if v_moved <> 0 then
    raise exception 'document_sequences moved: % differing row(s). Rolling back.', v_moved;
  end if;

  raise notice 'stage 2 verified: 1 company, 1 member, admin intact, 5 sequence rows byte-identical';
end $$;

commit;

-- ── 6. the auth users to delete, via the Admin API — NOT deleted here ───────
-- Ten ids. The two protected accounts are excluded by the WHERE clause, and that
-- exclusion must be repeated wherever this list is consumed.
select u.id, u.email, u.created_at, u.last_sign_in_at
from auth.users u
where lower(u.email) not in ('support@uxellent.com', 'itzikbab@gmail.com')
order by u.created_at;

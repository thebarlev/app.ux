-- ====================================================
-- 130 ROLLBACK
-- ====================================================
-- Open this in a second tab BEFORE running 130, not after.
--
-- Returns auditor_plans, auditor_subscription_charges, auditor_subscriptions and
-- companies to their state before migration 130.
--
-- ── WHAT IT RESTORES, AND FROM WHERE ────────────────────────────────────────
-- The plan values below are the MEASURED pre-130 state, read from production on
-- 11.8.2026 — not the values in scripts/081, which say 97/497/997 and are wrong:
-- the rows were edited by hand at some point, which is exactly why this file
-- states them literally rather than referring to any earlier migration.
--
--   basic    'בסיסי'    1
--   pro      'מקצועי'   2
--   premium  'מומחים'   3
--
-- ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
-- It does not delete any charge, subscription or document. Nothing in 130 removed
-- data, so nothing here restores any.
--
-- The two snapshot columns are dropped, which discards the backfilled values. That
-- is correct for a rollback — they were derived entirely from amount and from the
-- plan names, so re-running 130 reproduces them exactly.
--
-- The test company in Block C is NOT removed automatically. See the last section:
-- deleting a company row is not something a rollback script should do unattended.
-- ====================================================

begin;

-- Reverse of B3.
alter table public.companies
  drop column if exists is_test;

-- Reverse of B2.
drop index if exists public.auditor_subscription_charges_period_uniq;

-- Reverse of B1.
alter table public.auditor_subscriptions
  drop column if exists scan_id;

-- Reverse of A3b — the measured pre-130 values.
update public.auditor_plans set name = 'בסיסי',  monthly_amount = 1, updated_at = now() where id = 'basic';
update public.auditor_plans set name = 'מקצועי', monthly_amount = 2, updated_at = now() where id = 'pro';
update public.auditor_plans set name = 'מומחים', monthly_amount = 3, updated_at = now() where id = 'premium';

comment on column public.auditor_plans.monthly_amount is null;

-- Reverse of A3a — restore the CHECK exactly as scripts/081 declared it.
--
-- Guarded: if a plan id outside the original three has been inserted since 130 ran,
-- adding this back would fail. In that case the constraint is skipped and the notice
-- says so, because the alternative is a rollback that cannot complete.
do $$
declare
  v_outside int;
begin
  select count(*) into v_outside
  from public.auditor_plans
  where id not in ('basic','pro','premium');

  if v_outside = 0 then
    if not exists (
      select 1 from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where nsp.nspname = 'public' and rel.relname = 'auditor_plans'
        and con.contype = 'c'
        and pg_get_constraintdef(con.oid) ilike '%id%basic%pro%premium%'
    ) then
      alter table public.auditor_plans
        add constraint auditor_plans_id_check check (id in ('basic','pro','premium'));
      raise notice '130-ROLLBACK: restored the id CHECK on auditor_plans';
    end if;
  else
    raise warning '130-ROLLBACK: % plan row(s) outside basic/pro/premium exist — CHECK NOT restored. Remove them first if the constraint is wanted.', v_outside;
  end if;
end $$;

-- Reverse of A1/A2.
alter table public.auditor_subscription_charges
  drop column if exists plan_snapshot_name,
  drop column if exists plan_snapshot_monthly_amount;

commit;

select pg_notify('pgrst', 'reload schema');

-- ── WHICH FILE JUST RAN ─────────────────────────────────────────────────────
-- See the matching note in 130. These two files used to end identically, so the
-- result pane could not tell them apart and this one got run by accident right
-- after the migration. The marker below is the difference.
select '⛔ 130 ROLLED BACK' as result;

-- ============================================================================
-- The test company, if Block C was run — MANUAL, and read this first
-- ============================================================================
-- Not executed by this script. A company row can be referenced by other rows the
-- moment it exists, and an unattended delete inside a rollback is how a cascade
-- takes something with it.
--
-- Check what points at it before deciding:
--
--   select id, company_name, registration_number, email
--   from public.companies
--   where email = 'billing-sandbox@uxellent.invalid';
--
--   select 'documents' as t, count(*) from public.documents
--     where company_id = (select id from public.companies where email = 'billing-sandbox@uxellent.invalid')
--   union all
--   select 'auditor_subscriptions', count(*) from public.auditor_subscriptions
--     where company_id = (select id from public.companies where email = 'billing-sandbox@uxellent.invalid')
--   union all
--   select 'auditor_subscription_charges', count(*) from public.auditor_subscription_charges
--     where company_id = (select id from public.companies where email = 'billing-sandbox@uxellent.invalid');
--
-- If every count is zero, and only then:
--
--   delete from public.companies where email = 'billing-sandbox@uxellent.invalid';
--
-- If any count is above zero, do not delete. A company holding documents is a
-- bookkeeping entity, test flag or not.
-- ============================================================================

-- ====================================================
-- 130 - Stage 2: the subscription plans, the charge snapshot, and the test company
-- ====================================================
-- Approved mapping, 11.8.2026. Nothing here is improvised: every item below was
-- agreed in writing before this file was written.
--
-- ── THE ORDER IS THE WHOLE POINT ────────────────────────────────────────────
-- Block A runs in one transaction and its three steps MUST stay in this order:
--
--   1. add the snapshot columns to auditor_subscription_charges
--   2. backfill them from what was ACTUALLY charged, and from the plan names as
--      they are RIGHT NOW
--   3. only then rewrite auditor_plans
--
-- Reversing 2 and 3 would stamp 14 historical charges with the new prices and the
-- new names — writing 118 onto a row that took ₪1, and "מורחב" onto a row that was
-- sold as "מקצועי". That is not a display bug, it is rewriting a financial record
-- after the fact. The whole reason the snapshot columns exist is that plan_id is a
-- live reference: change the plan and every historical charge silently appears to
-- have been something it was not.
--
-- ── THE PRICES ARE VAT-INCLUSIVE, AND THE COLUMN NAME DOES NOT SAY SO ───────
-- One number does three jobs:
--
--   auditor_plans.monthly_amount
--     -> auditor_subscription_charges.amount
--       -> chargeToken({ sumToBill })            what is taken from the card
--         -> v_total in the issuance function
--           -> v_total / 1.18                    what the invoice calls the base
--
-- So 100 in this column would charge ₪100 and issue an invoice reading
-- 84.75 + 15.25 — ₪18 short, per customer, per month, silently. 118 charges ₪118
-- and issues 100.00 + 18.00. The column carries a COMMENT for exactly this reason.
-- Do not remove it.
--
-- 100 / 250 / 500 before VAT, because x × 1.18 only lands on a whole shekel when x
-- is a multiple of 50. The original 97 gives 114.46 and never could.
--
-- ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
-- No subscription-events table and no plan history. auditor_subscriptions keeps
-- company_id as its primary key; customer-facing plan change is out of scope, and
-- an admin upgrade is an UPDATE that erases the previous plan. The snapshot columns
-- added here are then the only surviving record of what somebody was on. Accepted,
-- and written down so it stays a decision rather than a discovery.
--
-- Nothing is deleted. The 14 historical charges are real financial records — ₪1
-- card tests from 3-4.3.2026, with provider_transaction_id values — and they are
-- excluded from the new index by date rather than removed to make it fit.
--
-- ROLLBACK: scripts/130-ROLLBACK.sql. Open it in a second tab BEFORE running this.
-- ====================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- BLOCK A · charges snapshot, then plans
-- ────────────────────────────────────────────────────────────────────────────

-- A1 · The snapshot columns.
--
-- Nullable on purpose. Making them NOT NULL would demand a default, and a default
-- on a column whose entire job is "what was true at the time" is a contradiction:
-- it would invent a value for any row that failed to record one.
alter table public.auditor_subscription_charges
  add column if not exists plan_snapshot_name text,
  add column if not exists plan_snapshot_monthly_amount numeric;

comment on column public.auditor_subscription_charges.plan_snapshot_name is
  'שם המסלול כפי שהיה ברגע החיוב. plan_id הוא הפניה חיה — שינוי מחיר או שם ב-auditor_plans משכתב למפרע את מה שחיוב היסטורי נראה כאילו היה. העמודה הזו היא מה שמונע את זה.';

comment on column public.auditor_subscription_charges.plan_snapshot_monthly_amount is
  'הסכום שנגבה בפועל, כולל מע"מ, ברגע החיוב. מקורו amount על אותה שורה ולא auditor_plans.';

-- A2 · Backfill, from the row's own amount and from the plan names as they stand
--      before A3 rewrites them. This must precede A3.
update public.auditor_subscription_charges c
set plan_snapshot_monthly_amount = c.amount
where c.plan_snapshot_monthly_amount is null;

update public.auditor_subscription_charges c
set plan_snapshot_name = p.name
from public.auditor_plans p
where p.id = c.plan_id
  and c.plan_snapshot_name is null;

-- A3 · The plans themselves. Only name and monthly_amount change.
--
-- The ids stay exactly as they are. Four foreign keys point at them
-- (auditor_checkout_sessions, auditor_subscriptions, auditor_subscription_charges,
-- auditor_marketing_links) and an id is a technical identifier, not a label.

-- A3a · Drop the CHECK, do not widen it.
--
-- `check (id in ('basic','pro','premium'))` guards a table only this system writes
-- to, and it buys nothing the four foreign keys do not already buy: they are what
-- guarantees no row points at a plan that does not exist. What the CHECK does buy
-- is a migration every single time a plan is ever added. Dropping it makes adding a
-- plan an INSERT.
--
-- The constraint name is discovered rather than assumed. The BEFORE query has since
-- confirmed it as `auditor_plans_id_check`, with the definition
-- `CHECK ((id = ANY (ARRAY['basic'::text, 'pro'::text, 'premium'::text])))` — which
-- the pattern below matches — but the lookup stays, because a name that happens to
-- be right today is not a reason to hard-code it into a DROP.
do $$
declare
  v_conname text;
begin
  select con.conname into v_conname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'auditor_plans'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%id%basic%pro%premium%'
  limit 1;

  if v_conname is not null then
    execute format('alter table public.auditor_plans drop constraint %I', v_conname);
    raise notice '130: dropped CHECK constraint % on auditor_plans', v_conname;
  else
    raise notice '130: no id CHECK constraint found on auditor_plans — nothing to drop';
  end if;
end $$;

-- A3b · Names and prices. VAT-INCLUSIVE amounts — see the header.
update public.auditor_plans set name = 'בסיסי', monthly_amount = 118, is_active = true, updated_at = now() where id = 'basic';
update public.auditor_plans set name = 'מורחב', monthly_amount = 295, is_active = true, updated_at = now() where id = 'pro';
update public.auditor_plans set name = 'מלא',   monthly_amount = 590, is_active = true, updated_at = now() where id = 'premium';

comment on column public.auditor_plans.monthly_amount is
  'סכום כולל מע"מ, בשקלים. זהו הסכום שנטען מהכרטיס. החשבונית גוזרת ממנו את הבסיס בחלוקה ב-1.18. 118/295/590 = 100/250/500 לפני מע"מ.';

-- ────────────────────────────────────────────────────────────────────────────
-- BLOCK B · the two structural additions
-- ────────────────────────────────────────────────────────────────────────────

-- B1 · Which scan sold this subscription.
--
-- The plan buttons on the results page already carry plan and scanId; this is where
-- the second value lands. on delete set null because losing a scan must never take
-- a live subscription with it.
alter table public.auditor_subscriptions
  add column if not exists scan_id uuid null references public.auditor_scans(id) on delete set null;

comment on column public.auditor_subscriptions.scan_id is
  'הסריקה שממנה נרכש המנוי, אם ידועה. nullable — מנוי שנוצר ידנית או לפני התיעוד הזה לא יישא ערך.';

-- B2 · Do not take money twice for the same month.
--
-- This is the SECOND layer, and the division of labour matters:
--
--   idx_..._uniq_asmachta  — already exists, on uniq_asmachta. uniqAsmachtaAuditor()
--                            is deterministic (company + period start, no clock, no
--                            randomness), so two renewal runs for the same company
--                            and period produce the same string and the second
--                            insert already fails. That is a TECHNICAL claim: the
--                            same transaction cannot be inserted twice. It covers
--                            'created' rows too, which is what stops a race.
--
--   this index             — a FINANCIAL claim: money is not taken twice in one
--                            month, whatever route took it. It earns its place on
--                            day one, because the stage 3 checkout is a first
--                            charge rather than a renewal, does not pass through
--                            renewals/run, and has no obligation to compute an
--                            asmachta the same way.
--
-- ⚠️ succeeded ONLY, and this is not a detail.
--
-- Including 'created' would break signup for a whole month on the most ordinary
-- behaviour there is: a customer clicks buy, a 'created' row is written, they are
-- sent to Cardcom, and they abandon the page — which happens to a large share of
-- visitors. Nothing in this system ever moves a row out of 'created': renewals/run
-- writes it and then updates it in the same pass, so a process that dies in between
-- leaves it there permanently. With 'created' in this index, that stuck row would
-- lock the customer out until the next period. 'failed' is excluded for the same
-- family of reason: no money moved, so a retry must be allowed.
--
-- ⚠️ The date cut is REQUIRED, not cosmetic. The 14 historical charges are all
-- status='succeeded' across only 2 distinct (company_id, subscription_period_start)
-- pairs, so this index cannot be created over them. They are excluded by date and
-- left in place, because deleting a financial record to make a constraint fit is
-- exactly the kind of fix this project does not do.
create unique index if not exists auditor_subscription_charges_period_uniq
  on public.auditor_subscription_charges (company_id, subscription_period_start)
  where status = 'succeeded'
    and created_at >= timestamptz '2026-08-11 00:00:00+03';

comment on index public.auditor_subscription_charges_period_uniq is
  'הגנה מפני גבייה כפולה באותה תקופה, חלה מיום הוספתה. שכבה שנייה: uniq_asmachta מונע מירוץ בהכנסה (טענה טכנית), זה מונע לקיחת כסף פעמיים באותו חודש (טענה כספית). succeeded בלבד — created היה נועל לקוח שנטש את עמוד קארדקום, ואין מנגנון שמוציא שורה מ-created. 14 חיובי בדיקה מ-3-4.3.2026 מוחרגים בכוונה: הם רשומות כספיות אמיתיות ולא נמחקו.';

-- B3 · The test-company flag.
--
-- The column is the gate every outbound regulatory path will refuse on. It is added
-- here; the refusals themselves are code and are not part of this migration.
alter table public.companies
  add column if not exists is_test boolean not null default false;

comment on column public.companies.is_test is
  'חברת בדיקה. כל מסלול יוצא — שע"מ, בקשת הקצאה, קובץ אחיד, כל דיווח חיצוני — חייב לזרוק שגיאה כשהדגל דלוק, ולא לסנן בשאילתה. מסמכי בדיקה אינם עוברים לעולם לעוסק אחר.';

commit;

select pg_notify('pgrst', 'reload schema');

-- ============================================================================
-- BLOCK C · the test company — RUN SEPARATELY, AFTER Block A/B committed
-- ============================================================================
-- Deliberately outside the transaction above — and the BEFORE query proved why.
--
-- public.companies is not created by any file in scripts/, so its NOT NULL columns
-- could not be read from this repository. The pre-flight query returned them on
-- 11.8.2026, and it caught two that this file had missed:
--
--   company_name         NOT NULL, no default    <- was already here
--   contact_first_name   NOT NULL, no default    <- WAS MISSING
--   contact_full_name    NOT NULL, no default    <- WAS MISSING
--   email                NOT NULL, no default    <- was already here
--   id, status, created_at, books_region         all defaulted, nothing to supply
--
-- Had this run inside the transaction above it would have failed on
-- contact_first_name and rolled back every schema change with it. That is the whole
-- argument for keeping it separate, and it is no longer hypothetical.
--
-- business_type is NOT in the NOT NULL list and is deliberately left unset: its
-- allowed values are declared nowhere in this repository, and a CHECK this file
-- cannot see is not worth guessing at for a column nothing here needs. Code that
-- reads it treats anything other than 'osek_patur' as standard, so an unset value
-- behaves correctly — see isExemptOsekPatur in lib/document-helpers.ts.
--
-- No auth user, on purpose. This company must not be signed into. If some other flow
-- turns out to break on a null auth_user_id, that is a finding to report — not a
-- reason to create a login.
-- ============================================================================

-- insert into public.companies (
--   company_name,
--   contact_first_name,
--   contact_full_name,
--   registration_number,
--   email,
--   is_test
-- )
-- select
--   'חברת בדיקה - אודיטור (TEST)',
--   'בדיקה',
--   'חברת בדיקה אודיטור',
--   '000000018',
--   'billing-sandbox@uxellent.invalid',
--   true
-- where not exists (
--   select 1 from public.companies where email = 'billing-sandbox@uxellent.invalid'
-- );
--
-- Then confirm exactly one row, and that it is flagged:
--
--   select id, company_name, registration_number, email, is_test, status, books_region
--   from public.companies where email = 'billing-sandbox@uxellent.invalid';
--
-- ח.פ 000000018 passes the Israeli checksum (verified against
-- lib/validation/israeli-id.ts) and no real company carries it. Leading zeros
-- survive: normalizeIsraeliIdInput strips only spaces and hyphens, and the column
-- is text.
--
-- The .invalid suffix is reserved by RFC 2606 and can never resolve. That is what
-- closes the fallback in lib/auditor/company-resolution.ts, where a user without a
-- company is matched against companies.email.

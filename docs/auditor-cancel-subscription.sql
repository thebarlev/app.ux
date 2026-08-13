-- ============================================================================
-- Stop an auditor subscription — one statement, no UI, nothing deleted
-- ============================================================================
--
-- Fill ONE of the two placeholders on lines 41-42 and run it in Supabase.
-- Leave the other exactly as it is.
--
-- ── WHAT IT CHANGES, COLUMN BY COLUMN ───────────────────────────────────────
--
--   status               -> 'canceled'    (was 'active' or 'past_due')
--   next_billing_date    -> NULL          (was a timestamp)
--   canceled_at          -> now()         (was NULL)
--   cancel_at_period_end -> false
--   updated_at           -> now()
--
-- ── ⛔ WILL THE RENEWAL SKIP THIS ROW? YES, AND TWICE OVER ──────────────────
--
-- app/api/auditor/billing/renewals/run/route.ts selects the rows it will charge with
-- exactly three conditions:
--
--     .in("status", ["active", "past_due"])
--     .not("next_billing_date", "is", null)
--     .lte("next_billing_date", nowIso)
--
-- 'canceled' is not in that status list, so the first condition alone excludes the row.
-- next_billing_date IS NULL excludes it again under the second. Either would be enough;
-- both are set on purpose, so a future change to one of those filters cannot quietly
-- resurrect a cancelled subscription.
--
-- These are the same two columns the route writes itself when it honours
-- cancel_at_period_end (line 81: status 'canceled', next_billing_date null, canceled_at).
-- This statement is not a new mechanism — it is the existing one, run by hand.
--
-- ⚠️ The renewal route is not scheduled yet. When it is, this row is already invisible
-- to it.
--
-- ── ⛔ WHAT IT DOES NOT TOUCH ───────────────────────────────────────────────
--
-- No deletes, anywhere. Charges already taken stay. Documents already issued stay —
-- they are tax records and are not ours to remove. The company row stays. The stored
-- payment token stays in auditor_customer_payment_methods, untouched: it is encrypted,
-- it is what a future re-subscribe would reuse, and removing it is a separate decision
-- from stopping the billing.
--
-- ── THE GUARD ───────────────────────────────────────────────────────────────
--
-- The update only fires when the target resolves to EXACTLY ONE subscription. Zero
-- matches returns nothing; two or more returns nothing. A cancellation that quietly hits
-- two customers because an email is shared is worse than one that does nothing and says
-- so by returning an empty result.
--
-- The RETURNING shows the before and after side by side, so the output is the proof of
-- what changed rather than a promise of it.
-- ============================================================================

with params as (
  select
    -- ⬇⬇ FILL ONE OF THESE TWO. LEAVE THE OTHER EMPTY. ⬇⬇
    nullif(trim(''), '') as p_email,        -- e.g. 'customer@example.co.il'
    nullif(trim(''), '') as p_company_id    -- e.g. '8dff68e3-4e2b-4240-ba11-e35e308a626d'
),
target as (
  select s.company_id
  from public.auditor_subscriptions s
  join public.companies c on c.id = s.company_id
  cross join params p
  where (p.p_email is not null and lower(trim(c.email)) = lower(p.p_email))
     or (p.p_company_id is not null and s.company_id = p.p_company_id::uuid)
),
before as (
  select s.company_id,
         s.status               as was_status,
         s.next_billing_date    as was_next_billing_date,
         s.canceled_at          as was_canceled_at,
         s.plan_snapshot_name   as plan,
         c.company_name,
         c.email
  from public.auditor_subscriptions s
  join public.companies c on c.id = s.company_id
  where s.company_id in (select company_id from target)
)
update public.auditor_subscriptions s
set status               = 'canceled',
    next_billing_date    = null,
    canceled_at          = now(),
    cancel_at_period_end = false,
    updated_at           = now()
from before b
where s.company_id = b.company_id
  -- Exactly one, or nothing at all.
  and (select count(*) from target) = 1
returning
  b.company_name,
  b.email,
  b.plan,
  b.was_status            as status_before,
  s.status                as status_after,
  b.was_next_billing_date as next_billing_before,
  s.next_billing_date     as next_billing_after,
  b.was_canceled_at       as canceled_at_before,
  s.canceled_at           as canceled_at_after;

-- ── If it returned nothing ──────────────────────────────────────────────────
-- Either no subscription matched, or more than one did. This says which, and changes
-- nothing:
--
--   select s.company_id, c.email, c.company_name, s.status, s.next_billing_date
--     from public.auditor_subscriptions s
--     join public.companies c on c.id = s.company_id
--    where lower(trim(c.email)) = lower('PUT_THE_EMAIL_HERE');
--
-- ── To undo a cancellation ──────────────────────────────────────────────────
-- Nothing was destroyed, so it is reversible — but next_billing_date has to be chosen
-- deliberately rather than restored, because the date that was there has passed by then.
-- Ask before running it.

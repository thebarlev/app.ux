-- ====================================================
-- 065 - Diagnostic: Post-payment (subscription not updated)
-- ====================================================
-- Run to diagnose why plan was not updated after Cardcom payment
-- Replace :company_id with your company (e.g. f3d8c92f-c5bf-4b24-9921-d6f8059e1297)
-- ====================================================

-- 1) Checkout sessions for this company (last 10)
select id, company_id, plan_id, status, provider_low_profile_code,
       provider_internal_deal_number,
       raw_indicator_json is not null as has_indicator_json,
       indicator_url,
       indicator_url like 'http://localhost%' as is_localhost,
       created_at
from public.checkout_sessions
where company_id = 'f3d8c92f-c5bf-4b24-9921-d6f8059e1297'::uuid
order by created_at desc
limit 10;

-- 2) Current subscription status
select company_id, plan_id, status, provider, billing_interval,
       current_period_start, current_period_end,
       trial_starts_at, trial_ends_at,
       updated_at
from public.subscriptions
where company_id = 'f3d8c92f-c5bf-4b24-9921-d6f8059e1297'::uuid;

-- 3) billing_webhook_events (Cardcom IndicatorUrl callbacks)
-- If empty: Cardcom never reached our server (check IndicatorUrl, PUBLIC_BASE_URL)
select provider, event_id, status, received_at, processed_at,
       payload->>'error' as payload_error,
       payload->>'checkout_session_id' as checkout_id
from public.billing_webhook_events
where provider = 'cardcom'
  and (payload->>'checkout_session_id' like '%f3d8c92f%' or event_id like 'lowprofile:%')
order by received_at desc
limit 20;

-- 4) customer_payment_methods (tokens for recurring)
-- If empty: Cardcom never sent token, or IndicatorUrl never ran
select id, company_id, provider, card_num_start, card_num_end,
       status, token_ex_date, created_at
from public.customer_payment_methods
where company_id = 'f3d8c92f-c5bf-4b24-9921-d6f8059e1297'::uuid;

-- 5) billing_failures (post-payment errors)
select bf.*, cs.status as checkout_status
from public.billing_failures bf
join public.checkout_sessions cs on cs.id = bf.checkout_session_id
where bf.company_id = 'f3d8c92f-c5bf-4b24-9921-d6f8059e1297'::uuid
order by bf.created_at desc;

-- 6) Raw indicator JSON (if checkout has status=paid)
select id, status, raw_indicator_json
from public.checkout_sessions
where company_id = 'f3d8c92f-c5bf-4b24-9921-d6f8059e1297'::uuid
  and status = 'paid'
order by created_at desc
limit 1;

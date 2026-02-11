-- ====================================================
-- 063 - Debug: stuck checkout_sessions investigation
-- ====================================================
-- Run these queries to investigate checkout_sessions stuck at 'redirected'
-- Replace :low_profile_code with the actual LowProfileCode (e.g. from checkout_sessions)
-- ====================================================

-- 1) Find stuck sessions (redirected with low_profile_code, no raw_indicator_json)
select id, company_id, plan_id, status, provider_low_profile_code, indicator_url,
       raw_indicator_json is not null as has_indicator_json,
       provider_internal_deal_number,
       created_at
from public.checkout_sessions
where status = 'redirected'
  and provider_low_profile_code is not null
order by created_at desc
limit 20;

-- 2) For a given LowProfileCode, verify billing_webhook_events
-- Example: event_id = 'lowprofile:YOUR_CODE_HERE'
select provider, event_id, status, received_at, processed_at,
       payload->>'error' as payload_error,
       payload->>'checkout_session_id' as checkout_id
from public.billing_webhook_events
where provider = 'cardcom'
  and event_id like 'lowprofile:%'
order by received_at desc
limit 20;

-- 3) Check indicator_url in checkout_sessions (must point to production domain)
select id, provider_low_profile_code, indicator_url,
       indicator_url like 'http://localhost%' as is_localhost,
       indicator_url like 'https://%' as is_https
from public.checkout_sessions
where status = 'redirected'
  and provider_low_profile_code is not null;

-- 4) Full flow check for a checkout_session_id (replace :id)
-- select
--   cs.id,
--   cs.status,
--   cs.provider_low_profile_code,
--   cs.provider_internal_deal_number,
--   cs.raw_indicator_json is not null as has_indicator,
--   cs.indicator_url,
--   (select count(*) from billing_webhook_events b where b.event_id = 'lowprofile:' || cs.provider_low_profile_code) as webhook_count,
--   (select status from public.subscriptions s where s.company_id = cs.company_id) as sub_status,
--   (select plan_id from public.subscriptions s where s.company_id = cs.company_id) as sub_plan,
--   (select count(*) from billing_documents bd where bd.checkout_session_id = cs.id) as billing_doc_count
-- from checkout_sessions cs
-- where cs.id = :id;

-- 5) List billing_failures (post-payment failures)
select bf.*, cs.company_id, cs.status as checkout_status
from public.billing_failures bf
join public.checkout_sessions cs on cs.id = bf.checkout_session_id
order by bf.created_at desc
limit 20;

-- ====================================================
-- 046 - RLS policies for plans/subscriptions/usage/webhook_events (V1)
-- ====================================================
-- Align with multi-tenant helper: public.user_company_ids()
-- Notes:
-- - We allow tenant-scoped SELECT for subscriptions/usage.
-- - Mutations are performed via service-role (webhooks) or security-definer RPCs.
-- ====================================================

begin;

-- -----------------------
-- plans (public read)
-- -----------------------
alter table public.plans enable row level security;

drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans
  for select
  using (true);

-- -----------------------
-- subscriptions (tenant read)
-- -----------------------
alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select
  using (company_id in (select public.user_company_ids()));

-- Intentionally no INSERT/UPDATE/DELETE policies:
-- - INSERT happens via trigger function `create_trial_subscription_for_company()` (security definer)
-- - UPDATE happens via service role (billing webhooks) or security definer RPC

-- -----------------------
-- usage_monthly (tenant read)
-- -----------------------
alter table public.usage_monthly enable row level security;

drop policy if exists usage_monthly_select on public.usage_monthly;
create policy usage_monthly_select on public.usage_monthly
  for select
  using (company_id in (select public.user_company_ids()));

-- -----------------------
-- billing_webhook_events (service-role only)
-- -----------------------
alter table public.billing_webhook_events enable row level security;

-- No policies: client roles cannot access this table.

commit;

select pg_notify('pgrst', 'reload schema');


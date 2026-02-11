-- ====================================================
-- 056 - Plans: overage pricing + featured flag
-- ====================================================
-- Purpose:
-- - Add overage_unit_price for paid-plan overages (supports decimals, e.g. 0.5)
-- - Add is_featured for in-app pricing UI badge ("המומלץ ביותר")
-- - Seed/update plan quotas + prices (monthly only MVP)
-- Notes:
-- - Uses existing `documents_per_month` as included monthly quota
-- - Safe to run multiple times
-- ====================================================

begin;

alter table public.plans
  add column if not exists overage_unit_price numeric not null default 0,
  add column if not exists is_featured boolean not null default false;

-- Ensure baseline plans exist (idempotent)
insert into public.plans (id, name, price_monthly, price_yearly, documents_per_month, features_json)
values
  ('free', 'Free', 0, null, 10, '{}'::jsonb),
  ('basic', 'Basic', 29, null, 50, '{}'::jsonb),
  ('pro', 'Pro', 69, null, 250, '{}'::jsonb)
on conflict (id) do nothing;

-- Apply canonical pricing/quota values
update public.plans
set
  documents_per_month = 10,
  price_monthly = 0,
  overage_unit_price = 0,
  is_featured = false
where id = 'free';

update public.plans
set
  documents_per_month = 50,
  price_monthly = 29,
  overage_unit_price = 1,
  is_featured = true
where id = 'basic';

update public.plans
set
  documents_per_month = 250,
  price_monthly = 69,
  overage_unit_price = 0.5,
  is_featured = false
where id = 'pro';

commit;

select pg_notify('pgrst', 'reload schema');


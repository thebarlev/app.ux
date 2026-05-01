-- ====================================================
-- 102 - Plans: add osek_patur-specific plans (idempotent)
-- ====================================================
-- Purpose:
-- - Add plan_ids dedicated to osek_patur signup flow without changing existing plans
-- - free_patur: 50 docs/month (free)
-- - basic_patur: 100 docs/month (paid)
-- - pro_patur: 250 docs/month (paid)
-- Notes:
-- - Prices mirror existing basic/pro defaults from scripts/056-plans-overage-and-featured.sql
-- - Quotas here are catalog defaults; enforcement uses subscriptions snapshot
-- ====================================================

begin;

insert into public.plans (id, name, price_monthly, price_yearly, documents_per_month, features_json)
values
  ('free_patur', 'Free (Osek Patur)', 0, null, 50, '{}'::jsonb),
  ('basic_patur', 'Basic (Osek Patur)', 29, null, 100, '{}'::jsonb),
  ('pro_patur', 'Pro (Osek Patur)', 69, null, 250, '{}'::jsonb)
on conflict (id) do nothing;

commit;

select pg_notify('pgrst', 'reload schema');


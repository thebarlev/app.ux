-- ====================================================
-- 105 - Auditor: Premium (מומחים) plan link (a_premium) + price 1,497 ₪
-- ====================================================
-- Purpose:
-- - Add a_premium link_id for marketing site (like a_basic, a_pro)
-- - Reactivate premium plan, set monthly_amount to 1,497 ₪
-- ====================================================

begin;

-- Add a_premium to auditor_marketing_links (idempotent)
insert into public.auditor_marketing_links (id, plan_id, is_active, source, notes)
values
  ('a_premium', 'premium', true, 'vow', 'Marketing: Premium (מומחים) monthly 1,497 ₪')
on conflict (id) do update set
  plan_id = excluded.plan_id,
  is_active = excluded.is_active,
  notes = excluded.notes;

-- Reactivate premium and set price to 1,497 ₪
update public.auditor_plans
set monthly_amount = 1497, is_active = true, updated_at = now()
where id = 'premium';

commit;

select pg_notify('pgrst', 'reload schema');

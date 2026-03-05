-- ====================================================
-- 104 - Auditor: Pro plan link (a_pro) + price 1,497 ₪
-- ====================================================
-- Purpose:
-- - Ensure a_pro link_id exists for marketing site (like a_basic)
-- - Set pro plan monthly_amount to 1,497 ₪ as in DB
-- ====================================================

begin;

-- Ensure a_pro exists in auditor_marketing_links (idempotent)
insert into public.auditor_marketing_links (id, plan_id, is_active, source, notes)
values
  ('a_pro', 'pro', true, 'vow', 'Marketing: Pro monthly 1,497 ₪')
on conflict (id) do update set
  plan_id = excluded.plan_id,
  is_active = excluded.is_active,
  notes = excluded.notes;

-- Set pro plan price to 1,497 ₪
update public.auditor_plans
set monthly_amount = 1497, updated_at = now()
where id = 'pro';

commit;

select pg_notify('pgrst', 'reload schema');

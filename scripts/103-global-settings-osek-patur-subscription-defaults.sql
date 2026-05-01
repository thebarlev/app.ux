-- ====================================================
-- 103 - Global settings: osek_patur subscription defaults
-- ====================================================
-- Purpose:
-- - Allow changing osek_patur quotas/prices without code changes
-- - Used by the osek_patur subscription trigger logic for NEW signups
-- Notes:
-- - Values are strings (global_settings.setting_value is text)
-- ====================================================

begin;

insert into public.global_settings (setting_key, setting_value)
values
  ('osek_patur_free_documents_limit', '50'),
  ('osek_patur_basic_documents_limit', '100'),
  ('osek_patur_pro_documents_limit', '250'),
  ('osek_patur_basic_price_monthly', '29'),
  ('osek_patur_pro_price_monthly', '69')
on conflict (setting_key) do nothing;

commit;

select pg_notify('pgrst', 'reload schema');


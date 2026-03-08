-- ====================================================
-- 092 - Add support@vow.co.il to system_admins
-- ====================================================
-- Purpose:
-- - support@vow.co.il gets unlimited document finalization (see 091)
-- - Run this after the user has signed up in Supabase Auth
-- ====================================================

begin;

INSERT INTO public.system_admins (auth_user_id, email, name, role)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', 'VOW Support'),
  'SYSTEM_ADMIN'
FROM auth.users
WHERE email = 'support@vow.co.il'
ON CONFLICT (email) DO UPDATE SET
  auth_user_id = EXCLUDED.auth_user_id,
  name = COALESCE(EXCLUDED.name, system_admins.name),
  role = 'SYSTEM_ADMIN';

commit;

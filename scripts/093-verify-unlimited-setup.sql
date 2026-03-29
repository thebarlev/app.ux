-- ====================================================
-- 093 - Verify unlimited documents setup
-- ====================================================
-- הרץ ב-Supabase SQL Editor כדי לוודא שההגדרות תקינות
-- ====================================================

-- 1. חברות ללא מגבלה (חייבת להיות 4ae68334)
SELECT 'unlimited_document_companies' as check_name, company_id::text
FROM public.unlimited_document_companies;

-- 2. משתמשים ב-system_admins (support@uxellent.com)
SELECT 'system_admins' as check_name, sa.email, sa.name
FROM public.system_admins sa
JOIN auth.users u ON u.id = sa.auth_user_id
WHERE u.email = 'support@uxellent.com';

-- 3. אם אין תוצאות - הרץ:
-- INSERT INTO unlimited_document_companies (company_id) VALUES ('4ae68334-15a0-4fa3-a9ba-fd77deccc95d') ON CONFLICT DO NOTHING;
-- INSERT INTO system_admins (auth_user_id, email, name, role) SELECT id, email, 'VOW Support', 'SYSTEM_ADMIN' FROM auth.users WHERE email = 'support@uxellent.com' ON CONFLICT (email) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id;

-- ====================================================
-- SETUP USER - קישור משתמש לחברה
-- ====================================================
-- הריץ את זה אחרי שנרשמת לאתר
-- ====================================================

-- Step 1: בדיקה - הצג את המשתמשים הקיימים
SELECT 
  id,
  email,
  created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 5;

-- Step 2: בדיקה - הצג את החברות הקיימות
SELECT 
  id,
  company_name as "שם_חברה",
  tax_id as "מספר_עוסק",
  auth_user_id as "בעלים_נוכחי",
  created_at
FROM public.companies
ORDER BY created_at DESC
LIMIT 5;

-- Step 3: בדיקה - בדוק אם המשתמש כבר מקושר לחברה
SELECT 
  cm.id,
  cm.user_id,
  cm.company_id,
  cm.role,
  c.company_name as company_name,
  u.email as user_email
FROM public.company_members cm
JOIN public.companies c ON c.id = cm.company_id
JOIN auth.users u ON u.id = cm.user_id
ORDER BY cm.created_at DESC;

-- ====================================================
-- INSTRUCTIONS: כיצד לקשר משתמש לחברה
-- ====================================================
-- 1. הריץ את Queries 1-3 למעלה כדי לראות את ה-IDs
-- 2. העתק את user_id (מהשלב 1) ואת company_id (מהשלב 2)
-- 3. החלף את [USER_ID] ו-[COMPANY_ID] בקוד למטה
-- 4. הסר את הסימון הערה (--) והריץ
-- ====================================================

-- UNCOMMENT AND EDIT THIS:
/*
INSERT INTO public.company_members (
  user_id,
  company_id,
  role,
  created_at
)
VALUES (
  '[USER_ID]'::uuid,      -- 👈 החלף עם user ID מ-query 1
  '[COMPANY_ID]'::uuid,   -- 👈 החלף עם company ID מ-query 2
  'owner',
  now()
)
ON CONFLICT (user_id, company_id) DO NOTHING
RETURNING 
  id,
  user_id,
  company_id,
  role;
*/

-- ====================================================
-- אם אין לך חברה - צור חברה חדשה
-- ====================================================
/*
INSERT INTO public.companies (
  id,
  company_name,
  tax_id,
  contact_first_name,
  contact_full_name,
  email,
  auth_user_id,
  created_at
)
VALUES (
  gen_random_uuid(),
  'החברה שלי',                    -- 👈 שנה את שם החברה
  '123456789',                     -- 👈 שנה למספר עוסק אמיתי
  'שם פרטי',                       -- 👈 שנה לשם הפרטי שלך
  'שם מלא',                        -- 👈 שנה לשם המלא שלך
  'you@email.com',                 -- 👈 שנה לאימייל שלך
  '[USER_ID]'::uuid,               -- 👈 החלף עם user ID שלך
  now()
)
RETURNING id, company_name, tax_id;
*/

-- ====================================================
-- אחרי שקישרת את המשתמש - וידוא
-- ====================================================
-- הריץ את זה לוודא שהפונקציה user_company_ids() עובדת
SELECT public.user_company_ids();

-- אמור להחזיר את ה-company_id שלך!

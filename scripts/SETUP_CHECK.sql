-- ====================================================
-- SETUP CHECK - בדיקה מה כבר קיים ומה חסר
-- ====================================================

-- 1. בדיקת טבלאות קיימות
SELECT 
  'Tables Check' as check_type,
  tablename,
  'EXISTS' as status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'companies',
    'company_members',
    'customers',
    'documents',
    'document_line_items',
    'document_sequences',
    'document_events'
  )
ORDER BY tablename;

-- 2. בדיקת RLS
SELECT 
  'RLS Check' as check_type,
  tablename,
  CASE 
    WHEN rowsecurity THEN 'ENABLED ✓'
    ELSE 'DISABLED ✗'
  END as status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'companies',
    'company_members',
    'customers',
    'documents',
    'document_line_items',
    'document_sequences'
  )
ORDER BY tablename;

-- 3. בדיקת Policies
SELECT 
  'Policies Check' as check_type,
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- 4. בדיקת עמודות חשובות
SELECT 
  'Columns Check' as check_type,
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'document_line_items'
  AND column_name IN ('bank_name', 'branch', 'account_number', 'payment_metadata')
ORDER BY table_name, column_name;

-- 5. בדיקת פונקציות
SELECT 
  'Functions Check' as check_type,
  routine_name,
  'EXISTS' as status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'user_company_ids',
    'generate_document_number'
  )
ORDER BY routine_name;

-- 6. בדיקת משתמשים וחברות
SELECT 
  'Users Check' as check_type,
  COUNT(*) as count,
  'auth.users' as source
FROM auth.users
UNION ALL
SELECT 
  'Companies Check',
  COUNT(*),
  'companies'
FROM public.companies
UNION ALL
SELECT 
  'Company Members Check',
  COUNT(*),
  'company_members'
FROM public.company_members;

-- Create System Admin User
-- Run this AFTER you've created a user through Supabase Auth

-- Step 1: Check existing auth users
SELECT 
  id,
  email,
  created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 10;

-- Step 2: Check existing system admins
SELECT 
  id,
  auth_user_id,
  email,
  name,
  role
FROM public.system_admins;

-- Step 3: Add your user as system admin
-- Replace 'your-email@example.com' with your actual email
INSERT INTO public.system_admins (auth_user_id, email, name, role)
SELECT 
  id, 
  email, 
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email), 
  'SYSTEM_ADMIN'
FROM auth.users 
WHERE email = 'your-email@example.com'  -- <-- CHANGE THIS
ON CONFLICT (email) DO UPDATE 
SET 
  auth_user_id = EXCLUDED.auth_user_id,
  name = EXCLUDED.name,
  role = 'SYSTEM_ADMIN',
  updated_at = now();

-- Step 4: Verify
SELECT 
  sa.id,
  sa.email,
  sa.name,
  sa.role,
  au.email as auth_email
FROM public.system_admins sa
JOIN auth.users au ON au.id = sa.auth_user_id;

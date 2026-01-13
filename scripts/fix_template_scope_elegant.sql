-- Fix template scope for "אלגנט" (Elegant)
-- Choose ONE of the following options and run it in your DB (Supabase SQL editor / migration).
-- NOTE: I could not find the full UUID in this repo; if you have it, replace the LIKE with an exact UUID match.

-- Option A (recommended): make it GLOBAL (visible to all companies via company_id IS NULL)
update public.templates
set company_id = null
where id::text like 'e8e2737c%'
  and is_active = true;

-- Option B: make it belong to the user's company (company_id = 82974003...)
-- update public.templates
-- set company_id = '82974003-____-____-____-____________'::uuid
-- where id::text like 'e8e2737c%'
--   and is_active = true;

-- Verify
-- select id, name, company_id, is_active, is_default, document_type
-- from public.templates
-- where id::text like 'e8e2737c%';


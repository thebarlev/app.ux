-- ====================================================
-- Migration 024: Fix Receipt Template Scope + Default
-- ====================================================
-- Purpose:
-- 1) Ensure Admin templates intended for all customers are GLOBAL (company_id IS NULL)
-- 2) Ensure there is a valid default template for receipts so dashboard does not fall back
--
-- How to use:
-- 1) Run the diagnostic queries below to identify IDs.
-- 2) Set the variables (or replace placeholders) and run the UPDATEs.
--
-- IMPORTANT:
-- - This is a minimal data-fix migration. It does not change PDF rendering logic.
-- - Do NOT run with placeholder IDs.

-- ====================
-- Step 1: Diagnostics
-- ====================

-- Active receipt templates (what exists)
select id, name, is_active, document_type, company_id, is_default, created_at
from public.templates
where is_active = true and document_type = 'receipt'
order by company_id nulls first, created_at desc;

-- Scope view (GLOBAL vs COMPANY)
select
  id,
  name,
  case when company_id is null then 'GLOBAL' else 'COMPANY' end as scope,
  company_id,
  is_default
from public.templates
where is_active = true and document_type = 'receipt'
order by scope, is_default desc, created_at desc;

-- ====================
-- Step 2A: Make a template GLOBAL (company_id = NULL)
-- ====================
-- Replace TEMPLATE_ID_TO_MAKE_GLOBAL with the actual UUID.
-- Example:
-- update public.templates set company_id = null where id = '...';

-- update public.templates
-- set company_id = null
-- where id = 'TEMPLATE_ID_TO_MAKE_GLOBAL';

-- ====================
-- Step 2B: Assign a template to a specific company
-- ====================
-- Replace TEMPLATE_ID_TO_ASSIGN and USER_COMPANY_ID with actual UUIDs.

-- update public.templates
-- set company_id = 'USER_COMPANY_ID'
-- where id = 'TEMPLATE_ID_TO_ASSIGN';

-- ====================
-- Step 3: Ensure a DEFAULT (avoid fallback)
-- ====================
-- Choose ONE GLOBAL receipt template to be the default and unset other GLOBAL defaults.
-- Replace GLOBAL_DEFAULT_TEMPLATE_ID with the chosen UUID.

-- update public.templates
-- set is_default = false
-- where document_type = 'receipt'
--   and company_id is null
--   and id <> 'GLOBAL_DEFAULT_TEMPLATE_ID';

-- update public.templates
-- set is_default = true
-- where id = 'GLOBAL_DEFAULT_TEMPLATE_ID';

-- Optional: sanity check - no duplicate defaults per scope
select
  document_type,
  company_id,
  count(*) as default_count,
  string_agg(name, ', ' order by name) as template_names
from public.templates
where is_active = true and is_default = true
group by document_type, company_id
having count(*) > 1;


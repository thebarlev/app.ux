-- Migration 022: Fix Template Update RLS Policy
-- תיקון: אפשר למשתמשים לעדכן is_default של global templates
-- ====================================================================

-- Problem: Users couldn't select global templates as default because
-- the RLS policy blocked updates to templates with company_id IS NULL

-- Drop the old restrictive policy
DROP POLICY IF EXISTS templates_update ON public.templates;

-- Create new policy allowing updates to both company templates AND global templates
CREATE POLICY templates_update ON public.templates
  FOR UPDATE
  USING (
    company_id IN (SELECT public.user_company_ids())  -- Own company templates
    OR company_id IS NULL                              -- Global templates (for is_default)
  )
  WITH CHECK (
    company_id IN (SELECT public.user_company_ids())
    OR company_id IS NULL
  );

COMMENT ON POLICY templates_update ON public.templates IS 
  'Users can update their company templates and set is_default on global templates';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Template update policy fixed!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Users can now select global templates as default';
END $$;

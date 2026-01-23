-- ====================================================
-- Fix Templates RLS for Admin Global Templates
-- ====================================================
-- Date: January 1, 2026
-- Purpose: Allow system admins to create global templates (company_id = NULL)
-- ====================================================

-- Drop existing policies
DROP POLICY IF EXISTS templates_insert ON public.templates;
DROP POLICY IF EXISTS templates_update ON public.templates;
DROP POLICY IF EXISTS templates_delete ON public.templates;

-- INSERT: Admins can create global templates, users can create company templates
CREATE POLICY templates_insert ON public.templates
  FOR INSERT
  WITH CHECK (
    -- Admin creating global template (company_id = NULL)
    (
      company_id IS NULL 
      AND EXISTS (
        SELECT 1 FROM public.system_admins
        WHERE auth_user_id = auth.uid()
      )
    )
    OR
    -- User creating company template
    (
      company_id IS NOT NULL
      AND company_id IN (SELECT public.user_company_ids())
    )
  );

-- UPDATE: Admins can update global templates, users can update company templates
CREATE POLICY templates_update ON public.templates
  FOR UPDATE
  USING (
    -- Admin can update global templates
    (
      company_id IS NULL 
      AND EXISTS (
        SELECT 1 FROM public.system_admins
        WHERE auth_user_id = auth.uid()
      )
    )
    OR
    -- User can update their company's templates
    (
      company_id IS NOT NULL
      AND company_id IN (SELECT public.user_company_ids())
    )
  )
  WITH CHECK (
    -- Same check for the new values
    (
      company_id IS NULL 
      AND EXISTS (
        SELECT 1 FROM public.system_admins
        WHERE auth_user_id = auth.uid()
      )
    )
    OR
    (
      company_id IS NOT NULL
      AND company_id IN (SELECT public.user_company_ids())
    )
  );

-- DELETE: Admins can delete global templates, users can delete company templates
CREATE POLICY templates_delete ON public.templates
  FOR DELETE
  USING (
    -- Admin can delete global templates
    (
      company_id IS NULL 
      AND EXISTS (
        SELECT 1 FROM public.system_admins
        WHERE auth_user_id = auth.uid()
      )
    )
    OR
    -- User can delete their company's templates
    (
      company_id IS NOT NULL
      AND company_id IN (SELECT public.user_company_ids())
    )
  );

-- Success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Templates RLS fixed for admins!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Admins can now create/edit/delete global templates (company_id = NULL)';
  RAISE NOTICE 'Users can still only manage their company templates';
END $$;

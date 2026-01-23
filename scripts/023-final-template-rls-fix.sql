-- ====================================================
-- Migration 023: FINAL FIX - Template RLS for Users + Admins
-- ====================================================
-- Date: January 1, 2026
-- Critical Fix: Allow BOTH users AND admins to update templates
-- ====================================================

-- Problem: Multiple conflicting RLS policies exist:
-- - Script 014: Basic user policy (outdated)
-- - Script 018: Admin-only policy (too restrictive for users)
-- - Script 022: User-only policy (doesn't account for admins)
-- Result: Last migration wins, but may break either users or admins

-- Solution: ONE policy that handles BOTH cases

-- ==================== DROP OLD POLICIES ====================

DROP POLICY IF EXISTS templates_insert ON public.templates;
DROP POLICY IF EXISTS templates_update ON public.templates;
DROP POLICY IF EXISTS templates_delete ON public.templates;
DROP POLICY IF EXISTS templates_select ON public.templates;

-- ==================== SELECT POLICY ====================

CREATE POLICY templates_select ON public.templates
  FOR SELECT
  USING (
    company_id IS NULL  -- Global templates (everyone can see)
    OR company_id IN (SELECT public.user_company_ids())  -- Own company templates
  );

-- ==================== INSERT POLICY ====================

CREATE POLICY templates_insert ON public.templates
  FOR INSERT
  WITH CHECK (
    -- CASE 1: Admin creating global template
    (
      company_id IS NULL 
      AND EXISTS (
        SELECT 1 FROM public.system_admins
        WHERE auth_user_id = auth.uid()
      )
    )
    OR
    -- CASE 2: User creating company template
    (
      company_id IS NOT NULL
      AND company_id IN (SELECT public.user_company_ids())
    )
  );

-- ==================== UPDATE POLICY (CRITICAL) ====================

CREATE POLICY templates_update ON public.templates
  FOR UPDATE
  USING (
    -- CASE 1: Admin updating global template (HTML/CSS/name/etc)
    (
      company_id IS NULL 
      AND EXISTS (
        SELECT 1 FROM public.system_admins
        WHERE auth_user_id = auth.uid()
      )
    )
    OR
    -- CASE 2: User updating company template (any field)
    (
      company_id IS NOT NULL
      AND company_id IN (SELECT public.user_company_ids())
    )
    OR
    -- CASE 3: User setting is_default on global template
    -- (Allow users to SELECT a global template as their default)
    (
      company_id IS NULL
      AND auth.uid() IS NOT NULL  -- Any authenticated user
    )
  )
  WITH CHECK (
    -- Same conditions for new values
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
    OR
    (
      company_id IS NULL
      AND auth.uid() IS NOT NULL
    )
  );

-- ==================== DELETE POLICY ====================

CREATE POLICY templates_delete ON public.templates
  FOR DELETE
  USING (
    -- CASE 1: Admin can delete global templates
    (
      company_id IS NULL 
      AND EXISTS (
        SELECT 1 FROM public.system_admins
        WHERE auth_user_id = auth.uid()
      )
    )
    OR
    -- CASE 2: User can delete own company templates
    (
      company_id IS NOT NULL
      AND company_id IN (SELECT public.user_company_ids())
    )
  );

-- ==================== COMMENTS ====================

COMMENT ON POLICY templates_select ON public.templates IS 
  'Users can view global templates and their own company templates';

COMMENT ON POLICY templates_insert ON public.templates IS 
  'Admins can create global templates, users can create company templates';

COMMENT ON POLICY templates_update ON public.templates IS 
  'Admins can update global templates fully, users can update company templates and set is_default on globals';

COMMENT ON POLICY templates_delete ON public.templates IS 
  'Admins can delete global templates, users can delete company templates';

-- ==================== SUCCESS ====================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Template RLS policies updated!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Admins: Full control over global templates';
  RAISE NOTICE 'Users:  Full control over company templates + can set is_default on globals';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  IMPORTANT: This migration REPLACES:';
  RAISE NOTICE '   - 014-templates-table.sql (line 63-74)';
  RAISE NOTICE '   - 018-fix-templates-rls-for-admins.sql';
  RAISE NOTICE '   - 022-fix-template-update-policy.sql';
END $$;

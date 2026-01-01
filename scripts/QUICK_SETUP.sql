-- ====================================================
-- QUICK SETUP - סקריפט מהיר להשלמת ההתקנה
-- ====================================================
-- הריץ את זה אם הטבלאות כבר קיימות
-- זה יוסיף רק מה שחסר!
-- ====================================================

-- Step 1: הוספת עמודות חסרות (אם צריך)
DO $$
BEGIN
  -- הוסף payment_metadata אם לא קיים
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'document_line_items' 
    AND column_name = 'payment_metadata'
  ) THEN
    ALTER TABLE public.document_line_items
    ADD COLUMN payment_metadata JSONB DEFAULT '{}'::jsonb;
    
    CREATE INDEX IF NOT EXISTS idx_line_items_payment_metadata 
    ON public.document_line_items USING gin (payment_metadata);
    
    RAISE NOTICE '✅ Added payment_metadata column';
  ELSE
    RAISE NOTICE '⏭️  payment_metadata already exists';
  END IF;
END $$;

-- Step 2: וידוא שיש פונקציית user_company_ids
CREATE OR REPLACE FUNCTION public.user_company_ids()
RETURNS TABLE(company_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Return companies where user is a member
  RETURN QUERY
  SELECT cm.company_id
  FROM public.company_members cm
  WHERE cm.user_id = auth.uid();
  
  -- Also return companies where user is the owner
  RETURN QUERY
  SELECT c.id
  FROM public.companies c
  WHERE c.auth_user_id = auth.uid();
END;
$$;

COMMENT ON FUNCTION public.user_company_ids() IS 'Returns all company IDs the current user has access to';

-- Step 3: וידוא שיש פונקציית generate_document_number
CREATE OR REPLACE FUNCTION public.generate_document_number(
  p_company_id uuid,
  p_document_type text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_number integer;
  v_prefix text;
  v_formatted_number text;
BEGIN
  -- Get and increment the current number atomically
  UPDATE public.document_sequences
  SET current_number = current_number + 1
  WHERE company_id = p_company_id
    AND document_type = p_document_type
  RETURNING current_number, prefix INTO v_current_number, v_prefix;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sequence not found for company % and document type %', p_company_id, p_document_type;
  END IF;

  -- Format: prefix + number (e.g., "9", "10", "11" - no leading zeros)
  v_formatted_number := COALESCE(v_prefix, '') || v_current_number::text;

  RETURN v_formatted_number;
END;
$$;

COMMENT ON FUNCTION public.generate_document_number(uuid, text) IS 'Atomically generates and returns the next document number without leading zeros';

-- Step 4: הפעלת RLS על כל הטבלאות
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN 
    SELECT tablename 
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
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    RAISE NOTICE '✅ Enabled RLS on %', tbl;
  END LOOP;
END $$;

-- Step 5: יצירת Policies (רק אם לא קיימות)

-- Companies policies
DO $$
BEGIN
  DROP POLICY IF EXISTS companies_select ON public.companies;
  CREATE POLICY companies_select ON public.companies
    FOR SELECT
    USING (
      id IN (SELECT public.user_company_ids())
      OR auth_user_id = auth.uid()
    );

  DROP POLICY IF EXISTS companies_insert ON public.companies;
  CREATE POLICY companies_insert ON public.companies
    FOR INSERT
    WITH CHECK (auth_user_id = auth.uid());

  DROP POLICY IF EXISTS companies_update ON public.companies;
  CREATE POLICY companies_update ON public.companies
    FOR UPDATE
    USING (
      id IN (SELECT public.user_company_ids())
      OR auth_user_id = auth.uid()
    )
    WITH CHECK (
      id IN (SELECT public.user_company_ids())
      OR auth_user_id = auth.uid()
    );

  RAISE NOTICE '✅ Created policies for companies';
END $$;

-- Company Members policies
DO $$
BEGIN
  DROP POLICY IF EXISTS company_members_select ON public.company_members;
  CREATE POLICY company_members_select ON public.company_members
    FOR SELECT
    USING (
      company_id IN (SELECT public.user_company_ids())
      OR user_id = auth.uid()
    );

  DROP POLICY IF EXISTS company_members_insert ON public.company_members;
  CREATE POLICY company_members_insert ON public.company_members
    FOR INSERT
    WITH CHECK (
      company_id IN (SELECT public.user_company_ids())
      OR user_id = auth.uid()
    );

  DROP POLICY IF EXISTS company_members_update ON public.company_members;
  CREATE POLICY company_members_update ON public.company_members
    FOR UPDATE
    USING (
      company_id IN (SELECT public.user_company_ids())
      OR user_id = auth.uid()
    );

  DROP POLICY IF EXISTS company_members_delete ON public.company_members;
  CREATE POLICY company_members_delete ON public.company_members
    FOR DELETE
    USING (
      company_id IN (SELECT public.user_company_ids())
    );

  RAISE NOTICE '✅ Created policies for company_members';
END $$;

-- Customers policies
DO $$
BEGIN
  DROP POLICY IF EXISTS customers_select ON public.customers;
  CREATE POLICY customers_select ON public.customers
    FOR SELECT
    USING (company_id IN (SELECT public.user_company_ids()));

  DROP POLICY IF EXISTS customers_insert ON public.customers;
  CREATE POLICY customers_insert ON public.customers
    FOR INSERT
    WITH CHECK (company_id IN (SELECT public.user_company_ids()));

  DROP POLICY IF EXISTS customers_update ON public.customers;
  CREATE POLICY customers_update ON public.customers
    FOR UPDATE
    USING (company_id IN (SELECT public.user_company_ids()));

  DROP POLICY IF EXISTS customers_delete ON public.customers;
  CREATE POLICY customers_delete ON public.customers
    FOR DELETE
    USING (company_id IN (SELECT public.user_company_ids()));

  RAISE NOTICE '✅ Created policies for customers';
END $$;

-- Documents policies
DO $$
BEGIN
  DROP POLICY IF EXISTS documents_select ON public.documents;
  CREATE POLICY documents_select ON public.documents
    FOR SELECT
    USING (company_id IN (SELECT public.user_company_ids()));

  DROP POLICY IF EXISTS documents_insert ON public.documents;
  CREATE POLICY documents_insert ON public.documents
    FOR INSERT
    WITH CHECK (company_id IN (SELECT public.user_company_ids()));

  DROP POLICY IF EXISTS documents_update ON public.documents;
  CREATE POLICY documents_update ON public.documents
    FOR UPDATE
    USING (
      company_id IN (SELECT public.user_company_ids())
      AND document_status = 'draft'
    )
    WITH CHECK (
      company_id IN (SELECT public.user_company_ids())
    );

  DROP POLICY IF EXISTS documents_delete ON public.documents;
  CREATE POLICY documents_delete ON public.documents
    FOR DELETE
    USING (
      company_id IN (SELECT public.user_company_ids())
      AND document_status = 'draft'
    );

  RAISE NOTICE '✅ Created policies for documents';
END $$;

-- Document Line Items policies
DO $$
BEGIN
  DROP POLICY IF EXISTS line_items_select ON public.document_line_items;
  CREATE POLICY line_items_select ON public.document_line_items
    FOR SELECT
    USING (company_id IN (SELECT public.user_company_ids()));

  DROP POLICY IF EXISTS line_items_insert ON public.document_line_items;
  CREATE POLICY line_items_insert ON public.document_line_items
    FOR INSERT
    WITH CHECK (company_id IN (SELECT public.user_company_ids()));

  DROP POLICY IF EXISTS line_items_update ON public.document_line_items;
  CREATE POLICY line_items_update ON public.document_line_items
    FOR UPDATE
    USING (company_id IN (SELECT public.user_company_ids()))
    WITH CHECK (company_id IN (SELECT public.user_company_ids()));

  DROP POLICY IF EXISTS line_items_delete ON public.document_line_items;
  CREATE POLICY line_items_delete ON public.document_line_items
    FOR DELETE
    USING (company_id IN (SELECT public.user_company_ids()));

  RAISE NOTICE '✅ Created policies for document_line_items';
END $$;

-- Document Sequences policies
DO $$
BEGIN
  DROP POLICY IF EXISTS sequences_select ON public.document_sequences;
  CREATE POLICY sequences_select ON public.document_sequences
    FOR SELECT
    USING (company_id IN (SELECT public.user_company_ids()));

  DROP POLICY IF EXISTS sequences_insert ON public.document_sequences;
  CREATE POLICY sequences_insert ON public.document_sequences
    FOR INSERT
    WITH CHECK (company_id IN (SELECT public.user_company_ids()));

  DROP POLICY IF EXISTS sequences_update ON public.document_sequences;
  CREATE POLICY sequences_update ON public.document_sequences
    FOR UPDATE
    USING (company_id IN (SELECT public.user_company_ids()))
    WITH CHECK (company_id IN (SELECT public.user_company_ids()));

  RAISE NOTICE '✅ Created policies for document_sequences';
END $$;

-- ====================================================
-- סיום - הדפסת סיכום
-- ====================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ SETUP COMPLETE!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Create a user account (Sign Up)';
  RAISE NOTICE '2. Run SETUP_USER.sql to link user to company';
  RAISE NOTICE '========================================';
END $$;

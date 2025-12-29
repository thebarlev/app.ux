-- =====================================================
-- ADD LOGO AND BUSINESS DETAILS TO COMPANIES TABLE
-- =====================================================

-- Add new columns for business details and logo
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS registration_number TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS website TEXT;

-- Add partnership to business_type options
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_business_type_check;
ALTER TABLE public.companies ADD CONSTRAINT companies_business_type_check 
  CHECK (business_type IN ('osek_patur', 'osek_murshe', 'ltd', 'partnership', 'other'));

-- Create index for logo lookups
CREATE INDEX IF NOT EXISTS idx_companies_logo_url ON public.companies(id) WHERE logo_url IS NOT NULL;

COMMENT ON COLUMN public.companies.logo_url IS 'Public URL of company logo from Supabase Storage (business-logos/{company_id}/logo.png)';
COMMENT ON COLUMN public.companies.registration_number IS 'Business registration number (תז / חפ)';
COMMENT ON COLUMN public.companies.address IS 'Full business address';
COMMENT ON COLUMN public.companies.phone IS 'Business landline phone';
COMMENT ON COLUMN public.companies.website IS 'Company website URL';

-- Migration: Add Registration Flow Fields to Companies Table
-- Date: 2025-12-28
-- Description: Adds fields collected during business registration

-- Add new columns for complete business registration data
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS company_number TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS custom_industry TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS street TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS postal_code TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.companies.company_number IS 'מספר חברה / תעודת זהות - נאסף בהרשמה';
COMMENT ON COLUMN public.companies.industry IS 'תחום פעילות (retail, services, tech, etc.)';
COMMENT ON COLUMN public.companies.custom_industry IS 'תחום פעילות מותאם אישית (כאשר בוחרים "אחר")';
COMMENT ON COLUMN public.companies.street IS 'רחוב ומספר בית';
COMMENT ON COLUMN public.companies.city IS 'עיר - טקסט חופשי';
COMMENT ON COLUMN public.companies.postal_code IS 'מיקוד';

-- Note: Existing users will have NULL in these fields
-- They can complete this information via Settings page

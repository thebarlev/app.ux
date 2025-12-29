-- Migration: Expand Customers Fields for Full CRM
-- Date: 2025-12-29
-- Description: Add missing fields for comprehensive customer management

-- Add missing contact and identification fields
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tax_id TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS profession TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS phone_secondary TEXT;

-- Enhance address fields
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address_number TEXT;

-- Add accounting fields
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS payment_terms_text TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS external_account_key TEXT;

-- Add bank account fields
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS bank_branch TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS bank_account TEXT;

-- Add comments for new fields
COMMENT ON COLUMN public.customers.tax_id IS 'מספר עוסק (ת.ז / ח.פ)';
COMMENT ON COLUMN public.customers.profession IS 'עיסוק ומקצוע';
COMMENT ON COLUMN public.customers.contact_person IS 'איש קשר';
COMMENT ON COLUMN public.customers.phone_secondary IS 'טלפון נוסף';
COMMENT ON COLUMN public.customers.address_number IS 'מספר בית';
COMMENT ON COLUMN public.customers.payment_terms_text IS 'תנאי תשלום (טקסט)';
COMMENT ON COLUMN public.customers.external_account_key IS 'מפתח לקוח (חשבשבת וכו)';
COMMENT ON COLUMN public.customers.bank_name IS 'שם הבנק';
COMMENT ON COLUMN public.customers.bank_branch IS 'מספר סניף';
COMMENT ON COLUMN public.customers.bank_account IS 'מספר חשבון';

-- Add index on tax_id for faster lookup
CREATE INDEX IF NOT EXISTS idx_customers_tax_id ON public.customers(company_id, tax_id) WHERE tax_id IS NOT NULL;

-- Add index on external_account_key
CREATE INDEX IF NOT EXISTS idx_customers_external_key ON public.customers(company_id, external_account_key) WHERE external_account_key IS NOT NULL;

-- Verification query
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'customers'
-- ORDER BY ordinal_position;

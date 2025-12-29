-- Migration: Create Customers Table
-- Date: 2025-12-28
-- Description: Creates customers table for managing business customers

-- Create customers table
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  
  -- Basic Info
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  mobile_phone TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT customers_name_not_empty CHECK (char_length(name) > 0)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_customers_company_id ON public.customers(company_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for customers table
-- SELECT: Users can view customers from their companies
DROP POLICY IF EXISTS customers_select ON public.customers;
CREATE POLICY customers_select ON public.customers
  FOR SELECT
  USING (company_id IN (SELECT public.user_company_ids()));

-- INSERT: Users can create customers for their companies
DROP POLICY IF EXISTS customers_insert ON public.customers;
CREATE POLICY customers_insert ON public.customers
  FOR INSERT
  WITH CHECK (company_id IN (SELECT public.user_company_ids()));

-- UPDATE: Users can update customers from their companies
DROP POLICY IF EXISTS customers_update ON public.customers;
CREATE POLICY customers_update ON public.customers
  FOR UPDATE
  USING (company_id IN (SELECT public.user_company_ids()));

-- DELETE: Users can delete customers from their companies
DROP POLICY IF EXISTS customers_delete ON public.customers;
CREATE POLICY customers_delete ON public.customers
  FOR DELETE
  USING (company_id IN (SELECT public.user_company_ids()));

-- Add comments
COMMENT ON TABLE public.customers IS 'Customer/client records for each company';
COMMENT ON COLUMN public.customers.name IS 'Customer name (person or business)';
COMMENT ON COLUMN public.customers.email IS 'Customer email address';
COMMENT ON COLUMN public.customers.phone IS 'Primary phone number';
COMMENT ON COLUMN public.customers.mobile_phone IS 'Mobile phone number';

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_customers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customers_updated_at_trigger ON public.customers;
CREATE TRIGGER customers_updated_at_trigger
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION update_customers_updated_at();

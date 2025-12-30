-- Add signature_url field to companies table
-- Date: December 30, 2025
-- Purpose: Allow business owners to upload their signature for documents

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS signature_url TEXT;

COMMENT ON COLUMN public.companies.signature_url IS 'URL to uploaded signature image stored in Supabase Storage';

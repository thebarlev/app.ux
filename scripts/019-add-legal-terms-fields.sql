-- Migration: Add Legal Terms and Marketing Acceptance Fields to Companies Table
-- Date: 2025-01-14
-- Description: Adds fields to track user acceptance of legal terms and marketing communications

-- Add new columns for legal terms and marketing acceptance
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS accepted_legal_terms BOOLEAN DEFAULT FALSE;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS accepted_legal_terms_at TIMESTAMPTZ;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS accepted_marketing BOOLEAN DEFAULT FALSE;

-- Add comments for documentation
COMMENT ON COLUMN public.companies.accepted_legal_terms IS 'Whether user accepted legal terms during registration';
COMMENT ON COLUMN public.companies.accepted_legal_terms_at IS 'Timestamp when user accepted legal terms (if accepted)';
COMMENT ON COLUMN public.companies.accepted_marketing IS 'Whether user opted in to receive marketing communications';

-- Add default global setting for requiring legal terms acceptance
INSERT INTO public.global_settings (setting_key, setting_value)
VALUES ('require_legal_terms_acceptance_on_signup', 'false')
ON CONFLICT (setting_key) DO NOTHING;

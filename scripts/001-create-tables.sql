-- System Owner Admin Panel Database Schema

-- Companies table (main business entities)
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  business_type TEXT CHECK (business_type IN ('osek_patur', 'osek_murshe', 'ltd', 'other')),
  tax_id TEXT,
  contact_first_name TEXT NOT NULL,
  contact_full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  mobile_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Documents/Invoices table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_number TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'tax_invoice',
    'invoice_receipt',
    'receipt',
    'quote',
    'proforma',
    'work_order',
    'delivery_note',
    'return_note',
    'purchase_order',
    'self_invoice',
    'self_credit_note',
    'credit_invoice',
    'credit_note'
  )),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'canceled')),
  is_goal_marked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- System admins table (for admin panel access)
CREATE TABLE system_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'SYSTEM_ADMIN' CHECK (role = 'SYSTEM_ADMIN'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Global settings table
CREATE TABLE global_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES system_admins(id)
);

-- Insert default global settings
INSERT INTO global_settings (setting_key, setting_value) VALUES
  ('default_vat_rate', '18'),
  ('document_footer_line_1', ''),
  ('document_footer_line_2', ''),
  ('document_footer_line_3', '');

-- Create indexes for performance
CREATE INDEX idx_companies_status ON companies(status);
CREATE INDEX idx_companies_created_at ON companies(created_at);
CREATE INDEX idx_companies_email ON companies(email);
CREATE INDEX idx_documents_company_id ON documents(company_id);
CREATE INDEX idx_documents_issue_date ON documents(issue_date);
CREATE INDEX idx_system_admins_auth_user_id ON system_admins(auth_user_id);

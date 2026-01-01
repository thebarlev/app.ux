/**
 * Template System Types
 * 
 * Defines all types for the document template system including:
 * - Template definitions (HTML + CSS)
 * - Template data (placeholders for rendering)
 * - PDF generation options
 */

// ============================================
// Template Definition Types
// ============================================

export type DocumentType = 'receipt' | 'invoice' | 'quote' | 'delivery_note' | 'credit_invoice';

export interface TemplateDefinition {
  id: string;
  company_id: string | null; // null = global template
  name: string;
  description: string | null;
  document_type: DocumentType;
  html_template: string; // Handlebars template
  css: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// ============================================
// Template Data Types (for rendering)
// ============================================

export interface CompanyData {
  company_name: string;
  company_tax_id?: string | null;
  company_number?: string | null;
  company_address?: string | null;
  company_phone?: string | null;
  company_mobile_phone?: string | null;
  company_email?: string | null;
  company_website?: string | null;
  company_logo?: string | null; // URL to logo
}

export interface CustomerData {
  customer_name: string;
  customer_tax_id?: string | null;
  customer_address?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
}

export interface DocumentData {
  document_number: string;
  document_date: string; // YYYY-MM-DD
  reference_number?: string | null;
  document_type: DocumentType;
}

export interface PaymentItem {
  method: string;
  date: string;
  amount: number;
  currency: string;
  reference?: string | null;
  // Extended payment details (stored in payment_metadata JSONB)
  bank_name?: string;
  branch?: string;
  account_number?: string;
  check_number?: string;
  card_last4?: string;
  transaction_id?: string;
  description?: string;
}

export interface LineItem {
  description: string;
  quantity?: number;
  unit_price?: number;
  amount: number;
  tax_rate?: number;
  notes?: string;
}

export interface TotalsData {
  subtotal: number;
  discount?: number;
  vat_rate?: number;
  vat_amount?: number;
  total_amount: number;
  currency: string;
}

export interface NotesData {
  notes?: string | null; // General notes
  footer_notes?: string | null; // Footer text
  signature?: string | null; // URL to signature image
}

/**
 * Complete data structure for rendering a receipt/invoice template
 */
export interface ReceiptTemplateData {
  // Company info
  company: CompanyData;
  
  // Customer info
  customer: CustomerData;
  
  // Document info
  document: DocumentData;
  
  // Payments table
  payments: PaymentItem[];
  payments_table?: string; // Pre-rendered HTML for payments table rows
  payments_table_simple?: string; // Simplified version
  
  // Line items (for invoices/quotes)
  items?: LineItem[];
  items_table?: string; // Pre-rendered HTML for items table rows
  
  // Totals
  totals: TotalsData;
  
  // Notes and signature
  notes_data: NotesData;
  
  // Formatted values for display
  formatted_total?: string; // e.g., "1,234.56 ₪"
  formatted_date?: string; // e.g., "01/01/2026"
}

// ============================================
// PDF Generation Types
// ============================================

export interface PDFGenerationOptions {
  format?: 'A4' | 'Letter';
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  printBackground?: boolean;
  preferCSSPageSize?: boolean;
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
}

export interface PDFGenerationResult {
  success: boolean;
  buffer?: Buffer;
  path?: string; // Path in Supabase Storage
  error?: string;
}

// ============================================
// Template Placeholders (for Admin UI)
// ============================================

export interface TemplatePlaceholder {
  category: string;
  placeholders: {
    name: string;
    description: string;
    example: string;
    is_raw_html?: boolean; // true for {{{ triple braces }}}
  }[];
}

export const TEMPLATE_PLACEHOLDERS: TemplatePlaceholder[] = [
  {
    category: 'Company',
    placeholders: [
      { name: '{{company_name}}', description: 'Company name', example: 'Tech Solutions Ltd' },
      { name: '{{company_tax_id}}', description: 'Tax ID / VAT number', example: '123456789' },
      { name: '{{company_address}}', description: 'Full address', example: 'Rothschild 1, Tel Aviv' },
      { name: '{{company_phone}}', description: 'Phone number', example: '03-1234567' },
      { name: '{{company_email}}', description: 'Email address', example: 'info@company.com' },
      { name: '{{company_logo}}', description: 'Logo URL', example: 'https://...', is_raw_html: true },
    ],
  },
  {
    category: 'Customer',
    placeholders: [
      { name: '{{customer_name}}', description: 'Customer name', example: 'John Doe' },
      { name: '{{customer_tax_id}}', description: 'Customer tax ID', example: '987654321' },
      { name: '{{customer_address}}', description: 'Customer address', example: 'Dizengoff 100' },
      { name: '{{customer_phone}}', description: 'Customer phone', example: '054-1234567' },
      { name: '{{customer_email}}', description: 'Customer email', example: 'john@example.com' },
    ],
  },
  {
    category: 'Document',
    placeholders: [
      { name: '{{document_number}}', description: 'Document number', example: '42' },
      { name: '{{document_date}}', description: 'Document date', example: '2026-01-01' },
      { name: '{{reference_number}}', description: 'Reference/PO number', example: 'PO-2026-001' },
    ],
  },
  {
    category: 'Tables (Raw HTML)',
    placeholders: [
      { name: '{{{payments_table}}}', description: 'Payment rows (inject inside <tbody>)', example: '<tr>...</tr>', is_raw_html: true },
      { name: '{{{payments_table_simple}}}', description: 'Simplified payment table', example: '<tr>...</tr>', is_raw_html: true },
      { name: '{{{items_table}}}', description: 'Line item rows (inject inside <tbody>)', example: '<tr>...</tr>', is_raw_html: true },
    ],
  },
  {
    category: 'Totals',
    placeholders: [
      { name: '{{subtotal}}', description: 'Subtotal before tax', example: '1000.00' },
      { name: '{{discount}}', description: 'Discount amount', example: '50.00' },
      { name: '{{vat_rate}}', description: 'VAT/Tax rate %', example: '17' },
      { name: '{{vat_amount}}', description: 'VAT/Tax amount', example: '161.50' },
      { name: '{{total_amount}}', description: 'Total amount', example: '1111.50' },
      { name: '{{currency}}', description: 'Currency symbol', example: '₪' },
      { name: '{{formatted_total}}', description: 'Formatted total with currency', example: '1,111.50 ₪' },
    ],
  },
  {
    category: 'Notes & Signature',
    placeholders: [
      { name: '{{{notes}}}', description: 'General notes (can contain HTML)', example: '<p>Thank you!</p>', is_raw_html: true },
      { name: '{{{footer_notes}}}', description: 'Footer text', example: '<p>Payment terms...</p>', is_raw_html: true },
      { name: '{{{signature}}}', description: 'Signature image HTML', example: '<img src="..." />', is_raw_html: true },
    ],
  },
];

// ============================================
// Validation Types
// ============================================

export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  missing_required_placeholders?: string[];
}

export interface TemplateValidationRules {
  document_type: DocumentType;
  required_placeholders: string[];
  recommended_placeholders: string[];
}

export const TEMPLATE_VALIDATION_RULES: Record<DocumentType, TemplateValidationRules> = {
  receipt: {
    document_type: 'receipt',
    required_placeholders: ['{{document_number}}', '{{document_date}}', '{{total_amount}}'],
    recommended_placeholders: ['{{company_name}}', '{{customer_name}}', '{{{payments_table}}}'],
  },
  invoice: {
    document_type: 'invoice',
    required_placeholders: ['{{document_number}}', '{{document_date}}', '{{total_amount}}', '{{{items_table}}}'],
    recommended_placeholders: ['{{company_name}}', '{{customer_name}}', '{{vat_amount}}'],
  },
  quote: {
    document_type: 'quote',
    required_placeholders: ['{{document_number}}', '{{document_date}}', '{{{items_table}}}'],
    recommended_placeholders: ['{{company_name}}', '{{customer_name}}'],
  },
  delivery_note: {
    document_type: 'delivery_note',
    required_placeholders: ['{{document_number}}', '{{document_date}}', '{{{items_table}}}'],
    recommended_placeholders: ['{{company_name}}', '{{customer_name}}'],
  },
  credit_invoice: {
    document_type: 'credit_invoice',
    required_placeholders: ['{{document_number}}', '{{document_date}}', '{{total_amount}}'],
    recommended_placeholders: ['{{company_name}}', '{{customer_name}}', '{{reference_number}}'],
  },
};

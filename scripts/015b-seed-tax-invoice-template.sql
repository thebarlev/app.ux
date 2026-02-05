-- ====================================================
-- Seed Default Tax-Invoice Template (Admin source of truth)
-- ====================================================
-- Purpose:
-- - Fix TEMPLATE_NOT_FOUND by ensuring there is at least one ACTIVE template
--   mapped to tax_invoice / invoice_receipt in VOW (Admin Templates).
-- - IMPORTANT: This does NOT change the PDF engine. It only seeds DB data.
--
-- Compatibility:
-- - Some environments have a legacy CHECK constraint on templates.document_type
--   that may not include 'tax_invoice'. To stay compatible, this script inserts
--   the template row with document_type='invoice' (allowed), and uses the
--   junction table template_document_types to map it to:
--   - 'tax_invoice'
--   - 'invoice_receipt'
--
-- Run in Supabase SQL Editor after:
-- - scripts/014-templates-table.sql
-- - scripts/017-template-multi-document-types.sql (for template_document_types)
-- ====================================================

DO $$
DECLARE
  v_template_id uuid;
BEGIN
  -- 1) Insert template row (only if not already present by name)
  SELECT id INTO v_template_id
  FROM public.templates
  WHERE company_id IS NULL
    AND name = 'תבנית חשבונית מס (ברירת מחדל)';

  IF v_template_id IS NULL THEN
    INSERT INTO public.templates (
      company_id,
      name,
      description,
      document_type,
      html_template,
      css,
      is_default,
      is_active,
      created_by
    )
    VALUES (
      NULL,
      'תבנית חשבונית מס (ברירת מחדל)',
      'נוצר אוטומטית כדי לאפשר הפקה ללא fallback. ניתן לערוך באדמין.',
      'invoice',
      $HTML$
<div class="receipt-document" dir="{{document.direction}}">
  <div class="header">
    {{#if company.company_logo}}
    <img src="{{company.company_logo}}" alt="{{company.company_name}}" class="logo" />
    {{/if}}
    <div class="company-details">
      <h1>{{company.company_name}}</h1>
      {{#if company.company_tax_id}}<p>{{company.company_tax_id}}</p>{{/if}}
      {{#if company.company_address}}<p>{{company.company_address}}</p>{{/if}}
      {{#if company.company_phone}}<p>{{company.company_phone}}</p>{{/if}}
    </div>
  </div>

  <div class="document-info">
    <h2>{{document.document_type_label}} #{{document.document_number}}</h2>
    <p>{{formatted_date}}</p>
    {{#if description}}
    <p class="description">{{description}}</p>
    {{/if}}
  </div>

  {{#if customer.customer_name}}
  <div class="customer-section">
    <div class="customer-line">
      <span class="label">לכבוד</span>
      <span class="value">{{customer.customer_name}}</span>
    </div>
    {{#if customer.customer_phone}}
    <div class="customer-line">
      <span class="label">טלפון</span>
      <span class="value">{{customer.customer_phone}}</span>
    </div>
    {{/if}}
  </div>
  {{/if}}

  {{#if TI_ROWS_HTML}}
  <div class="payment-section">
    <h3>פירוט</h3>
    <table class="items-table">
      <thead>
        <tr>
          <th>כמות</th>
          <th>תיאור</th>
          <th>תאריך</th>
          <th>סכום</th>
        </tr>
      </thead>
      <tbody>
        {{{TI_ROWS_HTML}}}
      </tbody>
    </table>
  </div>
  {{/if}}

  {{#if PAYMENTS_ROWS_HTML}}
  <div class="payment-section">
    <h3>פירוט תקבולים</h3>
    <table class="payments-table">
      <thead>
        <tr>
          <th>אמצעי</th>
          <th>פרטים</th>
          <th>תאריך</th>
          <th>סכום</th>
        </tr>
      </thead>
      <tbody>
        {{{PAYMENTS_ROWS_HTML}}}
      </tbody>
    </table>
  </div>
  {{/if}}

  <div class="totals-section">
    <div class="total-row final">
      <span class="label"><strong>סה״כ</strong></span>
      <span class="value"><strong>{{formatted_total}}</strong></span>
    </div>
  </div>

  {{#if notes_data.notes}}
  <div class="notes-section">
    <h4>הערות</h4>
    <p>{{notes_data.notes}}</p>
  </div>
  {{/if}}

  {{#if notes_data.signature}}
  <div class="signature-section">
    <img src="{{notes_data.signature}}" alt="signature" class="signature" />
  </div>
  {{/if}}
</div>
$HTML$,
      $CSS$
.receipt-document {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px;
  font-family: 'Heebo', 'Arial', sans-serif;
  color: #1a1a1a;
  direction: inherit;
  text-align: start;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid #e5e7eb;
}

.logo {
  max-width: 150px;
  max-height: 80px;
  object-fit: contain;
}

.company-details h1 {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 8px;
  color: #111827;
}

.company-details p {
  font-size: 14px;
  color: #6b7280;
  margin: 4px 0;
}

.document-info {
  margin-bottom: 30px;
}

.document-info h2 {
  font-size: 28px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 12px;
}

.document-info p {
  font-size: 14px;
  color: #6b7280;
  margin: 4px 0;
}

.document-info .description {
  font-size: 15px;
  color: #374151;
  margin-top: 12px;
}

.customer-section {
  background-color: #f9fafb;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 30px;
}

.customer-section p {
  font-size: 14px;
  color: #374151;
  margin: 6px 0;
}

.items-table,
.payments-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 30px;
}

.items-table thead,
.payments-table thead {
  background-color: #f3f4f6;
}

.items-table th,
.payments-table th {
  padding: 12px 16px;
  text-align: right;
  font-weight: 600;
  font-size: 14px;
  color: #111827;
  border-bottom: 2px solid #e5e7eb;
}

.items-table td,
.payments-table td {
  padding: 12px 16px;
  text-align: right;
  font-size: 14px;
  color: #374151;
  border-bottom: 1px solid #e5e7eb;
}

.items-table tbody tr:hover,
.payments-table tbody tr:hover {
  background-color: #f9fafb;
}

.payment-section {
  margin-bottom: 30px;
}

.payment-section h3 {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
  color: #111827;
}

.totals-section {
  margin-top: 30px;
  padding: 20px;
  background-color: #f9fafb;
  border-radius: 8px;
}

.total-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 15px;
  color: #374151;
}

.signature-section {
  margin-top: 30px;
  text-align: left;
}

.signature {
  max-width: 200px;
  max-height: 80px;
  object-fit: contain;
}
$CSS$,
      TRUE,
      TRUE,
      NULL
    )
    RETURNING id INTO v_template_id;
  END IF;

  -- 2) Ensure mappings exist in template_document_types (required for tax_invoice/invoice_receipt resolution)
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'template_document_types'
  ) THEN
    RAISE EXCEPTION 'template_document_types table is missing. Run scripts/017-template-multi-document-types.sql first.';
  END IF;

  INSERT INTO public.template_document_types (template_id, document_type)
  SELECT v_template_id, x.document_type
  FROM (VALUES ('tax_invoice'::text), ('invoice_receipt'::text)) AS x(document_type)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.template_document_types tdt
    WHERE tdt.template_id = v_template_id
      AND tdt.document_type = x.document_type
  );

  RAISE NOTICE '✅ Seeded template_id=% for tax_invoice/invoice_receipt', v_template_id;
END $$;


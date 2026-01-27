/**
 * Default Templates - Client-safe (no Node.js dependencies)
 * Can be imported in Client Components
 */

/**
 * Get default receipt template (HTML + CSS)
 * This is a fallback template if no custom template is defined
 */
export function getDefaultReceiptTemplate(): { html: string; css: string } {
  const html = `
<div class="receipt-document" dir="{{document.direction}}">
  <!-- Header -->
  <div class="header">
    {{#if company.company_logo}}
    <img src="{{company.company_logo}}" alt="{{company.company_name}}" class="logo" />
    {{/if}}
    <div class="company-details">
      <h1>{{company.company_name}}</h1>
      {{#if company.company_tax_id}}
      <p>{{company.company_tax_id}}</p>
      {{/if}}
      {{#if company.company_address}}
      <p>{{company.company_address}}</p>
      {{/if}}
      {{#if company.company_phone}}
      <p>{{company.company_phone}}</p>
      {{/if}}
    </div>
  </div>

  <!-- Document title line -->
  <div class="document-info">
    <h2>{{t.receipt_title}} #{{document.document_number}}</h2>
    <p>{{t.receipt_issue_date_label}} {{formatted_date}} | {{TIME}}</p>
    {{#if description}}
    <p class="description">{{description}}</p>
    {{/if}}
  </div>

  <!-- Customer -->
  <div class="customer-section">
    <div class="customer-line">
      <span class="label">{{t.receipt_to_label}}</span>
      <span class="value">{{customer.customer_name}}</span>
    </div>
    {{#if customer.customer_phone}}
    <div class="customer-line">
      <span class="label">{{t.receipt_phone_label}}</span>
      <span class="value">{{customer.customer_phone}}</span>
    </div>
    {{/if}}
  </div>

  <!-- Payments -->
  {{#if payments}}
  {{#if (gt payments.length 0)}}
  <div class="payment-section">
    <h3>{{t.receipt_payment_details_title}}</h3>
    <table class="payments-table">
      <thead>
        <tr>
          <th>{{t.receipt_payment_method_label}}</th>
          <th>{{t.receipt_date_label}}</th>
          <th>{{t.receipt_amount_label}}</th>
        </tr>
      </thead>
      <tbody>
        {{#each payments}}
        <tr>
          <td>{{this.method}}</td>
          <td>{{this.display_date}}</td>
          <td>{{this.display_amount}}</td>
        </tr>
        {{/each}}
      </tbody>
    </table>
  </div>
  {{/if}}
  {{/if}}

  <!-- Total -->
  <div class="totals-section">
    <div class="total-row final">
      <span class="label"><strong>{{t.receipt_total_label}}</strong></span>
      <span class="value"><strong>{{formatted_total}}</strong></span>
    </div>
  </div>

  <!-- Notes -->
  {{#if notes_data.notes}}
  <div class="notes-section">
    <h4>{{t.receipt_internal_notes_label}}</h4>
    <p>{{notes_data.notes}}</p>
  </div>
  {{/if}}

  <!-- Signature -->
  {{#if notes_data.signature}}
  <div class="signature-section">
    <img src="{{notes_data.signature}}" alt="signature" class="signature" />
  </div>
  {{/if}}

  <!-- Footer -->
  <div class="footer">
    <p>{{t.receipt_footer_generated_text}}</p>
    <p>{{t.receipt_footer_print_date_label}} {{CURRENT_DATE_TIME}}</p>
  </div>
</div>
  `.trim()

  const css = `
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

.customer-section h3 {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #111827;
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

.total-row.discount {
  color: #dc2626;
}

.total-row.final {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 2px solid #e5e7eb;
  font-size: 18px;
  color: #111827;
}

.notes-section {
  margin-top: 30px;
  padding: 20px;
  background-color: #fef3c7;
  border-left: 4px solid #f59e0b;
  border-radius: 4px;
}

.notes-section h4 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #92400e;
}

.notes-section p {
  font-size: 14px;
  color: #78350f;
}

.signature-section {
  margin-top: 40px;
  text-align: center;
}

.signature-section p {
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 12px;
}

.signature {
  max-width: 200px;
  max-height: 80px;
  object-fit: contain;
}

.footer {
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid #e5e7eb;
  text-align: center;
}

.footer p {
  font-size: 13px;
  color: #9ca3af;
}

@media print {
  .receipt-document {
    padding: 20px;
  }
}
  `.trim()

  return { html, css }
}

/**
 * Generic default template for tax-invoice-like documents (and others).
 * Used ONLY as a last-resort fallback when DB templates are missing/invalid.
 */
export function getDefaultGenericDocumentTemplate(): { html: string; css: string } {
  const html = `
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
  `.trim()

  // Reuse the receipt CSS for consistent rendering
  const css = getDefaultReceiptTemplate().css
  return { html, css }
}

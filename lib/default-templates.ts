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
<div class="receipt-document">
  <!-- Header Section -->
  <div class="header">
    {{#if company.logo_url}}
    <img src="{{company.logo_url}}" alt="{{company.name}}" class="logo" />
    {{/if}}
    <div class="company-details">
      <h1>{{company.name}}</h1>
      {{#if company.tax_id}}
      <p>ח.פ: {{company.tax_id}}</p>
      {{/if}}
      {{#if company.address}}
      <p>{{company.address}}</p>
      {{/if}}
      {{#if company.phone}}
      <p>טלפון: {{company.phone}}</p>
      {{/if}}
    </div>
  </div>

  <!-- Document Info -->
  <div class="document-info">
    <h2>קבלה מס׳ {{document.number}}</h2>
    <p>תאריך הנפקה: {{formatDate document.issue_date}}</p>
    {{#if document.description}}
    <p class="description">{{document.description}}</p>
    {{/if}}
  </div>

  <!-- Customer Info -->
  {{#if customer}}
  <div class="customer-section">
    <h3>פרטי לקוח</h3>
    <p><strong>שם:</strong> {{customer.name}}</p>
    {{#if customer.tax_id}}
    <p><strong>ח.פ/ת.ז:</strong> {{customer.tax_id}}</p>
    {{/if}}
    {{#if customer.email}}
    <p><strong>אימייל:</strong> {{customer.email}}</p>
    {{/if}}
    {{#if customer.phone}}
    <p><strong>טלפון:</strong> {{customer.phone}}</p>
    {{/if}}
  </div>
  {{/if}}

  <!-- Line Items Table -->
  {{#if items}}
  {{#if (gt items.length 0)}}
  <table class="items-table">
    <thead>
      <tr>
        <th>פריט</th>
        <th>כמות</th>
        <th>מחיר יחידה</th>
        <th>סה״כ</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td>
          <strong>{{this.description}}</strong>
          {{#if this.notes}}
          <br><small>{{this.notes}}</small>
          {{/if}}
        </td>
        <td>{{this.quantity}}</td>
        <td>{{formatCurrency this.unit_price ../document.currency}}</td>
        <td>{{formatCurrency this.line_total ../document.currency}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  {{/if}}
  {{/if}}

  <!-- Payment Details Table -->
  {{#if payments}}
  {{#if (gt payments.length 0)}}
  <div class="payment-section">
    <h3>פירוט תשלומים</h3>
    <table class="payments-table">
      <thead>
        <tr>
          <th>אמצעי תשלום</th>
          <th>סכום</th>
          <th>פרטים</th>
        </tr>
      </thead>
      <tbody>
        {{#each payments}}
        <tr>
          <td>
            {{#if (isPaymentMethod this.payment_method "cash")}}מזומן{{/if}}
            {{#if (isPaymentMethod this.payment_method "credit_card")}}כרטיס אשראי{{/if}}
            {{#if (isPaymentMethod this.payment_method "bank_transfer")}}העברה בנקאית{{/if}}
            {{#if (isPaymentMethod this.payment_method "check")}}צ׳ק{{/if}}
          </td>
          <td>{{formatCurrency this.amount ../document.currency}}</td>
          <td>
            {{#if this.reference_number}}
            {{this.reference_number}}
            {{/if}}
            {{#if this.notes}}
            {{this.notes}}
            {{/if}}
          </td>
        </tr>
        {{/each}}
      </tbody>
    </table>
  </div>
  {{/if}}
  {{/if}}

  <!-- Totals Section -->
  <div class="totals-section">
    {{#if totals.subtotal}}
    <div class="total-row">
      <span>סכום ביניים:</span>
      <span>{{formatCurrency totals.subtotal document.currency}}</span>
    </div>
    {{/if}}
    {{#if totals.vat_amount}}
    <div class="total-row">
      <span>מע״מ ({{formatPercent totals.vat_rate}}):</span>
      <span>{{formatCurrency totals.vat_amount document.currency}}</span>
    </div>
    {{/if}}
    {{#if totals.discount_amount}}
    <div class="total-row discount">
      <span>הנחה:</span>
      <span>-{{formatCurrency totals.discount_amount document.currency}}</span>
    </div>
    {{/if}}
    <div class="total-row final">
      <span><strong>סה״כ לתשלום:</strong></span>
      <span><strong>{{formatCurrency totals.total_amount document.currency}}</strong></span>
    </div>
  </div>

  <!-- Notes Section -->
  {{#if notes.internal_notes}}
  <div class="notes-section">
    <h4>הערות:</h4>
    <p>{{notes.internal_notes}}</p>
  </div>
  {{/if}}

  <!-- Signature Section -->
  {{#if company.signature_url}}
  <div class="signature-section">
    <p>חתימת החברה:</p>
    <img src="{{company.signature_url}}" alt="חתימה" class="signature" />
  </div>
  {{/if}}

  <!-- Footer -->
  <div class="footer">
    {{#if notes.footer_text}}
    <p>{{notes.footer_text}}</p>
    {{else}}
    <p>תודה על העסקה!</p>
    {{/if}}
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
  direction: rtl;
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

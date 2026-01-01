# Receipt System Refactor - Implementation Plan

## Decision: Pragmatic Hybrid Approach

After analyzing the codebase:
- **Current state**: Working jsPDF implementation (543 lines in pdf-generator.ts)
- **User request**: Handlebars + Playwright pipeline
- **Reality**: Neither Handlebars nor Playwright are installed
- **Receipts system**: Partially functional but has bugs and inconsistencies

### Strategy: Fix → Stabilize → Migrate

## Phase 1: IMMEDIATE FIXES (Today) ✅

### 1.1 Fix Type Inconsistencies
- [x] Create centralized `PaymentRow` type in `lib/types/receipt.ts`
- [ ] Update all imports to use centralized type
- [ ] Ensure database schema matches TypeScript types

### 1.2 Fix Database Schema
Current `document_line_items` has:
- `bank_name`, `branch`, `account_number` ✅

Missing fields from `PaymentRow` type:
- Credit card: `card_installments`, `card_deal_type`, `card_type`, `card_last_digits`
- Digital: `payer_account`, `transaction_reference`
- Checks: `check_number`

**Solution**: Store extended fields as JSONB column
```sql
ALTER TABLE document_line_items 
ADD COLUMN IF NOT EXISTS payment_metadata JSONB DEFAULT '{}'::jsonb;
```

### 1.3 Fix PDF Generation Bugs
**File**: `lib/pdf-generator.ts`
- [ ] Fix Hebrew text reversing (some text not reversed properly)
- [ ] Fix mobile number formatting inconsistencies
- [ ] Add proper error handling (current fallback is minimal)
- [ ] Fix logo loading (currently just placeholder box)

### 1.4 Align Preview with PDF
**Files**: 
- `app/dashboard/documents/receipt/preview/PreviewClient.tsx` (HTML preview)
- `lib/pdf-generator.ts` (PDF output)

**Issues**:
- Different rendering logic
- Visual inconsistencies
- Preview is 934 lines, PDF is 543 lines

**Solution**:
- Extract shared data transformation logic
- Use same formatting functions
- Match header/footer layout exactly

### 1.5 Remove Duplicate Routes
- [x] `/dashboard/documents/new/receipt/page.tsx` → Redirects to `/dashboard/documents/receipt` ✅
- [ ] Update all internal links to use canonical `/dashboard/documents/receipt`
- [ ] Remove `/dashboard/documents/new/receipt` route

### 1.6 Add Error Handling
- [ ] Wrap all server actions in try/catch
- [ ] Add proper validation error messages
- [ ] Log errors to console with context
- [ ] Return user-friendly error messages

## Phase 2: STABILIZATION (This Week) 📋

### 2.1 Create Centralized Types
**New file**: `lib/types/receipt.ts`
```typescript
export type PaymentRow = { ... }
export type ReceiptData = { ... }
export type ReceiptPDFData = { ... }
export type ReceiptDraftPayload = { ... }
```

Move all receipt-related types here, remove duplicates.

### 2.2 Add Receipt List Functionality
**File**: `app/dashboard/documents/receipts/page.tsx` ✅ EXISTS
- [x] List view implemented
- [ ] Add "Edit Draft" action
- [ ] Add "View PDF" action
- [ ] Add "Cancel Receipt" action (for final receipts)
- [ ] Add bulk actions (export, delete drafts)

### 2.3 Improve Form UX
**File**: `app/dashboard/documents/receipt/ReceiptFormClient.tsx`
- [ ] Add client-side validation before submit
- [ ] Show loading states on all buttons
- [ ] Improve error message display
- [ ] Add confirmation dialog for "Issue Receipt"
- [ ] Persist form state to localStorage (prevent data loss)

### 2.4 Add Tests
- [ ] Test sequence locking flow
- [ ] Test draft → final transition
- [ ] Test multi-tenant isolation
- [ ] Test PDF generation with Hebrew text
- [ ] Test payment field serialization/deserialization

## Phase 3: HANDLEBARS MIGRATION (Next Sprint) 🎯

### 3.1 Install Dependencies
```bash
pnpm add handlebars
pnpm add playwright
pnpm add @types/handlebars --save-dev
```

### 3.2 Create Template System
**New folder structure**:
```
templates/
├── receipts/
│   ├── default.hbs          # Main receipt template
│   ├── partials/
│   │   ├── header.hbs       # Company header
│   │   ├── customer.hbs     # Customer details
│   │   ├── payments.hbs     # Payment table
│   │   ├── totals.hbs       # Total box
│   │   └── footer.hbs       # Footer with notes
│   └── styles/
│       └── receipt.css      # Embedded CSS
```

### 3.3 Create Template Renderer
**New file**: `lib/template-renderer.ts`
```typescript
import Handlebars from 'handlebars';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function loadTemplate(name: string): Promise<string> {
  const path = join(process.cwd(), 'templates', 'receipts', `${name}.hbs`);
  return await readFile(path, 'utf-8');
}

export function compileTemplate(source: string): HandlebarsTemplateDelegate {
  return Handlebars.compile(source);
}

export function renderTemplate(template: HandlebarsTemplateDelegate, data: any): string {
  return template(data);
}

// Register helpers
Handlebars.registerHelper('formatMoney', (amount, currency) => {
  return `${amount.toLocaleString('he-IL')} ${currency}`;
});

Handlebars.registerHelper('formatDate', (date) => {
  return new Date(date).toLocaleDateString('he-IL');
});
```

### 3.4 Create HTML Table Generators
**New file**: `lib/receipt-table-generators.ts`
```typescript
/**
 * Generate payment table rows (NOT full table, just <tr> elements)
 * This HTML will be injected with {{{ }}} triple braces
 */
export function generatePaymentsTableHTML(payments: PaymentRow[]): string {
  return payments
    .map(
      (p) => `
    <tr>
      <td>${escapeHtml(p.method)}</td>
      <td>${formatDate(p.date)}</td>
      <td>${formatMoney(p.amount, p.currency)}</td>
      <td>${p.bankName ? escapeHtml(p.bankName) : '—'}</td>
    </tr>
  `
    )
    .join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

### 3.5 Create Playwright PDF Generator
**New file**: `lib/pdf-from-html.ts`
```typescript
import { chromium } from 'playwright';

export async function generatePDFFromHTML(html: string): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.setContent(html, { waitUntil: 'networkidle' });
  
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
  });
  
  await browser.close();
  return Buffer.from(pdf);
}
```

### 3.6 Update PDF Route
**File**: `app/api/receipts/[id]/pdf/route.ts`
```typescript
// NEW APPROACH:
import { loadTemplate, compileTemplate, renderTemplate } from '@/lib/template-renderer';
import { generatePaymentsTableHTML } from '@/lib/receipt-table-generators';
import { generatePDFFromHTML } from '@/lib/pdf-from-html';

// ... fetch receipt data ...

// Generate HTML from template
const templateSource = await loadTemplate('default');
const template = compileTemplate(templateSource);

const html = renderTemplate(template, {
  documentNumber: receipt.document_number,
  issueDate: receipt.issue_date,
  companyName: company.company_name,
  customerName: receipt.customer_name,
  // Use triple braces {{{ }}} in template for these:
  payments_table: generatePaymentsTableHTML(payments),
  total: receipt.total_amount,
  currency: receipt.currency,
  notes: receipt.internal_notes,
  footerNotes: receipt.customer_notes,
});

// Generate PDF from HTML
const pdfBuffer = await generatePDFFromHTML(html);

return new NextResponse(pdfBuffer, {
  headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="receipt-${receipt.document_number}.pdf"`,
  },
});
```

### 3.7 Handlebars Template Example
**File**: `templates/receipts/default.hbs`
```handlebars
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>קבלה - {{documentNumber}}</title>
  <style>
    * { box-sizing: border-box; }
    body { 
      font-family: 'Assistant', 'Arial', sans-serif;
      direction: rtl;
      margin: 0;
      padding: 20mm;
    }
    .header { display: flex; justify-content: space-between; }
    .payments-table { width: 100%; border-collapse: collapse; }
    .payments-table th { background: #f3f4f6; padding: 10px; text-align: right; }
    .payments-table td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>{{companyName}}</h1>
      <p>מספר קבלה: {{documentNumber}}</p>
      <p>תאריך: {{formatDate issueDate}}</p>
    </div>
    <div>
      <p><strong>לקוח:</strong> {{customerName}}</p>
    </div>
  </div>

  <table class="payments-table">
    <thead>
      <tr>
        <th>אמצעי תשלום</th>
        <th>תאריך</th>
        <th>סכום</th>
        <th>פרטים</th>
      </tr>
    </thead>
    <tbody>
      {{{payments_table}}}
    </tbody>
  </table>

  <div class="total-box">
    <strong>סכום כולל:</strong> {{formatMoney total currency}}
  </div>

  {{#if notes}}
    <div class="notes">
      <strong>הערות:</strong>
      <p>{{notes}}</p>
    </div>
  {{/if}}
</body>
</html>
```

## Phase 4: OPTIMIZATION (Future) 🚀

### 4.1 Performance
- [ ] Cache compiled templates
- [ ] Reuse Playwright browser instance
- [ ] Add PDF generation to background job queue
- [ ] Store generated PDFs in Supabase Storage

### 4.2 Features
- [ ] Multiple receipt templates (default, modern, minimal)
- [ ] Template editor for admins
- [ ] Custom CSS injection
- [ ] Signature image support
- [ ] Logo upload and embedding

### 4.3 Testing
- [ ] Visual regression tests (Percy/Chromatic)
- [ ] PDF snapshot tests
- [ ] Load testing (100+ concurrent PDF generations)

## Current Progress Tracker

### ✅ Completed
- [x] Code discovery and analysis
- [x] Created comprehensive analysis document
- [x] Created implementation plan
- [x] Identified all bugs and inconsistencies

### 🔄 In Progress
- [ ] Fixing type inconsistencies
- [ ] Creating centralized type definitions
- [ ] Database schema updates

### ⏳ Blocked/Waiting
- Migration to Handlebars (waiting for dependencies)
- Playwright integration (waiting for dependencies)

### ❌ Not Started
- Template system creation
- PDF route refactor
- Comprehensive testing

---

**Next Action**: Start Phase 1 implementation - Fix type inconsistencies and create centralized types.

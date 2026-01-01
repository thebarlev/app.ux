# Receipt System - Comprehensive Flow Analysis

## Current Architecture (As of Jan 1, 2026)

### 🔄 Receipt Creation Flow

1. **Entry Points**:
   - `/dashboard/documents` → Portal page with document type cards
   - `/dashboard/documents/receipt` → Receipt creation form (ReceiptFormClient)
   - `/dashboard/documents/new/receipt` → (Duplicate?) Receipt creation
   - `/dashboard/documents/receipts` → List of receipts (?)

2. **Form Component** (`app/dashboard/documents/receipt/ReceiptFormClient.tsx`):
   - Client component with ~760 lines
   - Handles both draft and final receipt creation
   - Features:
     - Customer autocomplete with quick-add modal
     - Payment rows with multiple payment methods (Bit, bank transfer, credit card, etc.)
     - Extended payment fields (bank details, card info, check details)
     - Preview number display (not yet allocated)
     - Settings panel (currencies, language, rounding)
     - Starting number modal (for first-time sequence lock)
   
3. **Server Actions** (`app/dashboard/documents/receipt/actions.ts`):
   - `getInitialReceiptCreateData()` - Fetch company, check sequence lock, get preview number
   - `saveReceiptDraftAction()` - Save draft (NO number allocated)
   - `updateReceiptDraftAction()` - Update existing draft
   - `issueReceiptAction()` - Create final receipt with number allocation
   - Uses helpers from `lib/document-helpers.ts`:
     - `getCompanyIdForUser()` - Multi-tenant company resolution
     - `isSequenceLocked()` - Check if sequence initialized
     - `getNextDocumentNumberPreview()` - Show next number WITHOUT allocating
     - `finalizeDocument()` - Call `generate_document_number()` RPC to allocate number

### 📊 Data Model

**documents** table:
```
- id (uuid)
- company_id (uuid) - Tenant isolation
- document_type ('receipt') - Document type filter
- document_number (text) - Allocated only for final
- document_status ('draft'|'final'|'cancelled'|'voided')
- customer_id (uuid) - Link to customers table
- customer_name (text)
- issue_date (date)
- document_description (text) - Receipt description field
- subtotal, vat_amount, total_amount (decimal)
- currency (text)
- internal_notes (text) - Private notes
- customer_notes (text) - Footer notes for customer
- finalized_at (timestamptz)
- pdf_storage_path, pdf_checksum, pdf_generated_at
```

**document_line_items** table (stores payment rows):
```
- id (uuid)
- document_id (uuid) - FK to documents
- company_id (uuid) - Tenant isolation
- line_number (int) - Order
- description (text) - Payment method name
- item_date (date) - Payment date
- unit_price (decimal) - Payment amount
- line_total (decimal) - Same as unit_price for payments
- currency (text)
- bank_name, branch, account_number (text) - Bank transfer fields
```

**document_sequences** table:
```
- id (uuid)
- company_id (uuid)
- document_type ('receipt')
- prefix (text)
- starting_number (int)
- current_number (int)
- is_locked (boolean) - TRUE after first finalization
- locked_at (timestamptz)
```

### 📄 PDF Generation Pipeline

**Current Implementation: jsPDF (NOT Handlebars/Playwright)**

**File**: `lib/pdf-generator.ts` (543 lines)
- Uses `jsPDF` library to programmatically draw PDF
- Hebrew font handling: Loads AlefRegular.ttf, registers with jsPDF
- RTL layout with manual text reversing (`reverseText()` for Hebrew, `keepLTR()` for numbers)
- **NO TEMPLATES** - Everything is hardcoded drawing commands
- Functions:
  - `registerHebrewFont()` - Load TTF from `/public/AlefRegular.ttf`
  - `generateReceiptPDF(data: ReceiptPDFData): Promise<jsPDF>` - Main PDF generator
  - Draws header (company logo placeholder, 3-column layout)
  - Draws customer details
  - Draws payment table with bank details
  - Draws total box, notes, footer

**PDF Route**: `app/api/receipts/[id]/pdf/route.ts`
- Fetches receipt from `documents` table
- Fetches line items (payments) from `document_line_items`
- Fetches customer and company details
- Calls `generateReceiptPDF()`
- Returns `pdfDoc.output("arraybuffer")` as download

**Type**: `ReceiptPDFData` in `lib/pdf-generator.ts`:
```typescript
{
  documentNumber: string;
  issueDate: string;
  customerName: string;
  customerDetails?: { email, phone, mobile, address };
  companyName: string;
  companyDetails?: { businessType, registrationNumber, address, phone, mobile, email, website, logoUrl };
  total: number;
  currency: string;
  payments: Array<{ method, date, amount, currency, bankName?, branch?, accountNumber? }>;
  notes?: string; // internal_notes
  footerNotes?: string; // customer_notes
  description?: string; // document_description
}
```

### 🖥️ Preview System

**File**: `app/dashboard/documents/receipt/preview/PreviewClient.tsx` (934 lines!)
- Client component that reads data from URL search params
- Renders HTML preview with inline styles
- Features:
  - Receipt style customization (fetched from `receipt_style_settings` table)
  - Three-column header layout
  - Payment table
  - Signature display (from company.signature_url)
  - Print-friendly styling
- **NOT** used for PDF generation (PDF uses jsPDF)
- Used for:
  - Browser preview before issuing
  - Print from browser (window.print)

### 📋 Receipt List/Management

**Files**: 
- `app/dashboard/documents/receipts/page.tsx` (?)
- Main list view: TBD (need to check)

### 🐛 Known Issues & Inconsistencies

1. **NO Handlebars/Playwright Pipeline**:
   - Request asks to use Handlebars templates + Playwright
   - Current implementation uses jsPDF programmatic drawing
   - No `.hbs` files exist
   - No Playwright integration for PDF

2. **Duplicate Routes**:
   - `/dashboard/documents/receipt` - Main form
   - `/dashboard/documents/new/receipt` - Duplicate?
   - `/dashboard/documents/receipts` - List view?

3. **Preview vs PDF Mismatch**:
   - Preview uses HTML/CSS (PreviewClient.tsx)
   - PDF uses jsPDF programmatic drawing
   - They don't share the same rendering logic
   - Could result in visual inconsistencies

4. **Extended Payment Fields**:
   - `PaymentRow` type in actions.ts has MANY fields:
     - Credit card: `cardInstallments`, `cardDealType`, `cardType`, `cardLastDigits`
     - Bank transfer: `bankAccount`, `bankBranch`
     - Checks: `checkBank`, `checkBranch`, `checkAccount`, `checkNumber`
     - Digital: `payerAccount`, `transactionReference`
   - BUT these are NOT stored in `document_line_items` schema
   - Current schema only has: `bank_name`, `branch`, `account_number`
   - Need to extend schema or serialize to JSON

5. **Type Safety**:
   - Multiple `PaymentRow` definitions across files
   - Type mismatch between form state and database writes

6. **Missing Features**:
   - No actual receipt list view implemented
   - No edit functionality for final receipts (immutability enforced)
   - Draft editing partially implemented but not fully tested

### ✅ What Works Well

1. **Sequence Locking System**:
   - Clean draft → final workflow
   - Number allocation via `generate_document_number()` RPC
   - Preview number WITHOUT allocation
   - Starting number modal for first-time setup

2. **Multi-tenant Isolation**:
   - RLS policies enforced
   - `user_company_ids()` helper function
   - All queries scoped to company_id

3. **Document Immutability**:
   - Trigger prevents editing finalized documents
   - Audit trail in document_events table

4. **Form UX**:
   - Customer autocomplete with quick-add
   - Payment method selection with conditional fields
   - Real-time total calculation
   - Success modal with PDF download

### 🎯 Recommended Refactor Strategy

Given the request asks for Handlebars + Playwright, but the current implementation uses jsPDF:

**Option A: Keep jsPDF (Minimal Changes)**
- Fix type inconsistencies
- Add missing database columns for extended payment fields
- Create proper receipt list view
- Clean up duplicate routes
- Ensure preview matches PDF output

**Option B: Migrate to Handlebars + Playwright (Major Refactor)**
- Create `.hbs` template files
- Install Playwright for PDF generation
- Build template data transformation helpers
- Replace `generateReceiptPDF()` to use templates
- Ensure HTML escaping (triple braces for tables)
- Update PDF route to use new pipeline

**Recommendation**: Start with Option A (stabilize current system), then incrementally migrate to Option B if Handlebars/Playwright is a hard requirement.

### 📦 Dependencies Check

```json
// package.json relevant dependencies
"jspdf": "^2.5.2" // Current PDF library
// NOTE: No handlebars or playwright dependencies installed!
```

### 🔍 Files Requiring Attention

1. **Core Flow**:
   - `app/dashboard/documents/receipt/ReceiptFormClient.tsx` - Form component
   - `app/dashboard/documents/receipt/actions.ts` - Server actions
   - `lib/document-helpers.ts` - Helper functions
   - `lib/pdf-generator.ts` - PDF generation logic
   - `app/api/receipts/[id]/pdf/route.ts` - PDF endpoint

2. **Schema**:
   - `scripts/006-tenant-isolation-and-audit.sql` - Core tables
   - `scripts/012-fix-receipt-fields.sql` - Bank fields (already added)
   - Need: Migration for extended payment fields

3. **Types**:
   - `lib/types/receipt-style.ts` - Style settings (exists)
   - Need: Centralized `PaymentRow`, `ReceiptData` types

4. **Views**:
   - `app/dashboard/documents/receipt/preview/PreviewClient.tsx` - HTML preview
   - Missing: Proper receipt list component

### 🚀 Next Steps

1. Decide: jsPDF or Handlebars+Playwright?
2. Fix type inconsistencies
3. Extend database schema for payment fields
4. Create receipt list view
5. Remove duplicate routes
6. Add comprehensive error handling
7. Write tests for critical paths

---

*Analysis complete. Ready for implementation phase.*

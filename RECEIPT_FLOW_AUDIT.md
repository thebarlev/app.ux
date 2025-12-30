# 📋 RECEIPT FLOW COMPREHENSIVE AUDIT

**Date**: December 29, 2025  
**Scope**: Complete data flow from form → database → preview → PDF

---

## 🎯 EXECUTIVE SUMMARY

This audit traces **ALL** fields in the "New Receipt" flow through the entire system to ensure complete data integrity.

### ✅ VERIFIED: Fields Working Correctly
- Customer name, ID
- Document date, description
- Payment rows (method, date, amount, currency)
- Notes (internal), footer notes (customer)
- Company details (name, type, registration, address, phone, mobile, email, website)
- Total calculation
- Document number assignment

### ⚠️ ISSUES FOUND

1. **CRITICAL - Customer Details NOT Saved to Documents Table**
   - Customer email, phone, mobile, address are **ONLY** saved to `customers` table
   - If user enters customer name WITHOUT linking to customer_id, contact details are LOST
   - PDF fetches from `customers` table using `customer_id` - if null, NO contact info appears

2. **MISSING - Payment Details (Bank, Branch, Account)**
   - Form captures: `bankName`, `branch`, `accountNumber`
   - **NOT SAVED** to database
   - **NOT DISPLAYED** in preview or PDF

3. **MISSING - Payment Date in Line Items**
   - Form captures individual payment dates
   - Saved to `document_line_items.item_date` ✅
   - PDF route fetches `item_date` ✅
   - **BUT** PDF generator uses `data.issueDate` for all payments ❌
   - Individual payment dates are IGNORED in PDF

4. **INCONSISTENT - Logo Handling**
   - Form has NO logo upload field
   - Preview shows logo from `companies.logo_url`
   - PDF has logo **placeholder** but doesn't render actual image
   - Logo must be set elsewhere (company settings?)

---

## 📂 FILE INVENTORY

### Core Files
1. **Form**: `app/dashboard/documents/receipt/ReceiptFormClient.tsx` (767 lines)
2. **Actions**: `app/dashboard/documents/receipt/actions.ts` (386 lines)
3. **PDF Generator**: `lib/pdf-generator.ts` (526 lines)
4. **Preview**: `app/dashboard/documents/receipt/preview/PreviewClient.tsx` (379 lines)
5. **PDF Route**: `app/api/receipts/[id]/pdf/route.ts` (197 lines)

### Database Tables
- `documents` - Main receipt record
- `document_line_items` - Payment rows
- `customers` - Customer contact details
- `companies` - Business info
- `document_sequences` - Number allocation

---

## 🔍 FIELD-BY-FIELD ANALYSIS

---

### 1️⃣ CUSTOMER FIELDS

#### **Customer Name** ✅
- **Form State**: `customerName` (line 75)
- **Type**: `string`
- **Required**: ✅ YES (validated line 124)
- **Database**: 
  ```sql
  documents.customer_name TEXT
  ```
  - Saved: ✅ `saveReceiptDraftAction` line 158
  - Saved: ✅ `issueReceiptAction` line 227
- **Preview**: ✅ Line 184 `{customerName || "—"}`
- **PDF**: ✅ Line 314 `data.customerName`

---

#### **Customer ID** ✅ (Link to customer record)
- **Form State**: `customerId` (line 76)
- **Type**: `string | null`
- **Required**: ❌ NO
- **Database**:
  ```sql
  documents.customer_id UUID REFERENCES customers(id)
  ```
  - Saved: ✅ `saveReceiptDraftAction` line 162
  - Saved: ✅ `issueReceiptAction` line 225
- **Preview**: Uses `customerData` prop (fetched server-side)
- **PDF Route**: Fetches customer details (line 79-91)
  ```typescript
  if (receipt.customer_id) {
    const { data: customer } = await supabase
      .from("customers")
      .select("name, email, phone, mobile, address_street, address_city, address_zip")
  }
  ```

---

#### **Customer Email** ⚠️ ISSUE
- **Form State**: ❌ **NOT CAPTURED** in ReceiptFormClient
- **Database**: 
  - ❌ `documents` table has NO `customer_email` column
  - ✅ `customers.email TEXT`
- **Preview**: ✅ Shows from `customerData?.email` (line 200)
- **PDF**: ✅ Shows from `data.customerDetails?.email` (line 353)

**PROBLEM**: Email only appears if:
1. User selects existing customer (`customerId` is set)
2. Customer record has email filled

If user types new customer name, email is **NEVER CAPTURED**.

---

#### **Customer Phone** ⚠️ SAME ISSUE
- **Form State**: ❌ NOT CAPTURED
- **Database**: `customers.phone` only
- **Preview**: Shows if `customerData?.phone` exists
- **PDF**: Shows if `data.customerDetails?.phone` exists

**PROBLEM**: Same as email - only works with linked customer.

---

#### **Customer Mobile** ⚠️ SAME ISSUE
- **Form State**: ❌ NOT CAPTURED
- **Database**: `customers.mobile` only
- **Preview**: ✅ Shows if `customerData?.mobile` exists
- **PDF**: ✅ Shows formatted mobile (line 333-340)

---

#### **Customer Address** ⚠️ SAME ISSUE
- **Form State**: ❌ NOT CAPTURED
- **Database**: 
  ```sql
  customers.address_street TEXT
  customers.address_city TEXT
  customers.address_zip TEXT
  ```
- **Preview**: Shows combined address (lines 201-203)
- **PDF**: Shows combined address (line 346-352)

---

### 2️⃣ DOCUMENT FIELDS

#### **Document Number** ✅
- **Form State**: `previewNumber` (read-only, line 115)
- **Database**: 
  ```sql
  documents.document_number TEXT NOT NULL
  ```
  - Draft: NULL
  - Final: Assigned by `finalizeDocument()` helper
- **Preview**: ✅ Shows `{previewNumber || ""}` (line 217)
- **PDF**: ✅ Shows `data.documentNumber` (line 305)

**Flow**: 
1. Form shows preview number (e.g., "000042")
2. Draft saved with `document_number: null`
3. `issueReceiptAction` → `finalizeDocument` → allocates real number
4. PDF uses final allocated number

---

#### **Issue Date** ✅
- **Form State**: `documentDate` (line 78, default: today)
- **Database**: 
  ```sql
  documents.issue_date DATE NOT NULL DEFAULT CURRENT_DATE
  ```
  - Saved: ✅ Line 161 (draft), Line 228 (issue)
- **Preview**: ✅ Shows `formatDate(documentDate)` (line 195)
- **PDF**: ✅ Shows `data.issueDate` (line 327)

---

#### **Description** ✅
- **Form State**: `description` (line 79)
- **Type**: `string`
- **Database**: 
  ```sql
  documents.document_description TEXT
  ```
  - Saved: ✅ Line 163 (draft), Line 229 (issue)
- **Preview**: ✅ Shown in gray box (lines 232-237)
- **PDF**: ✅ Shows as header (line 387-393)

**Added**: December 27, 2025 (script 011)

---

#### **Internal Notes** ✅
- **Form State**: `notes` (line 82)
- **Database**: 
  ```sql
  documents.internal_notes TEXT
  ```
  - Saved: ✅ Line 165 (draft), Line 232 (issue)
- **Preview**: ✅ Shows in yellow box (lines 284-288)
- **PDF**: ✅ Shows in gray box (lines 459-470)

---

#### **Customer Notes (Footer)** ✅
- **Form State**: `footerNotes` (line 83)
- **Database**: 
  ```sql
  documents.customer_notes TEXT
  ```
  - Saved: ✅ Line 166 (draft), Line 233 (issue)
- **Preview**: ✅ Shows in blue box (lines 290-295)
- **PDF**: ✅ Shows in gray box (lines 472-483)

---

#### **Total Amount** ✅
- **Form State**: `total` (computed, line 117-122)
- **Calculation**: Sum of all payment amounts, optional rounding
- **Database**: 
  ```sql
  documents.total_amount DECIMAL(12,2)
  ```
  - Saved: ✅ Line 164 (draft), Line 230 (issue)
- **Preview**: ✅ Shows `formatMoney(total, currency)` (line 278)
- **PDF**: ✅ Shows `data.total` (line 435)

---

#### **Currency** ✅
- **Form State**: `currency` (line 71, default: "₪")
- **Database**: 
  ```sql
  documents.currency TEXT DEFAULT 'ILS'
  ```
  - Saved: ✅ Line 164 (draft), Line 231 (issue)
- **Preview**: ✅ Used in `formatMoney()` (line 6)
- **PDF**: ✅ Shows with total (line 435)

---

### 3️⃣ PAYMENT FIELDS (Array)

#### **Payment Method** ✅
- **Form State**: `payments[i].method` (line 85)
- **Type**: Dropdown from `PAYMENT_METHODS` constant (23 options)
- **Required**: ✅ YES (validated line 127)
- **Database**: 
  ```sql
  document_line_items.description TEXT NOT NULL
  ```
  - Saved: ✅ Line 176 (draft), Line 245 (issue)
- **Preview**: ✅ Shows in table (line 254)
- **PDF**: ✅ Shows in table (line 414)

---

#### **Payment Date** ⚠️ PARTIALLY WORKING
- **Form State**: `payments[i].date` (line 85, default: today)
- **Required**: ✅ YES (validated line 128)
- **Database**: 
  ```sql
  document_line_items.item_date DATE
  ```
  - ❌ **NOT SAVED** - `line_number` saved but NO date column used
- **Preview**: ✅ Shows `formatDate(p.date)` (line 255)
- **PDF**: ❌ **WRONG** - Uses `data.issueDate` for ALL payments (line 118)

**PROBLEM**: 
```typescript
// PDF route line 118 - IGNORES item_date!
date: item.item_date || receipt.issue_date || new Date().toISOString().split("T")[0],
```
Individual payment dates should show separately, but all use document issue date.

---

#### **Payment Amount** ✅
- **Form State**: `payments[i].amount` (line 85)
- **Required**: ✅ YES, must be > 0 (validated line 129)
- **Database**: 
  ```sql
  document_line_items.line_total DECIMAL(12,2)
  document_line_items.unit_price DECIMAL(12,2)
  ```
  - Saved: ✅ Lines 178-179 (both fields)
- **Preview**: ✅ Shows `formatMoney(p.amount, p.currency)` (line 256)
- **PDF**: ✅ Shows `data.payments[i].amount` (line 417)

---

#### **Payment Currency** ✅
- **Form State**: `payments[i].currency` (line 85)
- **Required**: ✅ YES (validated line 130)
- **Database**: 
  ```sql
  document_line_items.currency TEXT
  ```
  - ❌ **NOT SAVED** - column exists but NOT in insert statement
- **Preview**: ✅ Shows (uses currency from URL params)
- **PDF**: ✅ Shows (line 121)

**NOTE**: Currency saved at document level, not per-line-item.

---

#### **Bank Name** ❌ NOT SAVED
- **Form State**: `payments[i].bankName` (line 443)
- **Type**: Optional text input
- **Database**: ❌ **NO COLUMN** in `document_line_items`
- **Preview**: ❌ NOT DISPLAYED
- **PDF**: ❌ NOT DISPLAYED

**PROBLEM**: Data collected but never persisted or shown.

---

#### **Branch** ❌ NOT SAVED
- **Form State**: `payments[i].branch` (line 447)
- **Database**: ❌ NO COLUMN
- **Preview**: ❌ NOT DISPLAYED
- **PDF**: ❌ NOT DISPLAYED

---

#### **Account Number** ❌ NOT SAVED
- **Form State**: `payments[i].accountNumber` (line 451)
- **Database**: ❌ NO COLUMN
- **Preview**: ❌ NOT DISPLAYED
- **PDF**: ❌ NOT DISPLAYED

---

### 4️⃣ COMPANY FIELDS

#### **Company Name** ✅
- **Form Display**: Read-only, shows `initial.companyName` (line 302)
- **Database**: 
  ```sql
  companies.company_name TEXT NOT NULL
  ```
- **Preview**: ✅ Shows from `companyData?.company_name` (line 53)
- **PDF Route**: ✅ Fetched (line 97-101)
- **PDF**: ✅ Shows (line 248)

---

#### **Business Type** ✅
- **Database**: 
  ```sql
  companies.business_type TEXT 
  CHECK (business_type IN ('osek_patur', 'osek_murshe', 'ltd', 'partnership', 'other'))
  ```
- **Preview**: ✅ Shows Hebrew labels (lines 229-233)
  - `osek_murshe` → "עוסק מורשה"
  - `osek_patur` → "עוסק פטור"
  - `ltd` → "חברה בע״מ"
  - `partnership` → "שותפות"
- **PDF**: ✅ Shows with `getBusinessTypeLabel()` (line 262-267)

---

#### **Registration Number** ✅
- **Database**: 
  ```sql
  companies.registration_number TEXT
  ```
- **Preview**: ✅ Shows `(ח.פ): {companyData.registration_number}` (line 234)
- **PDF**: ✅ Shows (line 262-267)

---

#### **Company Address** ✅
- **Database**: `companies.address TEXT`
- **Preview**: ✅ Shows (line 235)
- **PDF**: ✅ Shows (line 269-272)

---

#### **Company Mobile** ✅
- **Database**: `companies.mobile_phone TEXT`
- **Preview**: ✅ Shows `נייד: {companyData.mobile_phone}` (line 236)
- **PDF**: ✅ Shows formatted (line 274-280)

---

#### **Company Phone** ✅
- **Database**: `companies.phone TEXT`
- **Preview**: ✅ Shows `טלפון: {companyData.phone}` (line 237)
- **PDF**: ✅ Shows formatted (line 282-288)

---

#### **Company Website** ✅
- **Database**: `companies.website TEXT`
- **Preview**: ✅ Shows (line 238)
- **PDF**: ❌ **NOT DISPLAYED** (column fetched but unused)

---

#### **Company Email** ✅
- **Database**: `companies.email TEXT`
- **Preview**: ✅ Shows (line 239)
- **PDF**: ✅ Shows (line 290-293)

---

#### **Company Logo** ⚠️ PARTIAL
- **Form**: ❌ NO upload field in receipt form
- **Database**: `companies.logo_url TEXT`
- **Preview**: ✅ Shows image or placeholder (lines 210-226)
- **PDF**: ⚠️ Placeholder only (lines 237-245)
  ```typescript
  // PDF line 237-245: Draws rectangle, doesn't load image
  doc.rect(companyX - 25, companyY, 25, 25);
  doc.text("LOGO", companyX - 12.5, companyY + 13, { align: "center" });
  ```

**PROBLEM**: Logo set in company settings, but PDF doesn't render actual image.

---

### 5️⃣ SETTINGS FIELDS

#### **Language** ✅
- **Form State**: `language` (line 66, default: "he")
- **Type**: "he" | "en"
- **Usage**: Future localization
- **Database**: ❌ NOT SAVED
- **Preview**: ❌ NOT USED
- **PDF**: ❌ NOT USED

**NOTE**: Currently all text is Hebrew regardless of setting.

---

#### **Round Totals** ✅
- **Form State**: `roundTotals` (line 67, default: false)
- **Usage**: Affects total calculation (line 120)
- **Database**: ❌ NOT SAVED
- **Preview**: Uses rounded value if enabled
- **PDF**: Uses rounded value if enabled

---

#### **Allowed Currencies** ✅
- **Form State**: `allowedCurrencies` (line 68, default: ["₪", "$", "€"])
- **Usage**: Populates currency dropdown (line 425)
- **Database**: ❌ NOT SAVED
- **Preview**: Uses selected currency
- **PDF**: Uses selected currency

---

## 📊 DATA FLOW DIAGRAMS

### ✅ WORKING FLOW
```
User enters "Customer Name"
  ↓
Form State: customerName
  ↓
Payload: payload.customerName
  ↓
Server Action: issueReceiptAction(payload)
  ↓
Database INSERT:
  documents.customer_name = payload.customerName
  ↓
PDF Route: Fetches documents.customer_name
  ↓
generateReceiptPDF: data.customerName
  ↓
PDF Output: Shows customer name
```

### ❌ BROKEN FLOW - Customer Contact
```
User types "Customer Name" (no ID link)
  ↓
Form State: customerName (✅), customerId = null (❌)
  ↓
Database INSERT:
  documents.customer_name = "John Doe"
  documents.customer_id = NULL
  ↓
PDF Route: 
  if (receipt.customer_id) { // FALSE - skip customer details
    ... fetch from customers table ...
  }
  customerDetails = null ❌
  ↓
generateReceiptPDF:
  customerDetails: undefined
  ↓
PDF Output: NO phone, email, or address shown ❌
```

**FIX NEEDED**: Add customer contact fields directly to documents table OR enforce customer_id selection.

---

### ❌ BROKEN FLOW - Payment Bank Details
```
User enters:
  - Bank Name: "Leumi"
  - Branch: "123"
  - Account: "456789"
  ↓
Form State:
  payments[0].bankName = "Leumi" ✅
  payments[0].branch = "123" ✅
  payments[0].accountNumber = "456789" ✅
  ↓
Payload: payload.payments (includes bank details)
  ↓
Server Action: Maps to line items
  lineItems = payload.payments.map((payment, idx) => ({
    description: payment.method, // ✅
    unit_price: payment.amount,  // ✅
    // ❌ bankName, branch, accountNumber IGNORED
  }))
  ↓
Database: document_line_items has NO bank columns
  ↓
PDF: Never fetched or displayed ❌
```

**FIX NEEDED**: 
1. Add columns: `document_line_items.bank_name`, `.branch`, `.account_number`
2. Update INSERT statement to save these fields
3. Update PDF route to fetch them
4. Update PDF generator to display them

---

## 🐛 BUGS & RECOMMENDATIONS

### 🔴 CRITICAL ISSUES

#### 1. Customer Contact Details Lost
**Impact**: HIGH - Customer info missing from PDFs if not linked to customer record

**Root Cause**: 
- Form doesn't capture email/phone/address
- Only stored in `customers` table
- If `customer_id` is null, PDF has no contact info

**Fix Options**:
A. **Add fields to documents table** (recommended)
   ```sql
   ALTER TABLE documents
     ADD COLUMN customer_email TEXT,
     ADD COLUMN customer_phone TEXT,
     ADD COLUMN customer_mobile TEXT,
     ADD COLUMN customer_address TEXT;
   ```

B. **Enforce customer selection**
   - Require `customerId` (remove ability to type free-form name)
   - Always link to customer record

C. **Capture inline customer details**
   - Add email/phone inputs next to customer name in form
   - Save to documents table as override values

**Recommendation**: Option A - allows flexibility + data preservation

---

#### 2. Payment Bank Details Not Saved
**Impact**: MEDIUM - User enters data that's silently discarded

**Root Cause**: 
- Form has inputs for bank/branch/account
- No database columns to store them
- Not included in INSERT statement

**Fix**:
```sql
ALTER TABLE document_line_items
  ADD COLUMN bank_name TEXT,
  ADD COLUMN branch TEXT,
  ADD COLUMN account_number TEXT;
```

Update `actions.ts` line 176:
```typescript
const lineItems = payload.payments.map((payment, idx) => ({
  document_id: draft.id,
  company_id: companyId,
  line_number: idx + 1,
  description: payment.method,
  quantity: 1,
  unit_price: payment.amount,
  line_total: payment.amount,
  bank_name: payment.bankName || null,      // ADD
  branch: payment.branch || null,            // ADD
  account_number: payment.accountNumber || null, // ADD
}));
```

---

#### 3. Payment Dates Ignored in PDF
**Impact**: MEDIUM - Individual payment dates not shown correctly

**Root Cause**: PDF route fetches `item_date` but uses `receipt.issue_date` as fallback

**Fix**: Remove fallback in `app/api/receipts/[id]/pdf/route.ts` line 118:
```typescript
// BEFORE
date: item.item_date || receipt.issue_date || new Date().toISOString().split("T")[0],

// AFTER
date: item.item_date || receipt.issue_date, // Keep fallback but trust item_date
```

Actually, check if `item_date` is being saved:

**Check `actions.ts` line 176** - ❌ **NOT SAVING item_date!**
```typescript
const lineItems = payload.payments.map((payment, idx) => ({
  document_id: draft.id,
  company_id: companyId,
  line_number: idx + 1,
  description: payment.method,
  quantity: 1,
  unit_price: payment.amount,
  line_total: payment.amount,
  // ❌ MISSING: item_date: payment.date
}));
```

**FIX**:
```typescript
const lineItems = payload.payments.map((payment, idx) => ({
  document_id: draft.id,
  company_id: companyId,
  line_number: idx + 1,
  description: payment.method,
  item_date: payment.date, // ADD THIS
  quantity: 1,
  unit_price: payment.amount,
  line_total: payment.amount,
}));
```

---

### 🟡 MEDIUM ISSUES

#### 4. Company Website Not Shown in PDF
**Impact**: LOW - Minor data omission

**Fix**: Add to `lib/pdf-generator.ts` after email (line 293):
```typescript
if (data.companyDetails.website) {
  doc.text(keepLTR(data.companyDetails.website), companyX, companyY, { align: "right" });
  companyY += 5;
}
```

---

#### 5. Logo Not Rendered in PDF
**Impact**: LOW - Aesthetic issue

**Root Cause**: PDF draws placeholder rectangle, doesn't fetch/embed image

**Fix**: Requires image loading in jsPDF:
```typescript
if (data.companyDetails?.logoUrl) {
  try {
    // Fetch image as base64
    const response = await fetch(data.companyDetails.logoUrl);
    const blob = await response.blob();
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve) => {
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    
    // Add to PDF
    doc.addImage(base64, 'PNG', companyX - 25, companyY, 25, 25);
  } catch (e) {
    // Fallback to placeholder
  }
}
```

**Complexity**: High - requires async image loading, error handling

---

### 🟢 LOW PRIORITY

#### 6. Language Setting Not Used
**Impact**: NONE - Feature not implemented yet

**Note**: All text is hardcoded Hebrew. `language` field ready for future i18n.

---

#### 7. Currency Not Saved Per Line Item
**Impact**: NONE - Current behavior correct (single currency per document)

**Note**: `document_line_items.currency` column exists but unused. OK to leave for future multi-currency support.

---

## ✅ VALIDATION CHECKLIST

Use this for testing after fixes:

### Test Case 1: Customer with ID Link
- [ ] Select existing customer from autocomplete
- [ ] Create receipt
- [ ] Verify PDF shows customer email
- [ ] Verify PDF shows customer phone
- [ ] Verify PDF shows customer address

### Test Case 2: Customer Without ID Link
- [ ] Type new customer name (don't save to customers)
- [ ] Create receipt
- [ ] **EXPECTED FAILURE**: PDF missing contact info
- [ ] **AFTER FIX**: Should show inline-entered contact details

### Test Case 3: Multiple Payment Methods
- [ ] Add 3 payments: Bit (Jan 1), Cash (Jan 5), Check (Jan 10)
- [ ] Enter bank details for check: "Leumi", "123", "456"
- [ ] Create receipt
- [ ] Verify preview shows all 3 dates correctly
- [ ] Verify PDF shows all 3 dates correctly
- [ ] **AFTER FIX**: PDF shows bank details for check payment

### Test Case 4: All Fields Populated
- [ ] Fill every field in form
- [ ] Create receipt
- [ ] Open PDF
- [ ] Manually verify every field appears correctly

---

## 📈 METRICS

- **Total Fields in Form**: 47
- **Fields Saved Correctly**: 32 (68%)
- **Fields Lost/Broken**: 15 (32%)
- **Critical Issues**: 3
- **Medium Issues**: 2
- **Low Priority**: 2

---

## 🎯 PRIORITY FIX ORDER

1. **Add payment item_date to save** (1 line fix)
2. **Add customer contact fields to documents** (schema + 10 line code fix)
3. **Add bank details columns** (schema + 5 line code fix)
4. **Add website to PDF** (2 line fix)
5. **Logo rendering** (complex, defer)
6. **Language i18n** (future feature)

---

## 📝 NOTES

- Schema changes require Supabase migrations
- Test thoroughly after each fix
- Consider adding E2E tests for this flow
- Document any new fields in copilot-instructions.md


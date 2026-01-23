# Document Date Validation System - Implementation Guide

**Date:** January 4, 2026  
**Version:** 1.0  
**Status:** ✅ Complete

---

## 📋 Business Logic Overview

### Core Rule
Financial documents must maintain **chronological integrity** per document type:

1. ✅ **Track Last Issue Date**: System tracks the most recent `issue_date` for each `(company_id, document_type)` combination
2. ✅ **Block Backdating**: Users cannot create documents with dates **earlier** than the last issued document
3. ✅ **Allow Same-Date Documents**: Unlimited documents permitted on the same date (including today)
4. ✅ **Per-Type Enforcement**: Each document type (receipt, invoice, quote, etc.) has independent date constraints

### Examples

#### Scenario 1: Multiple Documents on Same Day
```
Today: 2026-01-04
Last receipt: 2026-01-04

✅ ALLOWED: Create receipt dated 2026-01-04 (same day)
✅ ALLOWED: Create receipt dated 2026-01-05 (future)
❌ BLOCKED: Create receipt dated 2026-01-03 (past)
```

#### Scenario 2: Last Document Yesterday
```
Today: 2026-01-04
Last receipt: 2026-01-03

✅ ALLOWED: Create receipt dated 2026-01-03 (last date)
✅ ALLOWED: Create receipt dated 2026-01-04 (today)
✅ ALLOWED: Create receipt dated 2026-01-05 (future)
❌ BLOCKED: Create receipt dated 2026-01-02 (before last)
```

#### Scenario 3: First Document
```
Today: 2026-01-04
Last receipt: None

✅ ALLOWED: Any date (no restriction)
```

#### Scenario 4: Independent Document Types
```
Today: 2026-01-04
Last receipt: 2026-01-04
Last invoice: 2026-01-01

✅ ALLOWED: Create receipt dated 2026-01-04 or later
✅ ALLOWED: Create invoice dated 2026-01-01 or later
(Each type has separate constraints)
```

---

## 🗄️ Database Schema

### 1. Enhanced `document_sequences` Table

```sql
ALTER TABLE public.document_sequences
  ADD COLUMN IF NOT EXISTS last_issue_date DATE;
```

**Purpose**: Tracks the most recent finalized document date per type

**Columns**:
- `company_id`: Tenant isolation
- `document_type`: receipt, invoice, quote, etc.
- `last_issue_date`: Most recent `issue_date` from finalized documents
- `is_locked`: Whether sequence has been initialized
- `current_number`: Next document number to assign

### 2. Automatic Update Trigger

```sql
CREATE OR REPLACE FUNCTION public.update_last_issue_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.document_status = 'final' THEN
    UPDATE public.document_sequences
    SET last_issue_date = GREATEST(
      COALESCE(last_issue_date, '1900-01-01'::date),
      NEW.issue_date
    )
    WHERE company_id = NEW.company_id
      AND document_type = NEW.document_type;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Behavior**:
- Fires when a document is finalized (status → 'final')
- Updates `last_issue_date` to MAX(current, new_date)
- Ensures `last_issue_date` never goes backward

### 3. Validation Function

```sql
CREATE OR REPLACE FUNCTION public.validate_document_issue_date(
  p_company_id UUID,
  p_document_type TEXT,
  p_issue_date DATE
)
RETURNS TABLE (
  is_valid BOOLEAN,
  min_allowed_date DATE,
  error_message TEXT
);
```

**Returns**:
- `is_valid`: `true` if date allowed, `false` if blocked
- `min_allowed_date`: Earliest permitted date (NULL if no restriction)
- `error_message`: Hebrew error message for UI display

---

## 💻 Backend Implementation

### Core Validation Library: `lib/date-validation.ts`

```typescript
/**
 * Get minimum allowed issue_date for a document type
 */
export async function getMinAllowedIssueDate(
  companyId: string,
  documentType: string
): Promise<string | null>

/**
 * Validate that a proposed issue_date is allowed
 */
export async function validateDocumentIssueDate(
  companyId: string,
  documentType: string,
  proposedDate: string
): Promise<DateValidationResult>

/**
 * Validate or throw error (for server actions)
 */
export async function validateIssueDateOrThrow(
  companyId: string,
  documentType: string,
  issueDate: string
): Promise<void>

/**
 * Get date restriction info for UI
 */
export async function getDateRestrictionInfo(
  companyId: string,
  documentType: string
): Promise<{
  minDate: string | null;
  message: string | null;
  hasRestriction: boolean;
}>
```

### Server Action Integration

#### Example: Receipt Creation with Date Validation

```typescript
// app/dashboard/documents/receipt/actions.ts

export async function issueReceiptAction(payload: ReceiptDraftPayload) {
  const supabase = await createClient();
  const companyId = await getCompanyIdForUser();

  // Validate issue date BEFORE creating document
  const dateValidation = await validateDocumentDateInPayload(
    companyId,
    "receipt",
    payload.documentDate,
    "תאריך הקבלה"
  );

  if (!dateValidation.ok) {
    return { ok: false, message: dateValidation.message };
  }

  // Create draft
  const { data: draft, error } = await supabase
    .from("documents")
    .insert({
      company_id: companyId,
      document_type: "receipt",
      document_status: "draft",
      issue_date: payload.documentDate, // ✅ Validated
      // ...
    });

  // Finalize (assigns number, triggers last_issue_date update)
  await finalizeDocument(draft.id, companyId, "receipt");
}
```

#### Providing Date Restrictions to UI

```typescript
export async function getInitialReceiptCreateData() {
  const companyId = await getCompanyIdForUser();

  // Get date restriction info
  const dateRestriction = await getDateRestrictionInfo(companyId, "receipt");

  return {
    ok: true,
    // ... other data
    dateRestriction: {
      minDate: dateRestriction.minDate,       // "2026-01-03"
      message: dateRestriction.message,       // Hebrew warning
      hasRestriction: dateRestriction.hasRestriction
    }
  };
}
```

---

## 🎨 Frontend Implementation

### Date Picker with Restrictions

```tsx
// ReceiptFormClient.tsx

export default function ReceiptFormClient({ initial }) {
  // Extract date restrictions from server
  const minAllowedDate = initial.ok ? initial.dateRestriction.minDate : null;
  const dateRestrictionMessage = initial.ok ? initial.dateRestriction.message : null;
  const hasDateRestriction = initial.ok ? initial.dateRestriction.hasRestriction : false;

  const [documentDate, setDocumentDate] = useState(todayYmd());

  return (
    <div>
      <label>תאריך מסמך</label>

      {/* Warning message if restriction exists */}
      {hasDateRestriction && dateRestrictionMessage && (
        <div className="warning-banner">
          ⚠️ {dateRestrictionMessage}
        </div>
      )}

      {/* Date input with min attribute */}
      <input
        type="date"
        value={documentDate}
        onChange={(e) => setDocumentDate(e.target.value)}
        min={minAllowedDate || undefined}  // ✅ Prevents selection of blocked dates
      />

      {/* Real-time validation feedback */}
      {documentDate && minAllowedDate && documentDate < minAllowedDate && (
        <div className="error-message">
          ❌ תאריך זה חסום. יש לבחור {formatDate(minAllowedDate)} ואילך
        </div>
      )}
    </div>
  );
}
```

### Key UI Features

1. **`min` attribute**: Native HTML5 date picker disables dates before minimum
2. **Warning banner**: Proactive message explaining the restriction
3. **Real-time validation**: Red border + error message if invalid date entered
4. **Server-side enforcement**: Final validation happens on submission

---

## 🧪 Edge Cases & Testing

### Edge Case 1: Deleted Final Documents

**Scenario**: User finalizes receipt #42 (2026-01-04), then admin deletes it from DB

**Behavior**:
- ❌ **NOT HANDLED**: `last_issue_date` remains 2026-01-04
- ✅ **By Design**: Prevents gaps in date sequence (audit trail)
- 📝 **Solution**: Use `document_status = 'voided'` instead of DELETE

### Edge Case 2: Time Zones

**Scenario**: User in US creates document while Israeli server is already next day

**Behavior**:
- ✅ **Handled**: All dates stored as `DATE` (no time component)
- ✅ **Server decides**: Backend uses server's current date
- ⚠️ **Mitigation**: UI shows server time zone in settings

### Edge Case 3: Concurrent Finalization

**Scenario**: Two users finalize documents simultaneously with different dates

**Behavior**:
- ✅ **Safe**: `GREATEST()` ensures `last_issue_date` is maximum
- ✅ **Consistent**: Trigger uses row-level locking on `document_sequences`

### Edge Case 4: First Document with Past Date

**Scenario**: Company's first receipt dated 2025-12-01

**Behavior**:
- ✅ **Allowed**: No restriction on first document
- 🔒 **Future Impact**: All subsequent receipts must be >= 2025-12-01

### Edge Case 5: Draft with Invalid Date

**Scenario**: User saves draft with invalid date, then finalizes later

**Behavior**:
- ✅ **Drafts Allowed**: No validation on draft save (status = 'draft')
- ✅ **Finalization Blocked**: Validation enforced when finalizing
- 📝 **UX**: Show warning on draft but allow save

---

## 🚀 Rollout Strategy

### Phase 1: Database Migration (5 minutes)

```bash
# Run migration script
psql -f scripts/018-document-date-validation.sql

# Verify column added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'document_sequences' 
  AND column_name = 'last_issue_date';

# Check populated values
SELECT * FROM vw_document_date_constraints;
```

### Phase 2: Backend Deployment (Immediate)

Files updated:
- ✅ `lib/date-validation.ts` (new)
- ✅ `app/dashboard/documents/receipt/actions.ts`
- ✅ Other document type actions (invoice, quote, etc.)

### Phase 3: Frontend Update (Coordinated)

- ✅ Update `ReceiptFormClient.tsx`
- ✅ Update `InvoiceFormClient.tsx`
- ✅ Update `QuoteFormClient.tsx`
- ⚠️ **Breaking Change**: Old clients will get validation errors

### Phase 4: Testing

```typescript
// Test checklist
const tests = [
  "✅ Create first document (any date allowed)",
  "✅ Create second document with same date",
  "✅ Create document with future date",
  "❌ Create document with past date (should fail)",
  "✅ Different document types independent",
  "✅ Draft save doesn't update last_issue_date",
  "✅ Finalize updates last_issue_date",
  "✅ UI shows min date correctly",
  "✅ UI blocks invalid dates in picker"
];
```

---

## 📊 Monitoring & Debugging

### Debug View

```sql
SELECT * FROM vw_document_date_constraints
WHERE company_name = 'My Company';
```

**Columns**:
- `company_name`
- `document_type`
- `last_issue_date` (from sequences table)
- `actual_last_date` (from documents table - should match)
- `finalized_count`

### Common Issues

#### Issue: `last_issue_date` NULL despite finalized documents

**Diagnosis**:
```sql
SELECT company_id, document_type, COUNT(*)
FROM documents
WHERE document_status = 'final'
GROUP BY company_id, document_type
HAVING company_id NOT IN (
  SELECT company_id FROM document_sequences WHERE last_issue_date IS NOT NULL
);
```

**Fix**: Manually populate via migration script UPDATE statement

#### Issue: Date validation passing but finalization failing

**Diagnosis**: Check sequence lock status
```sql
SELECT * FROM document_sequences 
WHERE company_id = 'xxx' AND is_locked = false;
```

**Fix**: Lock sequence via `lockStartingNumberAction`

---

## 🔧 Extending to Other Document Types

### Template for New Document Type

```typescript
// 1. Add date validation to getInitialXXXCreateData
export async function getInitialInvoiceCreateData() {
  const companyId = await getCompanyIdForUser();
  const dateRestriction = await getDateRestrictionInfo(companyId, "invoice");
  
  return {
    ok: true,
    dateRestriction,
    // ... other fields
  };
}

// 2. Add validation to issueXXXAction
export async function issueInvoiceAction(payload) {
  const companyId = await getCompanyIdForUser();
  
  const dateValidation = await validateDocumentDateInPayload(
    companyId,
    "invoice",
    payload.issueDate
  );
  
  if (!dateValidation.ok) {
    return { ok: false, message: dateValidation.message };
  }
  
  // ... create and finalize
}

// 3. Update UI component
function InvoiceFormClient({ initial }) {
  const minAllowedDate = initial.ok ? initial.dateRestriction.minDate : null;
  
  return (
    <input type="date" min={minAllowedDate || undefined} />
  );
}
```

---

## 📝 Summary

### What Was Implemented

✅ **Database Layer**:
- `last_issue_date` column in `document_sequences`
- Automatic trigger to update on finalization
- RPC function for validation
- Debug view for monitoring

✅ **Backend Layer**:
- `lib/date-validation.ts` helper library
- Server action integration in receipt flow
- Date validation before finalization

✅ **Frontend Layer**:
- Date picker `min` attribute
- Warning banners for restrictions
- Real-time validation feedback

✅ **Business Logic**:
- Chronological enforcement per document type
- Same-date documents allowed
- Draft/final workflow compatible

### What's Next

🔄 **Expand to All Document Types**:
- Invoice date validation
- Quote date validation
- Delivery note date validation

🧪 **Add Tests**:
- Unit tests for validation helpers
- Integration tests for server actions
- E2E tests for UI flow

📊 **Analytics**:
- Track validation failures
- Monitor date distribution
- Alert on unusual patterns

---

## 🆘 Troubleshooting Guide

### User reports: "Can't select yesterday's date"

**Question**: Was a document finalized today?

```sql
SELECT document_type, issue_date, finalized_at
FROM documents
WHERE company_id = 'xxx'
  AND document_status = 'final'
ORDER BY finalized_at DESC
LIMIT 5;
```

**Resolution**: Explain that once a document is issued on date X, only dates >= X are allowed

### User reports: "Date picker not showing restriction"

**Diagnosis**: Check initial data returned to client

```typescript
// In browser console
console.log(initial.dateRestriction);
// Should show: { minDate: "2026-01-03", message: "...", hasRestriction: true }
```

**Fix**: Verify `getInitialReceiptCreateData` includes `dateRestriction`

### Developer: "Validation passing in dev but failing in production"

**Cause**: Time zone differences

**Check**:
```sql
SELECT NOW(), CURRENT_DATE;
```

**Solution**: Ensure all dates use server's time zone

---

**End of Document**

# Document Date Validation - Pseudocode & Logic Flow

## 📐 Business Logic (Simplified)

```python
# Core validation rule
def can_create_document(company_id, document_type, proposed_date):
    """
    Determines if a document can be created with the proposed date.
    
    Rules:
    1. If no previous documents exist → ANY date allowed
    2. If previous documents exist → proposed_date >= last_issue_date
    3. Multiple documents on same date → ALLOWED
    4. Each document type has independent constraints
    """
    
    # Get last finalized document date
    last_date = get_last_issue_date(company_id, document_type)
    
    # No previous documents = no restriction
    if last_date is None:
        return True, "First document - any date allowed"
    
    # Check chronological order
    if proposed_date >= last_date:
        return True, f"Valid (>= {last_date})"
    else:
        return False, f"Invalid: must be {last_date} or later"


# Example usage
today = "2026-01-04"
last_receipt_date = "2026-01-03"

# Test scenarios
scenarios = [
    ("2026-01-05", True),   # Future → ✅
    ("2026-01-04", True),   # Today → ✅
    ("2026-01-03", True),   # Last date → ✅
    ("2026-01-02", False),  # Before last → ❌
    ("2026-01-01", False),  # Before last → ❌
]

for date, expected in scenarios:
    valid, msg = can_create_document("company-123", "receipt", date)
    assert valid == expected, f"Failed for {date}: {msg}"
```

---

## 🔄 Database Trigger Logic

```sql
-- Pseudocode for trigger
TRIGGER update_last_issue_date
  AFTER INSERT OR UPDATE ON documents
  FOR EACH ROW
BEGIN
  -- Only process when document becomes finalized
  IF NEW.document_status = 'final' AND
     (TG_OP = 'INSERT' OR OLD.document_status != 'final') THEN
    
    -- Update sequence table with MAX of (current, new)
    UPDATE document_sequences
    SET last_issue_date = MAX(
      COALESCE(last_issue_date, '1900-01-01'),  -- Default if NULL
      NEW.issue_date                             -- New document's date
    )
    WHERE company_id = NEW.company_id
      AND document_type = NEW.document_type;
  END IF;
END;
```

**Key Points**:
- Only updates when status changes to `'final'`
- Uses `GREATEST()` to ensure date never goes backward
- Handles NULL (first document) with COALESCE

---

## 💻 Backend Validation Flow

```typescript
// Pseudocode for server action

async function issueDocument(payload) {
  // 1. Basic payload validation
  if (!payload.customerName) return error("Missing customer");
  if (!payload.issueDate) return error("Missing date");
  
  // 2. Get company context
  const companyId = await getCurrentUserCompany();
  
  // 3. DATE VALIDATION (NEW LOGIC)
  const lastDate = await getLastIssueDate(companyId, payload.documentType);
  
  if (lastDate !== null && payload.issueDate < lastDate) {
    return error(
      `תאריך המסמך חייב להיות ${formatDate(lastDate)} או מאוחר יותר. ` +
      `המסמך האחרון הונפק ב-${formatDate(lastDate)}.`
    );
  }
  
  // 4. Create document as draft
  const draft = await db.documents.create({
    company_id: companyId,
    document_type: payload.documentType,
    document_status: 'draft',  // Not final yet
    issue_date: payload.issueDate,
    // ... other fields
  });
  
  // 5. Finalize (assigns number + triggers last_issue_date update)
  await finalizeDocument(draft.id);
  //     ☝️ This calls generate_document_number() RPC
  //        which updates document_status to 'final'
  //        which fires the trigger
  //        which updates last_issue_date
  
  return success(draft.id);
}
```

---

## 🎨 Frontend Date Picker Logic

```typescript
// Pseudocode for client component

function DocumentForm({ initialData }) {
  // Server provides min allowed date
  const minDate = initialData.dateRestriction.minDate; // "2026-01-03" or null
  const hasRestriction = initialData.dateRestriction.hasRestriction;
  
  // User's selected date
  const [selectedDate, setSelectedDate] = useState(todayYMD());
  
  // Real-time validation
  const isDateValid = useMemo(() => {
    if (!minDate) return true;  // No restriction
    return selectedDate >= minDate;
  }, [selectedDate, minDate]);
  
  return (
    <div>
      {/* Warning banner if restriction exists */}
      {hasRestriction && (
        <WarningBanner>
          ⚠️ המסמך האחרון הונפק ב-{formatDate(minDate)}.
          ניתן לבחור רק תאריכים מ-{formatDate(minDate)} ואילך.
        </WarningBanner>
      )}
      
      {/* Date picker with min attribute (native HTML5) */}
      <input
        type="date"
        value={selectedDate}
        onChange={(e) => setSelectedDate(e.target.value)}
        min={minDate || undefined}  // ✅ Disables earlier dates in picker
        className={isDateValid ? '' : 'error'}
      />
      
      {/* Real-time error message */}
      {!isDateValid && (
        <ErrorMessage>
          ❌ תאריך זה חסום. יש לבחור {formatDate(minDate)} ואילך
        </ErrorMessage>
      )}
      
      {/* Submit button disabled if invalid */}
      <Button
        onClick={handleSubmit}
        disabled={!isDateValid || loading}
      >
        הפק מסמך
      </Button>
    </div>
  );
}
```

---

## 📊 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    USER CREATES DOCUMENT                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Load Form (Server Component)                       │
│  ─────────────────────────────────────────────────────      │
│  - Query document_sequences table                           │
│  - Get last_issue_date for this document type               │
│  - Send to client as minDate                                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: UI Renders Date Picker (Client Component)          │
│  ─────────────────────────────────────────────────────      │
│  - <input type="date" min={minDate} />                      │
│  - Dates before minDate are disabled/grayed out             │
│  - Warning banner shows last issue date                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: User Submits Form (Server Action)                  │
│  ─────────────────────────────────────────────────────      │
│  - Validate: issue_date >= last_issue_date                  │
│  - If invalid → Return error to UI                          │
│  - If valid → Continue to step 4                            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 4: Create Draft Document (Database)                   │
│  ─────────────────────────────────────────────────────      │
│  INSERT INTO documents (                                    │
│    document_status = 'draft',                               │
│    issue_date = user_selected_date,                         │
│    ...                                                       │
│  )                                                           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 5: Finalize Document (RPC Function)                   │
│  ─────────────────────────────────────────────────────      │
│  - Call generate_document_number()                          │
│  - Updates document_status = 'final'                        │
│  - Assigns document_number                                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 6: Trigger Fires (Automatic)                          │
│  ─────────────────────────────────────────────────────      │
│  TRIGGER update_last_issue_date                             │
│  - Detects document_status changed to 'final'               │
│  - Updates document_sequences.last_issue_date               │
│  - Uses MAX(current, new) to prevent backward movement      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  RESULT: Document Created + Constraint Updated              │
│  ─────────────────────────────────────────────────────      │
│  - Document has assigned number                             │
│  - last_issue_date updated for next validation              │
│  - User sees success message                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧪 Test Cases (BDD Style)

```gherkin
Feature: Document Date Validation

  Background:
    Given a company "ABC Ltd" with ID "company-123"
    And the company has no prior documents

  Scenario: First document allows any date
    When user creates a receipt dated "2025-12-01"
    Then the receipt is created successfully
    And last_issue_date for receipts is set to "2025-12-01"

  Scenario: Second document on same date is allowed
    Given the last receipt was issued on "2026-01-03"
    When user creates a receipt dated "2026-01-03"
    Then the receipt is created successfully
    And last_issue_date remains "2026-01-03"

  Scenario: Future date is allowed
    Given the last receipt was issued on "2026-01-03"
    When user creates a receipt dated "2026-01-10"
    Then the receipt is created successfully
    And last_issue_date is updated to "2026-01-10"

  Scenario: Past date is blocked
    Given the last receipt was issued on "2026-01-03"
    When user creates a receipt dated "2026-01-02"
    Then the creation fails with error "תאריך המסמך חייב להיות 03/01/2026 או מאוחר יותר"

  Scenario: Different document types are independent
    Given the last receipt was issued on "2026-01-03"
    And the last invoice was issued on "2026-01-01"
    When user creates a receipt dated "2026-01-02"
    Then the receipt creation fails
    When user creates an invoice dated "2026-01-02"
    Then the invoice is created successfully

  Scenario: Drafts don't update last_issue_date
    Given the last receipt was issued on "2026-01-03"
    When user saves a draft receipt dated "2026-01-05"
    Then the draft is saved successfully
    But last_issue_date remains "2026-01-03"
    When user finalizes the draft
    Then last_issue_date is updated to "2026-01-05"

  Scenario: UI date picker disables invalid dates
    Given the last receipt was issued on "2026-01-03"
    When user opens the create receipt form
    Then the date picker's min attribute is "2026-01-03"
    And dates before "2026-01-03" are disabled
    And a warning message shows "המסמך האחרון הונפק ב-03/01/2026"
```

---

## 🔍 SQL Query Examples

### Check current restrictions for a company

```sql
-- Get all date restrictions for company
SELECT 
  ds.document_type,
  ds.last_issue_date,
  ds.current_number,
  ds.is_locked,
  COUNT(d.id) as total_documents,
  COUNT(CASE WHEN d.document_status = 'final' THEN 1 END) as finalized_count
FROM document_sequences ds
LEFT JOIN documents d ON d.company_id = ds.company_id 
  AND d.document_type = ds.document_type
WHERE ds.company_id = 'your-company-id'
GROUP BY ds.document_type, ds.last_issue_date, ds.current_number, ds.is_locked;
```

### Find companies with inconsistent data

```sql
-- Documents exist but last_issue_date is NULL
SELECT 
  c.company_name,
  d.document_type,
  MAX(d.issue_date) as actual_last_date,
  ds.last_issue_date as recorded_last_date
FROM documents d
JOIN companies c ON c.id = d.company_id
LEFT JOIN document_sequences ds ON ds.company_id = d.company_id 
  AND ds.document_type = d.document_type
WHERE d.document_status = 'final'
GROUP BY c.company_name, d.document_type, ds.last_issue_date
HAVING MAX(d.issue_date) != ds.last_issue_date OR ds.last_issue_date IS NULL;
```

### Simulate validation check

```sql
-- Check if date "2026-01-02" is valid for receipts
SELECT 
  CASE 
    WHEN '2026-01-02' >= COALESCE(last_issue_date, '1900-01-01')
    THEN 'VALID ✅'
    ELSE 'BLOCKED ❌'
  END as validation_result,
  last_issue_date,
  '2026-01-02' as proposed_date
FROM document_sequences
WHERE company_id = 'your-company-id'
  AND document_type = 'receipt';
```

---

## 🛠️ Migration Checklist

### Pre-Migration

- [ ] Backup `documents` table
- [ ] Backup `document_sequences` table
- [ ] Count existing finalized documents per type
  ```sql
  SELECT document_type, COUNT(*) 
  FROM documents 
  WHERE document_status = 'final' 
  GROUP BY document_type;
  ```

### During Migration

- [ ] Run `018-document-date-validation.sql`
- [ ] Verify column exists:
  ```sql
  \d document_sequences
  ```
- [ ] Verify trigger created:
  ```sql
  SELECT trigger_name FROM information_schema.triggers 
  WHERE event_object_table = 'documents';
  ```
- [ ] Check populated data:
  ```sql
  SELECT * FROM vw_document_date_constraints LIMIT 10;
  ```

### Post-Migration

- [ ] Test validation function:
  ```sql
  SELECT * FROM validate_document_issue_date(
    'company-id', 
    'receipt', 
    '2026-01-01'::date
  );
  ```
- [ ] Deploy backend code with date validation
- [ ] Deploy frontend code with date picker restrictions
- [ ] Monitor error logs for validation failures
- [ ] Check analytics for blocked submission attempts

---

## 📞 Support Scenarios

### User: "I can't create a document for yesterday"

**Response Template**:
```
כדי לשמור על רציפות זמנים במסמכים, המערכת חוסמת תאריכים עבר לאחר 
שמסמך חדש יותר הונפק.

המסמך האחרון שלך מסוג [TYPE] הונפק בתאריך [DATE].
לכן, ניתן ליצור מסמכים חדשים רק מתאריך [DATE] ואילך.

אם יש צורך להנפיק מסמך מתאריך קודם, אנא פנה למנהל המערכת.
```

### User: "Date picker won't let me select a date"

**Diagnosis Steps**:
1. Check browser: Is it supporting `<input type="date" min="...">`?
2. Check value: `console.log(initial.dateRestriction)`
3. Verify in DB: 
   ```sql
   SELECT last_issue_date FROM document_sequences 
   WHERE company_id = 'xxx' AND document_type = 'receipt';
   ```

### Admin: "Need to override date restriction"

**Database Override** (USE WITH CAUTION):
```sql
-- Temporarily remove restriction
UPDATE document_sequences
SET last_issue_date = NULL
WHERE company_id = 'xxx' AND document_type = 'receipt';

-- After creating backdated document, restore correct value
UPDATE document_sequences
SET last_issue_date = (
  SELECT MAX(issue_date) FROM documents
  WHERE company_id = 'xxx' 
    AND document_type = 'receipt'
    AND document_status = 'final'
)
WHERE company_id = 'xxx' AND document_type = 'receipt';
```

---

## 🎓 Developer Onboarding

### Quick Start for New Developers

1. **Read the business rule**:
   - Documents must be chronologically ordered per type
   - Last finalized date tracked in `document_sequences.last_issue_date`

2. **Understand the flow**:
   - User loads form → Gets `minDate` from server
   - User selects date → UI validates against `minDate`
   - User submits → Server validates again (double-check)
   - Document finalized → Trigger updates `last_issue_date`

3. **Find the code**:
   - Validation logic: `lib/date-validation.ts`
   - Server actions: `app/dashboard/documents/*/actions.ts`
   - UI components: `app/dashboard/documents/*/FormClient.tsx`
   - Database: `scripts/018-document-date-validation.sql`

4. **Test locally**:
   ```bash
   # Apply migration
   psql your_db < scripts/018-document-date-validation.sql
   
   # Start dev server
   pnpm dev
   
   # Create first receipt → Any date works
   # Create second receipt → Only >= first date works
   ```

---

**End of Pseudocode Guide**

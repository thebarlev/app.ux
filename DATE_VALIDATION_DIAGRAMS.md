# Document Date Validation - Visual Examples

## 📊 Scenario Diagrams

### Scenario 1: Creating First Document (No Restrictions)

```
┌─────────────────────────────────────────────────────┐
│  COMPANY: ABC Ltd                                   │
│  DOCUMENT TYPE: Receipt                             │
│  PREVIOUS DOCUMENTS: None                           │
└─────────────────────────────────────────────────────┘

DATABASE STATE (Before):
┌──────────────────────────────────────┐
│ document_sequences                   │
├──────────────────────────────────────┤
│ company_id: abc-123                  │
│ document_type: receipt               │
│ last_issue_date: NULL ← No docs yet! │
│ current_number: 0                    │
│ is_locked: true                      │
└──────────────────────────────────────┘

USER ACTION:
┌──────────────────────────────────────┐
│ 📝 Create Receipt                    │
│ Customer: John Doe                   │
│ Date: 2025-12-15  ← Any date OK!     │
│ Amount: 1,000                        │
└──────────────────────────────────────┘

VALIDATION:
✅ No restriction exists
✅ Allow creation

DATABASE STATE (After):
┌──────────────────────────────────────┐
│ documents                            │
├──────────────────────────────────────┤
│ id: doc-001                          │
│ document_number: 000001              │
│ document_status: final               │
│ issue_date: 2025-12-15               │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ document_sequences                   │
├──────────────────────────────────────┤
│ company_id: abc-123                  │
│ document_type: receipt               │
│ last_issue_date: 2025-12-15 ← SET!   │
│ current_number: 1                    │
└──────────────────────────────────────┘
```

---

### Scenario 2: Same-Day Documents (Allowed)

```
TODAY: 2026-01-04

DATABASE STATE:
┌──────────────────────────────────────┐
│ document_sequences                   │
├──────────────────────────────────────┤
│ last_issue_date: 2026-01-04          │
└──────────────────────────────────────┘

EXISTING DOCUMENTS:
Receipt #001: 2026-01-04 (10:00 AM)
Receipt #002: 2026-01-04 (11:30 AM)

USER ACTION:
Create Receipt #003
Date: 2026-01-04 ← Same day!
Time: 2:45 PM

VALIDATION:
2026-01-04 >= 2026-01-04 ✅ PASS
Multiple docs same day ✅ ALLOWED

RESULT:
Receipt #003 created successfully ✅
last_issue_date remains 2026-01-04 (unchanged)
```

---

### Scenario 3: Future Date (Allowed)

```
TODAY: 2026-01-04

DATABASE STATE:
┌──────────────────────────────────────┐
│ last_issue_date: 2026-01-03          │
└──────────────────────────────────────┘

USER ACTION:
Create Receipt
Date: 2026-01-10 ← Future date

VALIDATION:
2026-01-10 >= 2026-01-03 ✅ PASS

RESULT:
Receipt created ✅
last_issue_date updated to 2026-01-10

┌──────────────────────────────────────┐
│ last_issue_date: 2026-01-10 ← NEW!   │
└──────────────────────────────────────┘
```

---

### Scenario 4: Backdating (BLOCKED)

```
TODAY: 2026-01-04

DATABASE STATE:
┌──────────────────────────────────────┐
│ last_issue_date: 2026-01-03          │
└──────────────────────────────────────┘

USER ACTION:
Create Receipt
Date: 2026-01-02 ← Earlier than last!

VALIDATION:
2026-01-02 < 2026-01-03 ❌ FAIL

ERROR MESSAGE (Hebrew):
┌──────────────────────────────────────────────────────┐
│ ❌ תאריך המסמך חייב להיות 03/01/2026 או מאוחר יותר. │
│    המסמך האחרון הונפק ב-03/01/2026.                  │
└──────────────────────────────────────────────────────┘

RESULT:
❌ Creation blocked
User must select 01-03 or later
```

---

## 🎨 UI Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                  USER OPENS CREATE RECEIPT FORM             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────────┐
        │  Server: getInitialReceiptCreateData() │
        │  ─────────────────────────────────────│
        │  Query: last_issue_date from DB        │
        │  Return: { minDate: "2026-01-03" }     │
        └────────────────┬───────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│  UI RENDERS FORM                                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ תאריך מסמך                                           │ │
│  │                                                        │ │
│  │ ⚠️ המסמך האחרון הונפק ב-03/01/2026.                  │ │
│  │    ניתן לבחור רק תאריכים מ-03/01/2026 ואילך.        │ │
│  │                                                        │ │
│  │ ┌────────────────────────────────────────┐            │ │
│  │ │  [2026-01-04 ▼]  ← Date picker         │            │ │
│  │ │                                         │            │ │
│  │ │  min="2026-01-03"                      │            │ │
│  │ │  Dates < 01-03 are DISABLED/GRAYED     │            │ │
│  │ └────────────────────────────────────────┘            │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
                         │
                         │ User selects date
                         ▼
        ┌────────────────────────────────────┐
        │  REAL-TIME VALIDATION              │
        │  ────────────────────────────────  │
        │  IF selected < minDate:            │
        │    → Show red border               │
        │    → Show error message            │
        │    → Disable submit button         │
        │  ELSE:                             │
        │    → Normal appearance             │
        │    → Enable submit button          │
        └────────────────┬───────────────────┘
                         │
                         │ User clicks "הפק קבלה"
                         ▼
        ┌────────────────────────────────────┐
        │  Server: issueReceiptAction()      │
        │  ────────────────────────────────  │
        │  1. Validate payload               │
        │  2. Validate date >= last_date     │
        │  3. Create draft                   │
        │  4. Finalize (trigger fires)       │
        └────────────────┬───────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────┐
        │  DATABASE TRIGGER                  │
        │  ────────────────────────────────  │
        │  UPDATE document_sequences         │
        │  SET last_issue_date = MAX(...)    │
        └────────────────┬───────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────┐
        │  ✅ Receipt Created Successfully!  │
        │  PDF Generated                     │
        │  Redirect to Documents List        │
        └────────────────────────────────────┘
```

---

## 📅 Calendar View Example

```
JANUARY 2026
Su Mo Tu We Th Fr Sa
             01 02 03
04 05 06 07 08 09 10
11 12 13 14 15 16 17
18 19 20 21 22 23 24
25 26 27 28 29 30 31

LAST RECEIPT ISSUED: January 3, 2026

DATE PICKER STATE:
─────────────────────────────────────
01 ❌ DISABLED (before last)
02 ❌ DISABLED (before last)
03 ✅ ENABLED  (last date - OK)
04 ✅ ENABLED  (today - OK)
05 ✅ ENABLED  (future - OK)
06+ ✅ ENABLED (future - OK)
```

---

## 🔄 Multi-Type Independence

```
COMPANY: ABC Ltd
TODAY: 2026-01-04

┌─────────────────────────────────────────────────────┐
│  DOCUMENT TYPE    │  LAST DATE   │  MIN ALLOWED     │
├───────────────────┼──────────────┼──────────────────┤
│  Receipt          │  2026-01-04  │  2026-01-04      │
│  Invoice          │  2026-01-01  │  2026-01-01      │
│  Quote            │  NULL        │  Any date        │
│  Delivery Note    │  2025-12-20  │  2025-12-20      │
└─────────────────────────────────────────────────────┘

EXAMPLE VALIDATION:
┌──────────────────────────────────────────────────────┐
│ Create Receipt dated 2026-01-02                      │
│ → 2026-01-02 < 2026-01-04 ❌ BLOCKED                 │
├──────────────────────────────────────────────────────┤
│ Create Invoice dated 2026-01-02                      │
│ → 2026-01-02 >= 2026-01-01 ✅ ALLOWED                │
├──────────────────────────────────────────────────────┤
│ Create Quote dated 2025-01-01                        │
│ → No restriction ✅ ALLOWED                          │
└──────────────────────────────────────────────────────┘

Each type has INDEPENDENT constraint!
```

---

## 🎯 Validation Decision Tree

```
                    [User submits document]
                             │
                             ▼
                    ┌────────────────────┐
                    │ Is date provided?  │
                    └────────┬───────────┘
                             │
                 ┌───────────┴───────────┐
                 │                       │
               NO │                      │ YES
                 ▼                       ▼
         ┌───────────────┐    ┌──────────────────────┐
         │ ❌ Error:     │    │ Query: last_issue_date│
         │ "חובה לבחור  │    │ for this type         │
         │ תאריך"        │    └──────────┬───────────┘
         └───────────────┘               │
                                         ▼
                              ┌─────────────────────┐
                              │ last_issue_date     │
                              │ exists?             │
                              └──────┬──────────────┘
                                     │
                         ┌───────────┴───────────┐
                         │                       │
                      NULL│                      │ EXISTS
                         ▼                       ▼
                 ┌──────────────┐    ┌──────────────────────┐
                 │ ✅ ALLOW     │    │ proposed >= last?    │
                 │ (First doc)  │    └──────┬───────────────┘
                 └──────────────┘           │
                                ┌───────────┴───────────┐
                                │                       │
                             YES│                      │NO
                                ▼                       ▼
                    ┌──────────────────┐   ┌──────────────────┐
                    │ ✅ ALLOW         │   │ ❌ ERROR:        │
                    │ Create document  │   │ "תאריך חייב      │
                    │ Finalize         │   │  להיות XX ואילך"│
                    │ Update last_date │   └──────────────────┘
                    └──────────────────┘
```

---

## 📈 Timeline Example

```
TIMELINE OF RECEIPTS FOR ABC LTD
═════════════════════════════════════════════════════════════

Dec 15      Jan 01      Jan 03      Jan 04 (TODAY)
  │           │           │             │
  ▼           ▼           ▼             ▼
┌────┐      ┌────┐      ┌────┐        
│#001│      │#002│      │#003│        ❓ New receipt?
└────┘      └────┘      └────┘        
                                      
last_issue_date: 2025-12-15
                  ▲ Updated to 2026-01-01
                                ▲ Updated to 2026-01-03
                                
CURRENT STATE: last_issue_date = 2026-01-03

NEXT RECEIPT OPTIONS:
✅ Date: 2026-01-03 (same as last)
✅ Date: 2026-01-04 (today)
✅ Date: 2026-01-05 (future)
❌ Date: 2026-01-02 (before last) ← BLOCKED!
❌ Date: 2026-01-01 (before last) ← BLOCKED!
❌ Date: 2025-12-31 (before last) ← BLOCKED!

═════════════════════════════════════════════════════════════
```

---

## 🎬 Animation of Trigger Behavior

```
STEP 1: User finalizes receipt dated 2026-01-04
┌──────────────────────────────────────────┐
│ documents table                          │
├──────────────────────────────────────────┤
│ UPDATE documents                         │
│ SET document_status = 'final'            │
│ WHERE id = 'receipt-123'                 │
└──────────────────────────────────────────┘
                 │
                 │ 🔥 TRIGGER FIRES!
                 ▼
┌──────────────────────────────────────────┐
│ FUNCTION: update_last_issue_date()       │
├──────────────────────────────────────────┤
│ IF NEW.document_status = 'final' THEN    │
│   current = SELECT last_issue_date       │
│             FROM document_sequences      │
│             WHERE ...                    │
│                                          │
│   new_date = NEW.issue_date              │
│                                          │
│   UPDATE document_sequences              │
│   SET last_issue_date = GREATEST(        │
│     COALESCE(current, '1900-01-01'),     │
│     new_date                             │
│   )                                      │
│ END IF                                   │
└──────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────┐
│ document_sequences table                 │
├──────────────────────────────────────────┤
│ BEFORE:                                  │
│   last_issue_date: 2026-01-03            │
│                                          │
│ AFTER:                                   │
│   last_issue_date: 2026-01-04 ← UPDATED! │
└──────────────────────────────────────────┘
```

---

## 🚦 Validation Layers

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 1: UI (Date Picker)                              │
│  ─────────────────────────────────────────────────────  │
│  <input type="date" min="2026-01-03" />                 │
│  → Prevents selection (grayed out)                      │
│  → User convenience                                     │
│  ⚠️ CAN BE BYPASSED (browser manipulation)              │
└─────────────────────────────────────────────────────────┘
                         │ Form submit
                         ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 2: Server Action (Backend)                       │
│  ─────────────────────────────────────────────────────  │
│  const validation = await validateDocumentDateInPayload()│
│  if (!validation.ok) return error()                     │
│  → Server-side check                                    │
│  → CANNOT BE BYPASSED                                   │
│  ✅ PRIMARY ENFORCEMENT LAYER                            │
└─────────────────────────────────────────────────────────┘
                         │ Document finalized
                         ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 3: Database Trigger                              │
│  ─────────────────────────────────────────────────────  │
│  TRIGGER update_last_issue_date                         │
│  → Maintains data consistency                           │
│  → Automatic, no manual updates needed                  │
│  → Ensures last_issue_date always accurate              │
│  ✅ CONSISTENCY GUARANTEE                                │
└─────────────────────────────────────────────────────────┘
```

---

**Visual Guide Complete** ✅

For implementation details, see:
- [DATE_VALIDATION_IMPLEMENTATION.md](DATE_VALIDATION_IMPLEMENTATION.md)
- [DATE_VALIDATION_QUICK_REF.md](DATE_VALIDATION_QUICK_REF.md)
- [DATE_VALIDATION_SUMMARY.md](DATE_VALIDATION_SUMMARY.md)

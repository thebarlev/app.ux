# 📅 Date Validation System - Quick Reference

## ⚡ Quick Facts

| What | Value |
|------|-------|
| **Feature** | Chronological document date enforcement |
| **Scope** | Per company, per document type |
| **Storage** | `document_sequences.last_issue_date` |
| **Enforcement** | Backend validation + UI date picker restriction |
| **Same-day docs** | ✅ Unlimited allowed |
| **Backdating** | ❌ Blocked after newer document issued |

---

## 🎯 The Rule (One Sentence)

**Documents of the same type must have `issue_date >= last_finalized_issue_date`.**

---

## 📋 Common Scenarios

| Last Doc Date | Today | Can Select | Cannot Select |
|---------------|-------|------------|---------------|
| 2026-01-03 | 2026-01-04 | 01-03, 01-04, 01-05+ | 01-02, 01-01, ... |
| 2026-01-04 | 2026-01-04 | 01-04, 01-05+ | 01-03, 01-02, ... |
| (none) | 2026-01-04 | **Any date** | - |
| 2025-12-15 | 2026-01-04 | 12-15, 12-16, ...today, future | 12-14, 12-13, ... |

---

## 💻 Code Snippets

### Get Date Restriction (Server)

```typescript
import { getDateRestrictionInfo } from "@/lib/date-validation";

const restriction = await getDateRestrictionInfo(companyId, "receipt");
// Returns: { minDate: "2026-01-03" | null, message: "...", hasRestriction: true/false }
```

### Validate Before Save (Server Action)

```typescript
import { validateDocumentDateInPayload } from "@/lib/date-validation";

const validation = await validateDocumentDateInPayload(
  companyId,
  "receipt",
  payload.issueDate,
  "תאריך הקבלה"
);

if (!validation.ok) {
  return { ok: false, message: validation.message };
}
```

### UI Date Picker

```tsx
<input
  type="date"
  value={date}
  min={minAllowedDate || undefined}
  onChange={(e) => setDate(e.target.value)}
/>
```

---

## 🗄️ Database Queries

### Check Current Restrictions

```sql
SELECT document_type, last_issue_date
FROM document_sequences
WHERE company_id = 'your-company-id';
```

### View All Constraints (Debug View)

```sql
SELECT * FROM vw_document_date_constraints
WHERE company_name = 'ABC Ltd';
```

### Manually Update (Admin Only)

```sql
-- Set restriction
UPDATE document_sequences
SET last_issue_date = '2026-01-03'
WHERE company_id = 'xxx' AND document_type = 'receipt';

-- Remove restriction (allows any date)
UPDATE document_sequences
SET last_issue_date = NULL
WHERE company_id = 'xxx' AND document_type = 'receipt';
```

---

## 🔧 Files Modified

| File | Purpose |
|------|---------|
| `scripts/018-document-date-validation.sql` | Database migration (column + trigger + RPC) |
| `lib/date-validation.ts` | Validation helper functions |
| `app/dashboard/documents/receipt/actions.ts` | Server-side validation in receipt flow |
| `app/dashboard/documents/receipt/ReceiptFormClient.tsx` | UI date picker restrictions |

---

## 🐛 Debugging Checklist

- [ ] Migration applied? `\d document_sequences` shows `last_issue_date` column?
- [ ] Trigger exists? `SELECT * FROM information_schema.triggers WHERE event_object_table = 'documents'`
- [ ] RPC function exists? `SELECT * FROM pg_proc WHERE proname = 'validate_document_issue_date'`
- [ ] Data populated? `SELECT * FROM vw_document_date_constraints LIMIT 5`
- [ ] UI getting data? `console.log(initial.dateRestriction)` in browser
- [ ] Backend validation? Check server logs for validation errors

---

## ⚠️ Edge Cases

1. **First document**: No restriction (any date allowed)
2. **Same date**: Multiple docs on same day ✅ allowed
3. **Drafts**: Don't update `last_issue_date` until finalized
4. **Different types**: Receipts and invoices have separate constraints
5. **Deleted docs**: `last_issue_date` doesn't go backward (by design)

---

## 🚀 Deployment Steps

```bash
# 1. Apply migration
psql -U your_user -d your_db -f scripts/018-document-date-validation.sql

# 2. Verify
psql -U your_user -d your_db -c "SELECT * FROM vw_document_date_constraints LIMIT 10;"

# 3. Deploy code (backend + frontend together)
git push origin main

# 4. Test in production
# - Create document with valid date → ✅
# - Create document with invalid date → ❌ "תאריך המסמך חייב להיות..."
```

---

## 📞 User Support Quick Responses

### "I can't select yesterday"
```
המסמך האחרון שלך הונפק ב-[DATE].
המערכת מונעת תאריכים עבר לאחר שמסמך חדש יותר הונפק.
ניתן ליצור מסמכים רק מתאריך [DATE] ואילך.
```

### "Why this restriction?"
```
כדי לשמור על רציפות זמנים ולמנוע פערים במספור המסמכים,
המערכת דורשת שמסמכים יונפקו בסדר כרונולוגי.
```

### "I need to backdate for a special case"
```
במקרים מיוחדים, מנהל המערכת יכול לעזור.
אנא פנה לתמיכה עם פרטי המקרה.
```

---

## 🎓 For New Developers

**Read this first**: [DATE_VALIDATION_IMPLEMENTATION.md](DATE_VALIDATION_IMPLEMENTATION.md)

**TL;DR**:
1. `document_sequences.last_issue_date` tracks last finalized date per type
2. Trigger auto-updates when document becomes 'final'
3. Backend validates before creating document
4. UI shows warning + disables invalid dates in picker
5. Each document type (receipt, invoice, etc.) is independent

**Test it**:
```bash
# Create first receipt → Any date works
# Create second receipt same date → Works
# Create third receipt future date → Works  
# Create fourth receipt past date → Should fail
```

---

## 📊 Monitoring

```sql
-- Count validation errors (if logging implemented)
SELECT DATE(created_at), COUNT(*) 
FROM error_logs 
WHERE error_code = 'INVALID_ISSUE_DATE'
GROUP BY DATE(created_at)
ORDER BY DATE(created_at) DESC;

-- Find companies with most restrictions
SELECT company_id, document_type, last_issue_date
FROM document_sequences
WHERE last_issue_date IS NOT NULL
ORDER BY last_issue_date DESC
LIMIT 20;
```

---

**Last Updated**: January 4, 2026  
**Version**: 1.0  
**Status**: ✅ Production Ready

# ✅ Document Date Validation - Deployment Checklist

## 📋 Pre-Deployment Verification

### 1. Files Review
- [ ] `scripts/018-document-date-validation.sql` exists and contains:
  - [ ] ALTER TABLE adding `last_issue_date` column
  - [ ] UPDATE statement to populate existing data
  - [ ] CREATE FUNCTION `update_last_issue_date()`
  - [ ] CREATE TRIGGER on `documents` table
  - [ ] CREATE FUNCTION `validate_document_issue_date()`
  - [ ] CREATE VIEW `vw_document_date_constraints`
  - [ ] CREATE INDEX for performance

- [ ] `lib/date-validation.ts` exists and exports:
  - [ ] `getMinAllowedIssueDate()`
  - [ ] `validateDocumentIssueDate()`
  - [ ] `validateIssueDateOrThrow()`
  - [ ] `getDateRestrictionInfo()`
  - [ ] `validateDocumentDateInPayload()`
  - [ ] Helper functions (formatIsraeliDate, getTodayYMD, etc.)

- [ ] `app/dashboard/documents/receipt/actions.ts` modified:
  - [ ] Imports from `lib/date-validation`
  - [ ] `InitialReceiptCreateData` type includes `dateRestriction`
  - [ ] `getInitialReceiptCreateData()` calls `getDateRestrictionInfo()`
  - [ ] `issueReceiptAction()` validates date before creation

- [ ] `app/dashboard/documents/receipt/ReceiptFormClient.tsx` modified:
  - [ ] Extracts `minAllowedDate`, `dateRestrictionMessage`, `hasDateRestriction`
  - [ ] Date input has `min` attribute
  - [ ] Warning banner displayed when restriction exists
  - [ ] Real-time validation error shown for invalid dates

### 2. Documentation Review
- [ ] `DATE_VALIDATION_IMPLEMENTATION.md` complete
- [ ] `DATE_VALIDATION_PSEUDOCODE.md` complete
- [ ] `DATE_VALIDATION_QUICK_REF.md` complete
- [ ] `DATE_VALIDATION_SUMMARY.md` complete
- [ ] `DATE_VALIDATION_DIAGRAMS.md` complete

---

## 🗄️ Database Deployment

### Step 1: Backup (CRITICAL!)
```bash
# Backup database
pg_dump -U your_user -d your_database > backup_before_date_validation_$(date +%Y%m%d_%H%M%S).sql

# Verify backup exists
ls -lh backup_*.sql
```
- [ ] Backup created successfully
- [ ] Backup file size reasonable (> 0 bytes)

### Step 2: Apply Migration
```bash
# Run migration
psql -U your_user -d your_database -f scripts/018-document-date-validation.sql

# Expected output:
# ALTER TABLE
# UPDATE X (X = number of existing sequences)
# CREATE FUNCTION
# CREATE TRIGGER
# CREATE FUNCTION
# CREATE VIEW
# CREATE INDEX
```
- [ ] Migration executed without errors
- [ ] All statements succeeded

### Step 3: Verify Database Changes
```sql
-- 1. Check column exists
\d document_sequences
-- Should show: last_issue_date | date | 

-- 2. Check trigger exists
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'trg_update_last_issue_date';
-- Should return 1 row

-- 3. Check RPC function exists
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name = 'validate_document_issue_date';
-- Should return 1 row (FUNCTION)

-- 4. Check view exists
SELECT * FROM vw_document_date_constraints LIMIT 5;
-- Should return rows (or 0 if no documents)

-- 5. Verify data populated
SELECT 
  document_type,
  last_issue_date,
  current_number
FROM document_sequences
WHERE last_issue_date IS NOT NULL;
-- Should show populated dates for companies with finalized docs
```
- [ ] Column `last_issue_date` exists
- [ ] Trigger `trg_update_last_issue_date` exists
- [ ] Function `validate_document_issue_date` exists  
- [ ] Function `update_last_issue_date` exists
- [ ] View `vw_document_date_constraints` accessible
- [ ] Index created successfully
- [ ] Existing data populated correctly

### Step 4: Test Database Functions
```sql
-- Test validation function (replace with actual company_id)
SELECT * FROM validate_document_issue_date(
  'your-company-id'::uuid,
  'receipt',
  '2026-01-05'::date
);
-- Should return: (true, [last_date or null], null)

SELECT * FROM validate_document_issue_date(
  'your-company-id'::uuid,
  'receipt',
  '2020-01-01'::date
);
-- Should return: (false, [last_date], 'תאריך המסמך חייב להיות...')
```
- [ ] Validation function returns correct results
- [ ] Error messages in Hebrew

---

## 💻 Code Deployment

### Step 1: Run Tests (if applicable)
```bash
# TypeScript type check
pnpm tsc --noEmit

# Linting
pnpm lint

# Build check
pnpm build
```
- [ ] No TypeScript errors
- [ ] No linting errors
- [ ] Build succeeds

### Step 2: Deploy to Production
```bash
# Commit changes
git add scripts/018-document-date-validation.sql
git add lib/date-validation.ts
git add app/dashboard/documents/receipt/actions.ts
git add app/dashboard/documents/receipt/ReceiptFormClient.tsx
git add DATE_VALIDATION_*.md

git commit -m "feat: implement document date validation system

- Add last_issue_date tracking to document_sequences
- Create validation helpers in lib/date-validation.ts
- Update receipt flow with date restrictions
- Add UI date picker min attribute
- Comprehensive documentation included"

# Push to production
git push origin main

# Deploy (method depends on your setup)
# Vercel: automatic on push
# Other: follow your deployment process
```
- [ ] Code committed
- [ ] Code pushed to repository
- [ ] Deployment triggered
- [ ] Deployment successful

---

## 🧪 Post-Deployment Testing

### Test 1: First Document (No Restriction)
1. [ ] Navigate to `/dashboard/documents/receipt/create`
2. [ ] Date picker should have **no min attribute** (or very old date)
3. [ ] Select any date in the past
4. [ ] Submit form
5. [ ] ✅ Document created successfully
6. [ ] Verify `last_issue_date` updated in database:
   ```sql
   SELECT last_issue_date FROM document_sequences
   WHERE company_id = 'your-company' AND document_type = 'receipt';
   ```

### Test 2: Same-Day Document
1. [ ] Create another receipt
2. [ ] Select **same date** as first receipt
3. [ ] Submit form
4. [ ] ✅ Document created successfully
5. [ ] `last_issue_date` remains unchanged

### Test 3: Future Date
1. [ ] Create another receipt
2. [ ] Select a **future date** (e.g., tomorrow)
3. [ ] Submit form
4. [ ] ✅ Document created successfully
5. [ ] `last_issue_date` updated to future date

### Test 4: Backdating (SHOULD FAIL)
1. [ ] Create another receipt
2. [ ] Try to select a **past date** (before last_issue_date)
3. [ ] UI should:
   - [ ] Show warning banner
   - [ ] Disable dates in picker before last_issue_date
   - [ ] Show red border if manually entered
4. [ ] If you bypass UI (e.g., via API):
   - [ ] Submit should fail
   - [ ] Error message: "תאריך המסמך חייב להיות XX או מאוחר יותר"
5. [ ] ❌ Document NOT created
6. [ ] `last_issue_date` unchanged

### Test 5: Different Document Type
1. [ ] Navigate to create invoice (or other document type)
2. [ ] Date restriction should be **independent** from receipts
3. [ ] Can select dates that would be blocked for receipts
4. [ ] ✅ Validation per document type works

### Test 6: Draft Behavior
1. [ ] Save a receipt as **draft** (not finalized)
2. [ ] Check database:
   ```sql
   SELECT last_issue_date FROM document_sequences
   WHERE company_id = 'your-company' AND document_type = 'receipt';
   ```
3. [ ] `last_issue_date` should **NOT have changed**
4. [ ] Finalize the draft
5. [ ] `last_issue_date` should **NOW be updated**

---

## 📊 Monitoring

### Day 1 Checks
```sql
-- 1. Check if validation is being used
SELECT COUNT(*) as validation_checks
FROM pg_stat_user_functions
WHERE funcname = 'validate_document_issue_date';

-- 2. Count documents created since deployment
SELECT COUNT(*) 
FROM documents 
WHERE created_at > NOW() - INTERVAL '24 hours';

-- 3. Check for any NULL last_issue_date where it should exist
SELECT company_id, document_type, COUNT(*) as final_docs
FROM documents
WHERE document_status = 'final'
  AND document_type IN ('receipt', 'invoice', 'quote')
GROUP BY company_id, document_type
HAVING NOT EXISTS (
  SELECT 1 FROM document_sequences ds
  WHERE ds.company_id = documents.company_id
    AND ds.document_type = documents.document_type
    AND ds.last_issue_date IS NOT NULL
);

-- 4. View recent constraints
SELECT * FROM vw_document_date_constraints
ORDER BY last_issue_date DESC
LIMIT 20;
```
- [ ] Validation function being called
- [ ] New documents being created
- [ ] No inconsistencies in data
- [ ] Constraints look correct

### Week 1 Checks
```sql
-- Check for any anomalies
SELECT 
  company_id,
  document_type,
  last_issue_date,
  COUNT(*) as total_docs,
  MAX(created_at) as last_created
FROM document_sequences ds
JOIN documents d ON d.company_id = ds.company_id 
  AND d.document_type = ds.document_type
GROUP BY company_id, document_type, last_issue_date
HAVING COUNT(*) > 100
ORDER BY last_created DESC;
```
- [ ] High-volume companies working correctly
- [ ] No performance issues
- [ ] No user complaints

---

## 🔄 Rollback Plan (If Needed)

### Option 1: Disable Validation (Keep Data)
```typescript
// In lib/date-validation.ts
export async function validateDocumentIssueDate(...) {
  // TEMPORARY: Always return valid
  return { isValid: true, minAllowedDate: null, errorMessage: null };
}
```
- [ ] Comment out validation logic
- [ ] Redeploy
- [ ] Users can create any date

### Option 2: Remove Column (Full Rollback)
```sql
-- Remove trigger
DROP TRIGGER IF EXISTS trg_update_last_issue_date ON documents;

-- Remove functions
DROP FUNCTION IF EXISTS update_last_issue_date();
DROP FUNCTION IF EXISTS validate_document_issue_date(uuid, text, date);

-- Remove view
DROP VIEW IF EXISTS vw_document_date_constraints;

-- Remove column
ALTER TABLE document_sequences DROP COLUMN IF EXISTS last_issue_date;
```
- [ ] Trigger removed
- [ ] Functions removed
- [ ] View removed
- [ ] Column removed
- [ ] Revert code changes
- [ ] Redeploy

---

## 📝 Sign-Off

### Pre-Deployment
- [ ] All files created/modified
- [ ] Documentation complete
- [ ] Database migration tested in dev
- [ ] Code reviewed
- [ ] TypeScript compiles
- [ ] No merge conflicts

### Post-Deployment
- [ ] Database migration successful
- [ ] Code deployed successfully
- [ ] All 6 test scenarios passed
- [ ] No errors in logs
- [ ] User testing completed
- [ ] Team notified

### Final Approval
- [ ] Product Owner: _______________  Date: _______
- [ ] Tech Lead: _______________  Date: _______
- [ ] QA: _______________  Date: _______

---

## 🎓 Next Steps (Optional Enhancements)

### Extend to Other Document Types
- [ ] Invoice date validation
  - Modify `app/dashboard/documents/invoice/actions.ts`
  - Modify `InvoiceFormClient.tsx`
- [ ] Quote date validation
  - Modify `app/dashboard/documents/quote/actions.ts`
  - Modify `QuoteFormClient.tsx`
- [ ] Delivery Note date validation
  - Modify `app/dashboard/documents/delivery-note/actions.ts`
  - Modify `DeliveryNoteFormClient.tsx`

### Add Admin Override
- [ ] Create admin UI to temporarily remove restriction
- [ ] Add audit log for overrides
- [ ] Require justification text

### Analytics & Reporting
- [ ] Track validation failures
- [ ] Dashboard showing date distributions
- [ ] Alert on unusual patterns

---

**Checklist Version**: 1.0  
**Date**: January 4, 2026  
**Status**: Ready for Production ✅

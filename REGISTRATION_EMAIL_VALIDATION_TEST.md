# Email Validation on Registration Step 1 - Testing Guide

## Changes Made

### 1. Created Server Action: `/app/register/actions.ts`
- New file with `checkEmailExists()` function
- Server-side only (safe Supabase access)
- Returns: `{ exists: true/false }` or `{ error: true }`
- Checks `companies` table for email uniqueness

### 2. Updated Component: `/components/registration/step-personal-details.tsx`
- Added `checkEmailExists` import from server action
- Added state: `isCheckingEmail`, `emailExists`
- Modified `handleSubmit()` to be async and check email before proceeding
- Updated email input to clear errors on change
- Added "Go to login" link when email exists
- Added loading state to submit button

## How to Test

### ✅ Test Case 1: New Email (Should Proceed)
1. Navigate to `/register`
2. Fill in Step 1 form with a **NEW email** (not in database)
3. Fill other required fields (name, phone, password)
4. Click "המשך לשלב הבא" (Next Step)
5. **Expected**: 
   - Button shows "בודק זמינות אימייל..." (Checking email availability...)
   - After ~1 second, proceeds to Step 2 automatically
   - No error messages shown

### ❌ Test Case 2: Existing Email (Should Block)
1. Navigate to `/register`
2. Fill in Step 1 form with an **EXISTING email** (already registered)
3. Fill other required fields
4. Click "המשך לשלב הבא"
5. **Expected**:
   - Button shows loading state briefly
   - Stays on Step 1 (does NOT proceed)
   - Red error message under email field: "כתובת האימייל כבר רשומה במערכת"
   - "← חזרה להתחברות" (Go to login) link appears below error
   - Clicking link navigates to `/login`

### ⚠️ Test Case 3: Invalid Email Format
1. Navigate to `/register`
2. Enter invalid email: `notanemail` or `test@`
3. Click "המשך לשלב הבא"
4. **Expected**:
   - Error shown immediately: "כתובת אימייל לא תקינה"
   - No server check performed (client-side validation only)
   - Stays on Step 1

### 🔌 Test Case 4: Network Error
1. Disconnect internet or block Supabase requests
2. Fill form with any email
3. Click "המשך לשלב הבא"
4. **Expected**:
   - Error message: "לא ניתן לאמת את האימייל כרגע. נסה שוב."
   - Stays on Step 1
   - Can retry after fixing connection

### 🔄 Test Case 5: Email Change After Error
1. Trigger existing email error (Test Case 2)
2. Modify the email address (type new characters)
3. **Expected**:
   - Error message clears immediately
   - "Go to login" link disappears
   - Can resubmit with new email

## Manual Verification Checklist

- [ ] `pnpm dev` runs without errors
- [ ] Navigate to `/register` loads Step 1
- [ ] Form validates basic fields (name, phone, password)
- [ ] Email check triggers on "Next" button click
- [ ] Loading state shows during email check
- [ ] Existing email blocks navigation to Step 2
- [ ] Error message is clear and in Hebrew
- [ ] "Go to login" link works and navigates to `/login`
- [ ] New/available email allows proceeding to Step 2
- [ ] Network errors handled gracefully
- [ ] No console errors in browser DevTools
- [ ] No TypeScript compilation errors

## Database Setup (If Needed)

To test with an existing email, you need at least one record in `companies` table:

\`\`\`sql
-- Check existing emails
SELECT email FROM companies LIMIT 5;

-- If empty, register one user through the full flow first
-- OR insert a test record:
INSERT INTO companies (company_name, email, contact_first_name, contact_full_name)
VALUES ('Test Company', 'test@example.com', 'Test', 'Test User');
\`\`\`

## Security Notes

✅ **Safe Implementation**:
- Email check runs on server only (no client-side DB access)
- No sensitive data exposed (only `exists: true/false`)
- Uses existing Supabase client (respects RLS policies)
- No service role keys in client code

## Rollback (If Needed)

If there are issues:

1. Delete `/app/register/actions.ts`
2. Revert `/components/registration/step-personal-details.tsx` to previous version
3. The app will work as before (email error appears on Step 3)

## Next Steps (Optional Enhancements)

- [ ] Add debounced email check on blur (check while user types)
- [ ] Add email suggestion if typo detected (e.g., `gmial.com` → `gmail.com`)
- [ ] Cache email check results to avoid duplicate checks
- [ ] Add analytics tracking for blocked registrations

# System Texts Implementation Guide

## Overview
This guide shows how to replace all hard-coded Hebrew text in the Receipt Form with dynamic, admin-customizable text from the `system_texts` database table.

## Files Created

### 1. Database Seed Data
- **File**: [SYSTEM_TEXTS_SEED_DATA.sql](SYSTEM_TEXTS_SEED_DATA.sql)
- **Purpose**: SQL INSERT statements for all 70 text keys
- **Action**: Run this in Supabase SQL Editor **after** running `scripts/010-system-texts-table.sql`

### 2. API Endpoint
- **File**: [app/api/system-texts/route.ts](app/api/system-texts/route.ts)
- **Purpose**: Serves all system texts to client components
- **Caching**: 5-minute public cache
- **Returns**: `{ texts: { key: value } }`

### 3. React Hook
- **File**: [lib/hooks/useSystemTexts.ts](lib/hooks/useSystemTexts.ts)
- **Purpose**: Load texts on component mount, use synchronously
- **Usage**:
  ```tsx
  const { getText, isLoading, error } = useSystemTexts();
  const label = getText('receipt_form_title', 'קבלה');
  ```

### 4. Text Catalog (Reference)
- **File**: [SYSTEM_TEXTS_CATALOG.json](SYSTEM_TEXTS_CATALOG.json)
- **Purpose**: Complete list of all 70 text keys with descriptions and locations
- **Format**: Organized by category (Payment Methods, Form Labels, Messages, etc.)

## Implementation Steps

### Step 1: Run Database Migration
```sql
-- In Supabase SQL Editor:
-- 1. First, ensure 010-system-texts-table.sql has been run
-- 2. Then run SYSTEM_TEXTS_SEED_DATA.sql
```

### Step 2: Update ReceiptFormClient.tsx

Add the hook at the top of the component:
```tsx
import { useSystemTexts } from "@/lib/hooks/useSystemTexts";

export default function ReceiptFormClient({ ... }) {
  const { getText } = useSystemTexts();
  
  // ... rest of component
}
```

### Step 3: Replace Hard-Coded Strings

#### Payment Methods Array
**Before:**
```tsx
const PAYMENT_METHODS = [
  "העברה בנקאית",
  "Bit",
  // ... etc
] as const;
```

**After:**
```tsx
const PAYMENT_METHODS = useMemo(() => [
  getText('payment_method_bank_transfer', 'העברה בנקאית'),
  getText('payment_method_bit', 'Bit'),
  getText('payment_method_paybox', 'PayBox'),
  getText('payment_method_credit_card', 'כרטיס אשראי'),
  getText('payment_method_cash', 'מזומן'),
  getText('payment_method_check', 'צ׳ק'),
  getText('payment_method_paypal', 'PayPal'),
  getText('payment_method_payoneer', 'Payoneer'),
  getText('payment_method_google_pay', 'Google Pay'),
  getText('payment_method_apple_pay', 'Apple Pay'),
  getText('payment_method_bitcoin', 'ביטקוין'),
  getText('payment_method_ethereum', 'אתריום'),
  getText('payment_method_buyme_voucher', 'שובר BuyME'),
  getText('payment_method_gift_voucher', 'שובר מתנה'),
  getText('payment_method_cash_equivalent', 'שווה כסף'),
  getText('payment_method_vcheck', 'V-CHECK'),
  getText('payment_method_colu', 'Colu'),
  getText('payment_method_tax_deduction', 'ניכוי במקור'),
  getText('payment_method_employee_deduction', 'ניכוי חלק עובד טל״א'),
  getText('payment_method_other_deduction', 'ניכוי אחר'),
], [getText]);
```

#### Form Labels & Messages
Replace all instances like:
```tsx
// Before:
<div>פרטי המסמך</div>

// After:
<div>{getText('receipt_form_document_details_title', 'פרטי המסמך')}</div>
```

#### Error Messages
```tsx
// Before:
setMessage("שגיאה בשמירת הטיוטה");

// After:
setMessage(getText('receipt_form_error_save_draft', 'שגיאה בשמירת הטיוטה'));
```

#### Placeholders
```tsx
// Before:
placeholder="התחל להקליד שם לקוח..."

// After:
placeholder={getText('receipt_form_customer_name_placeholder', 'התחל להקליד שם לקוח...')}
```

## Complete Text Keys Reference

### Payment Methods (20 keys)
- `payment_method_bank_transfer` - העברה בנקאית
- `payment_method_bit` - Bit
- `payment_method_paybox` - PayBox
- `payment_method_credit_card` - כרטיס אשראי
- `payment_method_cash` - מזומן
- `payment_method_check` - צ׳ק
- `payment_method_paypal` - PayPal
- `payment_method_payoneer` - Payoneer
- `payment_method_google_pay` - Google Pay
- `payment_method_apple_pay` - Apple Pay
- `payment_method_bitcoin` - ביטקוין
- `payment_method_ethereum` - אתריום
- `payment_method_buyme_voucher` - שובר BuyME
- `payment_method_gift_voucher` - שובר מתנה
- `payment_method_cash_equivalent` - שווה כסף
- `payment_method_vcheck` - V-CHECK
- `payment_method_colu` - Colu
- `payment_method_tax_deduction` - ניכוי במקור
- `payment_method_employee_deduction` - ניכוי חלק עובד טל״א
- `payment_method_other_deduction` - ניכוי אחר

### Form Labels (12 keys)
- `receipt_form_title` - קבלה
- `receipt_form_company_default` - העסק שלי
- `receipt_form_settings_button` - הגדרות
- `receipt_form_settings_title` - הגדרות
- `receipt_form_language_label` - שפה
- `receipt_form_language_hebrew` - עברית
- `receipt_form_language_english` - אנגלית
- `receipt_form_default_currency_label` - מטבע ברירת מחדל
- `receipt_form_allowed_currencies_label` - מותרים:
- `receipt_form_round_totals_label` - עיגול סכומים
- `receipt_form_round_totals_description` - לעגל את הסכום הסופי למטבע שלם (ללא אגורות)
- `receipt_form_settings_note` - הערה: כרגע אלו ברירות מחדל מקומיות למסך...

### Document Details (6 keys)
- `receipt_form_document_details_title` - פרטי המסמך
- `receipt_form_customer_name_label` - שם לקוח
- `receipt_form_customer_name_placeholder` - התחל להקליד שם לקוח...
- `receipt_form_document_date_label` - תאריך מסמך
- `receipt_form_description_label` - תיאור
- `receipt_form_description_placeholder` - לדוגמה: שירותי עיצוב

### Payments Section (15 keys)
- `receipt_form_payments_title` - פירוט תקבולים
- `receipt_form_payments_subtitle` - איך שילמו לך? אם שילמו לך בכמה צורות תשלום...
- `receipt_form_payment_method_column` - אמצעי
- `receipt_form_payment_date_column` - תאריך
- `receipt_form_payment_amount_column` - סכום
- `receipt_form_payment_currency_column` - מטבע
- `receipt_form_payment_details_column` - פרטים (אופציונלי)
- `receipt_form_payment_method_select_default` - בחר…
- `receipt_form_payment_bank_placeholder` - בנק
- `receipt_form_payment_branch_placeholder` - סניף
- `receipt_form_payment_account_placeholder` - חשבון
- `receipt_form_payment_delete_button` - מחק
- `receipt_form_add_payment_button` - הוספת תקבול +
- `receipt_form_total_paid_label` - סה״כ שולם
- `receipt_form_round_totals_note` - כולל עיגול לסכום סופי (ללא אגורות).

### Notes Section (3 keys)
- `receipt_form_notes_title` - הערות
- `receipt_form_notes_on_document_label` - הערות שיופיעו במסמך
- `receipt_form_notes_footer_label` - הערות בתחתית המסמך

### Action Buttons (6 keys)
- `receipt_form_preview_button` - 📄 תצוגה מקדימה (טאב חדש)
- `receipt_form_save_draft_button` - שמירת טיוטה
- `receipt_form_save_draft_button_saving` - שומר...
- `receipt_form_issue_button` - הפקה + הקצאת מספר
- `receipt_form_issue_button_processing` - מפיק...
- `receipt_form_sequence_not_locked_tooltip` - נדרש לבחור מספר התחלתי

### Messages (8 keys)
- `receipt_form_error_save_draft` - שגיאה בשמירת הטיוטה
- `receipt_form_error_sequence_required` - נדרש לבחור מספר התחלתי לפני הפקת מסמכים
- `receipt_form_error_save_before_issue` - יש לשמור את הטיוטה ולהפיק מהרשימה
- `receipt_form_error_issue_document` - שגיאה בהפקת המסמך
- `receipt_form_error_pdf_download` - שגיאה בהורדת PDF:
- `receipt_form_customer_added_success` - הלקוח "{name}" נוסף בהצלחה ללקוחות שמורים
- `receipt_form_customer_name_saved` - שם הלקוח נשמר למסמך זה בלבד (לא נוסף ללקוחות)
- `receipt_form_system_notes_title` - 📌 הערות מערכת

## Benefits

1. **Admin Control**: Admins can now customize ALL receipt form text via `/admin/texts`
2. **Consistent Branding**: Different businesses can use different terminology
3. **Multi-language Ready**: Easy to add English translations
4. **Centralized**: All text in one place, easy to manage
5. **No Code Changes**: Text updates don't require deployments

## Testing

1. Run the SQL seed data in Supabase
2. Navigate to `/admin/texts`
3. Filter by page: "receipt"
4. Edit any text value
5. Reload the receipt form
6. Verify the text changed

## Performance

- **Initial Load**: ~50KB JSON payload (all texts)
- **Caching**: 5-minute public cache on API route
- **Client Cache**: In-memory cache in React hook
- **No Extra Renders**: getText is synchronous after initial load

## Next Steps

After implementing this pattern for receipts, you can extend it to:
- Invoice forms
- Quote forms
- Customer management UI
- Admin panel labels
- Email templates
- Notification messages

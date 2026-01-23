# מדריך מהיר - מערכת משתני מסמכים

## 🚀 הקפיצה המהירה

### אני מוסיף מסמך חדש - מה לעשות?

```typescript
// 1. השתמש רק ב-values מה-config:
import { PAYMENT_METHODS, CURRENCIES, DOCUMENT_TYPES } from '@/config/documentVariables'

// 2. אל תיצור enum חדש!
❌ const MY_OPTIONS = [{value: "cash", label: "כסף"}]
✅ const options = PAYMENT_METHODS

// 3. אל תשנה values קיימים!
❌ "money" במקום "cash"
✅ "cash"
```

---

## 📋 טבלת ערכים מהירה

| קטגוריה | Config Key | כמה ערכים | דוגמה |
|----------|-----------|-----------|-------|
| אמצעי תשלום | `PAYMENT_METHODS` | 21 | `cash`, `credit_card`, `bit` |
| כרטיסי אשראי | `CARD_TYPES` | 6 | `visa`, `mastercard`, `amex` |
| עסקאות | `CARD_DEAL_TYPES` | 4 | `regular`, `installments` |
| צ'קים | `CHECK_TYPES` | 2 | `regular`, `deferred` |
| מטבעות | `CURRENCIES` | 4 | `ILS`, `USD`, `EUR` |
| שפות | `LANGUAGES` | 3 | `he`, `en`, `ar` |
| סטטוס | `DOCUMENT_STATUSES` | 6 | `draft`, `issued`, `paid` |
| סוגי מע"מ | `VAT_TYPES` | 3 | `included`, `excluded`, `exempt` |
| מסמכים | `DOCUMENT_TYPES` | 7 | `receipt`, `invoice`, `quote` |

---

## 🎯 21 אמצעי תשלום

```typescript
// כל ה-values בפורמט English
const PAYMENT_METHODS = [
  "bank_transfer",  // העברה בנקאית
  "bit",            // Bit
  "paybox",         // PayBox
  "credit_card",    // כרטיס אשראי
  "cash",           // מזומן
  "check",          // צ'ק
  "direct_debit",   // הוראת קבע
  "paypal",         // PayPal
  "stripe",         // Stripe
  "square",         // Square
  "apple_pay",      // Apple Pay
  "google_pay",     // Google Pay
  "venmo",          // Venmo
  "zelle",          // Zelle
  "wire_transfer",  // העברה בנקאית בינלאומית
  "cibus",          // Cibus
  "ten_bis",        // TenBis
  "klika",          // קליקה
  "other_voucher",  // שובר אחר
  "crypto",         // קריפטו
  "other"           // אחר
]
```

---

## 📝 Placeholders לתבניות

### Company (13 משתנים)
```
{{company_name}}
{{company_email}}
{{company_phone}}
{{company_address}}
{{company_city}}
{{company_postal_code}}
{{company_country}}
{{company_business_number}}
{{company_tax_id}}
{{company_logo_url}}
{{company_signature_url}}
{{company_website}}
{{company_bank_account}}
```

### Customer (10 משתנים)
```
{{customer_name}}
{{customer_id_number}}
{{customer_phone}}
{{customer_mobile}}
{{customer_email}}
{{customer_address}}
{{customer_city}}
{{customer_postal_code}}
{{customer_country}}
{{customer_business_number}}
```

### Document (9 משתנים)
```
{{document_number}}
{{document_date}}
{{document_status}}
{{document_status_label}}
{{document_type}}
{{document_type_label}}
{{finalized_at}}
{{description}}
{{notes}}
```

### Totals (4 משתנים)
```
{{subtotal}}
{{vat_amount}}
{{total_amount}}
{{total_in_words}}
```

### Payment (13 משתנים)
```
{{payment_method}}
{{payment_method_label}}
{{payment_date}}
{{payment_amount}}
{{card_type}}
{{card_last_digits}}
{{card_installments}}
{{card_deal_type}}
{{check_number}}
{{check_date}}
{{check_bank}}
{{check_branch}}
{{check_account}}
```

### Items Loop
```html
{{#each items}}
  <tr>
    <td>{{description}}</td>
    <td>{{quantity}}</td>
    <td>{{price}}</td>
    <td>{{vat_rate}}</td>
    <td>{{total}}</td>
  </tr>
{{/each}}
```

### Payments Loop
```html
{{#each payments}}
  <div>{{method}} - {{amount}} - {{date}}</div>
{{/each}}
```

### Helpers
```
{{formatCurrency value currency}}
{{formatDate date format}}
{{isPaymentMethod payment_method 'credit_card'}}
{{multiply a b}}
```

---

## 🔧 פונקציות עזר

```typescript
import { 
  getCategoryValues,
  getLabelByValue,
  exportCategoryValues,
  getAllPlaceholders
} from '@/config/documentVariables'

// קבל את כל הערכים
const methods = getCategoryValues('payment_method')

// קבל label לפי value
const label = getLabelByValue('payment_method', 'cash')
// "מזומן"

// ייצוא ל-CSV
const csv = exportCategoryValues('payment_method', 'csv')
// "bank_transfer, bit, paybox, credit_card..."

// ייצוא ל-JSON
const json = exportCategoryValues('payment_method', 'json')
// [{"value":"bank_transfer","label":"העברה בנקאית"}...]

// כל ה-placeholders
const allPlaceholders = getAllPlaceholders()
// ["{{company_name}}", "{{customer_email}}", ...]
```

---

## 🎨 שימוש בקומפוננטה

```typescript
import { PAYMENT_METHODS, CURRENCIES } from '@/config/documentVariables'

function MyForm() {
  return (
    <>
      <select name="payment">
        {PAYMENT_METHODS.map(pm => (
          <option key={pm.value} value={pm.value}>
            {pm.label}
          </option>
        ))}
      </select>
      
      <select name="currency">
        {CURRENCIES.map(c => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    </>
  )
}
```

---

## 🗂️ קבצים חשובים

| קובץ | מה יש בו |
|------|----------|
| `config/documentVariables.ts` | **מקור אמת** - כל הערכים והמשתנים |
| `/admin/document-variables` | עמוד אדמין - צפייה והעתקה |
| `scripts/017-template-multi-document-types.sql` | Migration לריבוי מסמכים |

---

## ⚠️ אל תעשה את זה!

```typescript
// ❌ לא נכון - יצירת values חדשים
const myPayments = [
  { value: "money", label: "כסף" },          // ❌ צריך להיות "cash"
  { value: "visa_card", label: "ויזה" }     // ❌ צריך להיות "visa"
]

// ❌ לא נכון - שינוי naming
{{companyName}}                              // ❌ צריך {{company_name}}

// ❌ לא נכון - enum חדש
enum PaymentType { CASH = "cash" }          // ❌ השתמש ב-PAYMENT_METHODS

// ✅ נכון
import { PAYMENT_METHODS } from '@/config/documentVariables'
const options = PAYMENT_METHODS
```

---

## ✅ עשה את זה!

```typescript
// ✅ נכון - שימוש ב-config
import { 
  PAYMENT_METHODS, 
  CURRENCIES,
  DOCUMENT_TYPES 
} from '@/config/documentVariables'

// ✅ נכון - שמות אחידים
{{company_name}}
{{customer_email}}
{{total_amount}}

// ✅ נכון - values אנגליים
value="cash"
value="credit_card"
value="bank_transfer"
```

---

## 🚀 המשך עבודה

1. **הרץ Migration**:
   ```sql
   -- בעורך SQL של Supabase:
   -- העתק והדבק את scripts/017-template-multi-document-types.sql
   ```

2. **צפה בעמוד Variables**:
   ```
   /admin/document-variables
   ```

3. **העתק ערכים**:
   - לחץ על CSV/JSON בכל קטגוריה
   - העתק placeholders בודדים
   - הורד רשימה מלאה

4. **צור תבנית עם ריבוי מסמכים**:
   ```
   /admin/templates/new
   → בחר כמה checkboxes של סוגי מסמכים
   → שמור
   ```

---

נוצר: Jan 1, 2026 | Single Source of Truth ✨

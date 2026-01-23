# מערכת משתני מסמכים - סיכום מהיר בעברית

## ✅ מה נוצר?

### 1. קובץ קונפיגורציה מרכזי
📁 `config/documentVariables.ts`

**מה יש בו?**
- ✅ 21 אמצעי תשלום (העברה בנקאית, Bit, כרטיס אשראי, מזומן...)
- ✅ 7 סוגי מסמכים (קבלה, חשבונית, הצעת מחיר...)
- ✅ 11 קטגוריות Select שונות
- ✅ 63 Placeholders לתבניות HTML
- ✅ פונקציות עזר (ייצוא ל-CSV, JSON, קבלת תוויות...)

### 2. עמוד אדמין
🔗 `/admin/document-variables`

**מה יש בו?**
- ✅ 3 טאבים:
  1. **ערכי Select** - כל הקטגוריות עם טבלאות ערכים
  2. **Placeholders** - כל המשתנים לתבניות
  3. **תצוגה מקובצת** - חלוקה לפי נושא (תשלום, מסמך, מערכת)

- ✅ כפתורי העתקה:
  - CSV (רשימת ערכים מופרדים בפסיקים)
  - JSON (אובייקט מלא)
  - Placeholders ({{variable}})

- ✅ חיפוש בכל הערכים

### 3. תמיכה בריבוי סוגי מסמכים
📁 `scripts/017-template-multi-document-types.sql`

**מה זה עושה?**
- ✅ יוצר טבלת `template_document_types` (חיבור בין תבניות למסמכים)
- ✅ תבנית אחת יכולה לשמש כמה סוגי מסמכים
- ✅ Backward compatibility - תבניות ישנות עובדות

📁 `app/admin/templates/new/NewTemplateClient.tsx`

**מה השתנה?**
- ✅ במקום Select יחיד → Checkbox Grid
- ✅ בחירה של כמה סוגי מסמכים בבת אחת
- ✅ תצוגה חזותית עם Badges

---

## 🚀 איך להשתמש?

### צפייה בכל הערכים
1. היכנס ל-`/admin` (כאדמין)
2. לחץ על **Variables** בתפריט
3. גלוש בין הטאבים

### יצירת תבנית חדשה
1. נווט ל-`/admin/templates/new`
2. בחר **כמה סוגי מסמכים** (לפחות אחד)
3. כתוב HTML/CSS עם placeholders
4. שמור

### שימוש בקוד
```typescript
// ייבא מהקונפיג
import { PAYMENT_METHODS, CURRENCIES } from '@/config/documentVariables'

// השתמש ב-Select
<select>
  {PAYMENT_METHODS.map(pm => (
    <option key={pm.value} value={pm.value}>
      {pm.label}
    </option>
  ))}
</select>
```

---

## 📊 21 אמצעי תשלום

| Value | Label |
|-------|-------|
| `bank_transfer` | העברה בנקאית |
| `bit` | Bit |
| `paybox` | PayBox |
| `credit_card` | כרטיס אשראי |
| `cash` | מזומן |
| `check` | צ'ק |
| `direct_debit` | הוראת קבע |
| `paypal` | PayPal |
| `stripe` | Stripe |
| `square` | Square |
| `apple_pay` | Apple Pay |
| `google_pay` | Google Pay |
| `venmo` | Venmo |
| `zelle` | Zelle |
| `wire_transfer` | העברה בנקאית בינלאומית |
| `cibus` | Cibus |
| `ten_bis` | TenBis |
| `klika` | קליקה |
| `other_voucher` | שובר אחר |
| `crypto` | קריפטו |
| `other` | אחר |

---

## 📝 Placeholders נפוצים

### חברה
```
{{company_name}}
{{company_email}}
{{company_phone}}
{{company_address}}
{{company_logo_url}}
{{company_signature_url}}
```

### לקוח
```
{{customer_name}}
{{customer_id_number}}
{{customer_phone}}
{{customer_email}}
{{customer_address}}
```

### מסמך
```
{{document_number}}
{{document_date}}
{{document_type_label}}
{{description}}
{{notes}}
```

### סכומים
```
{{subtotal}}
{{vat_amount}}
{{total_amount}}
{{total_in_words}}
```

### תשלום
```
{{payment_method_label}}
{{payment_date}}
{{payment_amount}}
{{card_type}}
{{card_last_digits}}
{{check_number}}
```

### לולאת פריטים
```html
{{#each items}}
  <tr>
    <td>{{description}}</td>
    <td>{{quantity}}</td>
    <td>{{price}}</td>
    <td>{{total}}</td>
  </tr>
{{/each}}
```

---

## ⚠️ כללי זהב - אל תשבור!

### ✅ עשה
```typescript
// השתמש ב-values מהקונפיג
import { PAYMENT_METHODS } from '@/config/documentVariables'
const options = PAYMENT_METHODS
```

### ❌ אל תעשה
```typescript
// אל תיצור values חדשים!
const myMethods = [
  { value: "money", label: "כסף" }  // ❌ לא! צריך "cash"
]

// אל תשנה שמות placeholders!
{{companyName}}  // ❌ לא! צריך {{company_name}}

// אל תשנה values קיימים!
value="money"  // ❌ לא! צריך value="cash"
```

---

## 📋 משימות שנשארו

### דחוף (5 דקות)
- [ ] הרץ `scripts/017-template-multi-document-types.sql` ב-Supabase

### חשוב (30 דקות)
- [ ] צור `saveTemplateDocumentTypesAction` לשמירה ב-junction table
- [ ] עדכן `handleSave` ב-NewTemplateClient לקרוא לפונקציה

### רצוי (1 שעה)
- [ ] עדכן `ReceiptFormClient` להשתמש ב-config
- [ ] עדכן `PaymentDetailsSection` להשתמש ב-config
- [ ] עדכן Template Editor להציג את כל ה-document types
- [ ] עדכן Template List להציג badges מרובים

### אופציונלי
- [ ] נרמל נתונים קיימים (עברית → אנגלית)
- [ ] הוסף Validation Rules
- [ ] הוסף תרגומים לאנגלית/ערבית

---

## 📁 קבצים חשובים

| קובץ | תיאור |
|------|--------|
| `config/documentVariables.ts` | **מקור אמת** - כל הערכים |
| `/admin/document-variables` | עמוד אדמין - צפייה והעתקה |
| `scripts/017-...sql` | Migration לריבוי מסמכים |
| `DOCUMENT_VARIABLES_SYSTEM.md` | מדריך מלא |
| `DOCUMENT_VARIABLES_TODO.md` | רשימת משימות |
| `DOCUMENT_VARIABLES_CATALOG.json` | קטלוג JSON |

---

## 🎯 סטטוס

| מה | סטטוס |
|---|--------|
| Config מרכזי | ✅ הושלם |
| עמוד אדמין | ✅ הושלם |
| העתקה (CSV/JSON) | ✅ הושלם |
| Multi-document UI | ✅ הושלם |
| Migration SQL | ✅ נוצר |
| Build עובד | ✅ |
| Migration הורץ | ⏳ ממתין |
| Junction table שמירה | ⏳ ממתין |
| עדכון קוד קיים | ⏳ ממתין |

---

**נוצר**: ינואר 2026  
**גרסה**: 1.0  
**Single Source of Truth** ✨

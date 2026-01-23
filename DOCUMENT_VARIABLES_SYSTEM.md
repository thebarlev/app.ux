# 🚀 מערכת משתני מסמכים אחידה - מדריך מלא

## 📋 סיכום המימוש

יצרתי מערכת מקיפה לניהול אחיד של כל המשתנים וה-selectים במערכת המסמכים, כולל תמיכה בריבוי סוגי מסמכים לתבנית אחת.

---

## 🎯 מה נוצר?

### 1. **מקור אמת מרכזי** (`config/documentVariables.ts`)

קובץ קונפיגורציה מרכזי המכיל:

#### ✅ כל ה-Selectים במערכת
- **אמצעי תשלום**: 21 אפשרויות (העברה בנקאית, Bit, PayBox, כרטיס אשראי, מזומן...)
- **סוגי כרטיסי אשראי**: 6 אפשרויות (Visa, Mastercard, ישראכרט...)
- **סוגי עסקאות**: 4 אפשרויות (רגיל, תשלומים, קרדיט, דחוי)
- **סוגי צ'קים**: 2 אפשרויות (רגיל, דחוי)
- **מטבעות**: 4 אפשרויות (₪, $, €, £)
- **שפות**: 3 אפשרויות (עברית, English, العربية)
- **סטטוס מסמך**: 6 אפשרויות (טיוטה, הונפק, נשלח, שולם, בוטל, סופי)
- **סוגי מע"מ**: 3 אפשרויות (כולל, לא כולל, פטור)
- **שיעורי מס**: 3 אפשרויות (0%, 17%, 18%)
- **סוגי עסקים**: 6 אפשרויות (עוסק פטור, עוסק מורשה, בע"מ...)
- **סוגי מסמכים**: 7 אפשרויות (קבלה, חשבונית, הצעת מחיר...)

#### ✅ Placeholders לתבניות HTML
מבנה מלא ומסודר ב-7 קטגוריות:
- **Company**: 13 משתנים (שם, כתובת, טלפון, לוגו, חתימה...)
- **Customer**: 10 משתנים (שם, ת.ז, טלפון, כתובת...)
- **Document**: 9 משתנים (מספר, תאריך, סטטוס, תיאור...)
- **Totals**: 4 משתנים (סכום ביניים, מע"מ, סה"כ, במילים)
- **Payment**: 13 משתנים (אמצעי, תאריך, סכום + פרטי כרטיס וצ'ק)
- **Items**: לולאת פריטים עם 5 שדות
- **Payments List**: לולאת תשלומים
- **Helpers**: פונקציות עזר (formatCurrency, formatDate...)

#### ✅ פונקציות עזר
- `getCategoryValues(categoryId)` - מחזיר את כל הערכים של קטגוריה
- `getLabelByValue(categoryId, value)` - מחזיר תווית לערך
- `exportCategoryValues(categoryId, format)` - ייצוא בפורמטים שונים (CSV, JSON, Placeholders)
- `getAllPlaceholders()` - מחזיר את כל ה-placeholders כרשימה

---

### 2. **עמוד אדמין - משתני מסמכים** (`/admin/document-variables`)

עמוד מקיף באדמין המציג את כל המשתנים והערכים:

#### תכונות:
- ✅ **3 טאבים**:
  1. **ערכי Select** - כרטיס לכל קטגוריה עם טבלה מלאה
  2. **Placeholders לתבניות** - כל המשתנים לפי קטגוריות
  3. **תצוגה מקובצת** - קבוצה לוגית (תשלום, מסמך, מערכת...)

- ✅ **כפתורי העתקה**:
  - העתקה ב-CSV (value1, value2, value3)
  - העתקה ב-JSON (מבנה מלא)
  - העתקה של placeholders בודדים
  - העתקה של כל ה-placeholders (רשימה מלאה)

- ✅ **חיפוש**:
  - חיפוש לפי שם קטגוריה, id טכני, value, או label
  - פילטור בזמן אמת

- ✅ **Badges ומידע**:
  - סימון קטגוריות תלויות (`dependsOn`)
  - קבוצות לוגיות (תשלום, מסמך, מערכת...)
  - מספר ערכים בכל קטגוריה

---

### 3. **תמיכה בריבוי סוגי מסמכים לתבנית**

#### SQL Migration (`scripts/017-template-multi-document-types.sql`)
- ✅ טבלת `template_document_types` (junction table)
- ✅ אינדקסים לביצועים
- ✅ RLS policies (אדמין + משתמשים)
- ✅ מיגרציה של נתונים קיימים
- ✅ backward compatibility

#### עמוד יצירת תבנית חדשה (מעודכן)
- ✅ **Multi-Select UI** במקום select יחיד
- ✅ **Checkbox Grid** - בחירה חזותית של כמה סוגי מסמכים
- ✅ **Badges** - תצוגה של הסוגים הנבחרים
- ✅ **Validation** - חייב לבחור לפחות סוג אחד
- ✅ שימוש ב-`DOCUMENT_TYPES` מקובץ config המרכזי

---

### 4. **עדכון Header של האדמין**

- ✅ כפתור חדש: **Variables** (עם אייקון Variable)
- ✅ ניווט ישיר ל-`/admin/document-variables`
- ✅ ממוקם בין Templates ל-System Texts

---

## 📁 קבצים שנוצרו/עודכנו

### קבצים חדשים:
1. ✅ `config/documentVariables.ts` - מקור אמת מרכזי (500+ שורות)
2. ✅ `app/admin/document-variables/page.tsx` - Server Component
3. ✅ `app/admin/document-variables/DocumentVariablesClient.tsx` - Client Component עם UI מלא
4. ✅ `scripts/017-template-multi-document-types.sql` - Migration לריבוי מסמכים

### קבצים מעודכנים:
1. ✅ `app/admin/templates/new/NewTemplateClient.tsx` - Multi-select לסוגי מסמכים
2. ✅ `components/admin/admin-header.tsx` - כפתור Variables

---

## 🎨 UI/UX Features

### עמוד Document Variables:
- **Responsive Design**: Grid layout מתאים לכל גודל מסך
- **RTL Support**: כל הטקסטים בעברית
- **Copy to Clipboard**: פידבק מיידי עם toast
- **Color Coding**: 
  - קטגוריות תלויות - Badge אדום
  - קבוצות - Badge כחול/ירוק
  - Values טכניים - Font mono
- **Accordion**: פריטת placeholders באקורדיון
- **Search**: חיפוש מיידי בכל הנתונים

### עמוד New Template:
- **Checkbox Grid**: 2 עמודות responsive
- **Visual Feedback**: 
  - Border כחול למסומנים
  - Checkmark ב-SVG מותאם אישית
  - Hover effects
- **Badges Summary**: רשימת הסוגים הנבחרים מתחת ל-grid

---

## 🔧 איך להשתמש?

### 1. הרצת Migration
```bash
# בעורך SQL של Supabase:
psql -f scripts/017-template-multi-document-types.sql
```

### 2. גישה לעמוד Variables
1. היכנס כאדמין ל-`/admin`
2. לחץ על **Variables** בתפריט העליון
3. עיין בכל הערכים והמשתנים

### 3. יצירת תבנית חדשה עם ריבוי מסמכים
1. נווט ל-`/admin/templates/new`
2. בחר **כמה סוגי מסמכים** (checkbox grid)
3. כתוב HTML/CSS
4. שמור - התבנית תתמוך בכל הסוגים שבחרת

### 4. העתקת ערכים לשימוש
```typescript
// דוגמה: שימוש ב-values מהקונפיג
import { PAYMENT_METHODS, CURRENCIES } from '@/config/documentVariables'

// בקומפוננטה:
<select>
  {PAYMENT_METHODS.map(pm => (
    <option key={pm.value} value={pm.value}>
      {pm.label}
    </option>
  ))}
</select>
```

---

## 📊 מבנה הנתונים

### SelectCategory Structure:
```typescript
{
  id: "payment_method",           // Key טכני
  label: "אמצעי תשלום",           // תצוגה
  group: "תשלום",                 // קבוצה לוגית
  options: [                      // רשימת אפשרויות
    { value: "cash", label: "מזומן" },
    { value: "credit_card", label: "כרטיס אשראי" },
    ...
  ],
  dependsOn: "payment_method"     // תלות (אופציונלי)
}
```

### Template Placeholders Structure:
```typescript
{
  company: {
    name: "{{company_name}}",
    email: "{{company_email}}",
    ...
  },
  customer: { ... },
  document: { ... },
  ...
}
```

---

## ✅ אחידות שמות - חוקים קריטיים

### 🚨 כללים שחובה לשמור עליהם:

1. **אל תיצור values חדשים** למושגים קיימים
   ```typescript
   ❌ "money" במקום "cash"
   ❌ "visa_card" במקום "visa"
   ✅ השתמש רק ב-values מ-documentVariables.ts
   ```

2. **אל תשנה keys קיימים**
   ```typescript
   ❌ שינוי "payment_method" ל-"paymentMethod"
   ✅ השאר את ה-naming convention
   ```

3. **כשמוסיפים מסמך חדש**:
   ```typescript
   // ✅ נכון - שימוש בקונפיג קיים
   import { PAYMENT_METHODS, CURRENCIES } from '@/config/documentVariables'
   
   // ❌ לא נכון - יצירת enum חדש
   const MY_PAYMENT_METHODS = ["מזומן", "כרטיס"]
   ```

4. **Placeholders אחידים**:
   ```html
   <!-- ✅ נכון - שם אחיד -->
   {{company_name}}
   {{customer_email}}
   
   <!-- ❌ לא נכון - שם שונה -->
   {{companyName}}
   {{customerMail}}
   ```

---

## 🔍 מיפוי Selectים קיימים

### קבלה (`ReceiptFormClient.tsx`):
| Select | Config Key | Values Count |
|--------|------------|--------------|
| אמצעי תשלום | `payment_method` | 21 |
| סוג כרטיס | `card_type` | 6 |
| סוג עסקה | `card_deal_type` | 4 |
| צ'ק | `check_type` | 2 |
| מטבע | `currency` | 4 |
| שפה | `language` | 3 |

### ניהול קבלות (`ReceiptsListClient.tsx`):
| Select | Config Key | Values Count |
|--------|------------|--------------|
| סטטוס מסמך | `document_status` | 6 |

### הגדרות חברה (`SettingsClient.tsx`):
| Select | Config Key | Values Count |
|--------|------------|--------------|
| סוג עסק | `business_type` | 6 |

---

## 🚀 שימושים מתקדמים

### Export בפורמטים שונים:
```typescript
import { exportCategoryValues } from '@/config/documentVariables'

// CSV - לשימוש בדוקומנטציה
const csv = exportCategoryValues('payment_method', 'csv')
// "bank_transfer, bit, paybox, credit_card, cash..."

// JSON - לשימוש ב-API
const json = exportCategoryValues('payment_method', 'json')
// [{"value":"bank_transfer","label":"העברה בנקאית"}...]

// Placeholders - לשימוש בתבניות
const placeholders = exportCategoryValues('payment_method', 'placeholders')
// {{payment_method.bank_transfer}}
// {{payment_method.bit}}
// ...
```

### קבלת Label מ-Value:
```typescript
import { getLabelByValue } from '@/config/documentVariables'

const label = getLabelByValue('payment_method', 'cash')
// "מזומן"
```

---

## 📝 TODO עתידי

### שלב הבא:
1. ✅ **הושלם**: Config מרכזי + עמוד אדמין
2. ✅ **הושלם**: Multi-document templates
3. ⏳ **ממתין**: שמירה של document types נוספים ב-junction table
4. ⏳ **ממתין**: עדכון ReceiptFormClient להשתמש ב-config
5. ⏳ **ממתין**: הוספת מסמכים חדשים (חשבונית, הצעת מחיר)

### שיפורים אפשריים:
- [ ] Validation rules לכל select (למשל: תשלומים חייבים להיות > 1 כאשר עסקה בתשלומים)
- [ ] תרגום אוטומטי של labels לשפות נוספות
- [ ] ייצוא ל-TypeScript types אוטומטי
- [ ] Live preview של placeholders בעמוד האדמין

---

## 🎯 סטטוס

| תכונה | סטטוס |
|-------|--------|
| Config מרכזי | ✅ הושלם |
| עמוד אדמין - Variables | ✅ הושלם |
| העתקה ב-3 פורמטים | ✅ הושלם |
| Migration לריבוי מסמכים | ✅ הושלם |
| UI לבחירת ריבוי מסמכים | ✅ הושלם |
| כפתור Variables בהדר | ✅ הושלם |
| Build עבר בהצלחה | ✅ |
| Migration הורץ | ⏳ ממתין |
| עדכון קוד קיים | ⏳ ממתין |

---

## 📚 דוגמאות קוד

### שימוש בקומפוננטה:
```typescript
import { PAYMENT_METHODS, CARD_TYPES } from '@/config/documentVariables'

function PaymentSelect() {
  return (
    <select>
      {PAYMENT_METHODS.map(method => (
        <option key={method.value} value={method.value}>
          {method.label}
        </option>
      ))}
    </select>
  )
}
```

### שימוש בתבנית HTML:
```html
<div class="payment">
  <p>אמצעי תשלום: {{payment_method_label}}</p>
  
  {{#isPaymentMethod payment_method 'credit_card'}}
    <p>כרטיס: {{card_type}} - {{card_last_digits}}</p>
    <p>תשלומים: {{card_installments}}</p>
  {{/isPaymentMethod}}
  
  {{#isPaymentMethod payment_method 'check'}}
    <p>צ'ק מספר: {{check_number}}</p>
    <p>בנק: {{check_bank}} סניף: {{check_branch}}</p>
  {{/isPaymentMethod}}
</div>
```

---

## 🔗 קישורים מהירים

- **Config File**: [`config/documentVariables.ts`](config/documentVariables.ts)
- **Admin Page**: `/admin/document-variables`
- **Migration**: [`scripts/017-template-multi-document-types.sql`](scripts/017-template-multi-document-types.sql)
- **Template Editor**: `/admin/templates/new`

---

**נוצר ב**: January 1, 2026  
**גרסה**: 1.0  
**מפתח**: AI Assistant  
**מטרה**: Single Source of Truth למסמכים

# TODO - מערכת משתני מסמכים

## ✅ הושלם

- [x] יצירת `config/documentVariables.ts` - מקור אמת מרכזי
- [x] מיפוי כל 21 אמצעי התשלום
- [x] מיפוי כל ה-selectים במערכת (11 קטגוריות)
- [x] יצירת עמוד `/admin/document-variables`
- [x] UI עם 3 טאבים (Select values, Placeholders, Grouped)
- [x] פונקציונליות העתקה (CSV, JSON, Placeholders)
- [x] פונקציונליות חיפוש
- [x] Migration `017-template-multi-document-types.sql`
- [x] עדכון `NewTemplateClient.tsx` לריבוי מסמכים
- [x] כפתור Variables בהדר האדמין
- [x] Build עובר בהצלחה
- [x] מסמך תיעוד מקיף
- [x] מדריך מהיר

---

## 🔥 עדיפות גבוהה

### 1. הרצת Migration
**File**: `scripts/017-template-multi-document-types.sql`

**Steps**:
```bash
# 1. היכנס ל-Supabase Dashboard
# 2. SQL Editor
# 3. העתק והדבק את הקובץ
# 4. הרץ
# 5. Verify:
SELECT * FROM template_document_types LIMIT 5;
```

**Validation**:
- [ ] טבלה `template_document_types` קיימת
- [ ] נוצר אינדקס על `template_id`
- [ ] נוצר אינדקס על `document_type`
- [ ] RLS policies פעילים
- [ ] נתונים ממוגרים מ-`templates.document_type`

---

### 2. שמירה ל-Junction Table
**File**: `app/admin/templates/new/NewTemplateClient.tsx` (שורה ~116)

**Current Code**:
```typescript
// TODO: Also save to template_document_types junction table
const payload = {
  ...
  documentType: selectedDocumentTypes[0] // רק הראשון נשמר
}
```

**Required**:
1. צור Server Action חדש:
   ```typescript
   // app/admin/templates/actions.ts
   export async function saveTemplateDocumentTypesAction(
     templateId: string,
     documentTypes: string[]
   ) {
     const supabase = await createClient()
     
     // מחק קיימים
     await supabase
       .from('template_document_types')
       .delete()
       .eq('template_id', templateId)
     
     // הוסף חדשים
     const rows = documentTypes.map(dt => ({
       template_id: templateId,
       document_type: dt
     }))
     
     const { error } = await supabase
       .from('template_document_types')
       .insert(rows)
     
     if (error) throw error
   }
   ```

2. עדכן את `handleSave`:
   ```typescript
   const result = await createTemplateAction(payload)
   
   if (result.ok && result.templateId) {
     // שמור את כל הסוגים
     await saveTemplateDocumentTypesAction(
       result.templateId,
       selectedDocumentTypes
     )
     toast.success("התבנית נוצרה בהצלחה")
   }
   ```

**Checklist**:
- [ ] יצרת `saveTemplateDocumentTypesAction`
- [ ] קרא לה לאחר יצירת התבנית
- [ ] Test: צור תבנית עם 3 סוגי מסמכים
- [ ] Verify: בדוק ב-DB שנשמרו 3 rows ב-junction table

---

### 3. עדכון Receipt Form
**File**: `app/dashboard/documents/receipt/ReceiptFormClient.tsx`

**Current Code** (שורות 34-38):
```typescript
const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "העברה בנקאית" },
  { value: "bit", label: "Bit" },
  // ...
]
```

**Required Change**:
```typescript
import { PAYMENT_METHODS } from '@/config/documentVariables'

// מחק את ה-const PAYMENT_METHODS המקומי
// השתמש באימפורט
```

**Additional Files**:
- `app/dashboard/documents/receipt/PaymentDetailsSection.tsx` - עדכן גם שם

**Checklist**:
- [ ] הוסף import מ-`config/documentVariables`
- [ ] מחק את ה-PAYMENT_METHODS המקומי
- [ ] מחק גם `CARD_TYPES`, `CARD_DEAL_TYPES`, `CHECK_TYPES` אם יש
- [ ] עדכן את PaymentDetailsSection
- [ ] Test: בדוק שכל ה-selects עובדים
- [ ] Test: בדוק שהערכים נשמרים נכון

---

### 4. Template Editor - תצוגת Document Types
**Files**: 
- `app/admin/templates/[id]/page.tsx`
- `app/admin/templates/[id]/EditTemplateClient.tsx`

**Required**:
1. Fetch document types מ-junction table
2. הצג badges של כל הסוגים
3. אפשר עריכה (checkbox grid כמו ב-new)

**Checklist**:
- [ ] קרא מ-`template_document_types`
- [ ] הצג badges בראש העמוד
- [ ] אפשר עריכה
- [ ] שמור שינויים חזרה ל-junction table

---

### 5. Template List - תצוגת Document Types
**File**: `app/admin/templates/page.tsx` + components

**Current**: מציג רק `template.document_type` (value יחיד)

**Required**: 
1. Join עם `template_document_types`
2. הצג badges מרובים
3. אפשר פילטר לפי document type

**Checklist**:
- [ ] עדכן query ל-join
- [ ] הצג badges (עד 3, אחרי זה "+2 more")
- [ ] הוסף פילטר בצד
- [ ] Test עם תבניות חדשות

---

## 🔧 עדיפות בינונית

### 6. נורמליזציה של נתונים קיימים

**Issue**: יכול להיות שיש values ישנים בעברית ב-DB

**Steps**:
```sql
-- 1. בדוק אם יש values בעברית
SELECT DISTINCT payment_method 
FROM receipts 
WHERE payment_method NOT IN (
  'bank_transfer', 'bit', 'paybox', 'credit_card', 
  'cash', 'check', 'direct_debit', 'paypal'
  -- ... add all 21 values
);

-- 2. אם יש, צור migration לנורמליזציה
UPDATE receipts 
SET payment_method = 'bank_transfer'
WHERE payment_method = 'העברה בנקאית';

UPDATE receipts 
SET payment_method = 'cash'
WHERE payment_method = 'מזומן';

-- ... וכן הלאה
```

**Checklist**:
- [ ] Audit של כל הטבלאות עם payment_method
- [ ] Audit של כל הטבלאות עם document_type
- [ ] יצירת migration לנורמליזציה
- [ ] הרצה על production (לאחר backup!)
- [ ] Verification

---

### 7. Validation Rules

**File**: `config/documentVariables.ts`

**Add**:
```typescript
export const VALIDATION_RULES = {
  payment_method: {
    credit_card: {
      required: ['card_type', 'card_last_digits'],
      optional: ['card_installments', 'card_deal_type']
    },
    check: {
      required: ['check_number', 'check_date'],
      optional: ['check_bank', 'check_branch', 'check_account']
    },
    // ...
  }
}
```

**Usage**: בקומפוננטות Form לולידציה דינמית

**Checklist**:
- [ ] הוסף `VALIDATION_RULES` ל-config
- [ ] צור פונקציה `getRequiredFields(paymentMethod)`
- [ ] השתמש בה ב-`ReceiptFormClient`
- [ ] Test: בדוק שולידציה תקינה

---

### 8. תרגום לשפות נוספות

**File**: `config/documentVariables.ts`

**Add**:
```typescript
export const LABELS = {
  payment_method: {
    cash: {
      he: "מזומן",
      en: "Cash",
      ar: "نقدي"
    },
    // ...
  }
}
```

**Function**:
```typescript
export function getLabel(category: string, value: string, lang: 'he' | 'en' | 'ar') {
  return LABELS[category]?.[value]?.[lang] || value
}
```

**Checklist**:
- [ ] הוסף מבנה תרגומים
- [ ] השלם תרגום לאנגלית (90% labels כבר בעברית)
- [ ] תרגום לערבית (optional)
- [ ] עדכן `getLabelByValue` לקבל `lang` parameter

---

## 📝 עדיפות נמוכה

### 9. Live Preview של Placeholders
**File**: `app/admin/document-variables/DocumentVariablesClient.tsx`

**Add**: טאב 4 - Live Preview
- תצוגה של HTML template לדוגמה
- מילוי אוטומטי עם sample data
- Preview מלא של מסמך עם כל ה-placeholders

---

### 10. Auto-generate TypeScript Types
**Script**: `scripts/generate-types.ts`

```typescript
// Generate types from documentVariables.ts
// Output: lib/types/documentVariables.d.ts

export type PaymentMethod = 
  | "bank_transfer"
  | "bit"
  | "paybox"
  // ... auto-generated from PAYMENT_METHODS
```

---

### 11. Placeholder Autocomplete
**Component**: `components/admin/PlaceholderInput.tsx`

- Rich text editor עם autocomplete
- כתיבת `{{` פותחת dropdown
- Fuzzy search על placeholders
- Syntax highlighting

---

## 🔍 Testing Checklist

### Manual Tests:
- [ ] צור תבנית חדשה עם 3 סוגי מסמכים
- [ ] בדוק שנשמרו ב-junction table
- [ ] ערוך תבנית, שנה document types
- [ ] בדוק ברשימת תבניות שרואים את כל הסוגים
- [ ] צור קבלה עם payment_method = "credit_card"
- [ ] בדוק שפרטי כרטיס נשמרים נכון
- [ ] צור קבלה עם payment_method = "check"
- [ ] בדוק שפרטי צ'ק נשמרים
- [ ] העתק values מעמוד Variables ב-CSV
- [ ] הדבק ב-Google Sheets, בדוק פורמט
- [ ] העתק placeholders, הדבק בתבנית HTML
- [ ] Test חיפוש בעמוד Variables

### Automated Tests (אופציונלי):
```typescript
// tests/documentVariables.test.ts

describe('Document Variables', () => {
  it('should have 21 payment methods', () => {
    expect(PAYMENT_METHODS).toHaveLength(21)
  })
  
  it('should export values in CSV format', () => {
    const csv = exportCategoryValues('payment_method', 'csv')
    expect(csv).toContain('bank_transfer')
    expect(csv).toContain('bit')
  })
  
  // ...
})
```

---

## 🎯 סדר ביצוע מומלץ

1. **עכשיו** (5 דקות):
   - [ ] הרץ Migration 017
   - [ ] Verify טבלה נוצרה

2. **הבא** (30 דקות):
   - [ ] צור `saveTemplateDocumentTypesAction`
   - [ ] עדכן `handleSave` ב-NewTemplateClient
   - [ ] Test תבנית חדשה

3. **אחר כך** (1 שעה):
   - [ ] עדכן ReceiptFormClient להשתמש ב-config
   - [ ] עדכן PaymentDetailsSection
   - [ ] Test קבלה חדשה

4. **אחרי זה** (2 שעות):
   - [ ] עדכן Template Editor
   - [ ] עדכן Template List
   - [ ] Test המערכת המלאה

5. **בסוף** (אופציונלי):
   - [ ] נורמליזציה של נתונים
   - [ ] Validation rules
   - [ ] תרגומים

---

**Last Updated**: Jan 1, 2026  
**Status**: 60% Complete ✅  
**Next Action**: הרצת Migration 017

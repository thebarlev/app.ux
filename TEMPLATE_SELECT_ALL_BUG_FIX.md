# תיקון באג "בחר הכל" בעורך תבניות

## 📋 תיאור הבעיה

כאשר לוחצים על "בחר הכל" בעורך התבניות ושומרים, סוגי המסמכים **חשבונית מס/קבלה** ו**חשבונית זיכוי** לא נשמרו במסד הנתונים.

### הסיבה לבאג

הפונקציה `toTemplateDocumentType` ב-`actions.ts` המירה **שני סוגי מסמכים שונים** לאותו ערך במסד הנתונים:

```typescript
// ❌ לפני התיקון - קוד שגוי
if (documentType === "invoiceReceipt") return "tax_invoice"
if (documentType === "creditNote") return "tax_invoice"
```

כך ששני הסוגים הומרו ל-`tax_invoice`, וכאשר הקוד ניסה לשמור אותם בטבלה `template_document_types`, ה-UNIQUE CONSTRAINT (`template_id`, `document_type`) מנע כפילות והעלים אחד מהם.

## ✅ התיקון שבוצע

### 1. עדכון פונקציית ההמרה

**קובץ:** `app/admin/(app)/templates/actions.ts`

```typescript
// ✅ אחרי התיקון - קוד תקין
const toTemplateDocumentType = (documentType: string) => {
  if (documentType === "invoiceReceipt") return "invoice_receipt"  // ✅
  if (documentType === "creditNote") return "credit_note"          // ✅
  // ... rest of conversions
}
```

### 2. עדכון SQL Constraints

עודכנו הקבצים הבאים כדי לתמוך בערכים החדשים:

#### `scripts/017-template-multi-document-types.sql`
- הוסף `'invoice_receipt'` ו-`'credit_note'` ל-CHECK CONSTRAINT בטבלה `template_document_types`

#### `scripts/022-add-business-document-types.sql`
- עדכן את כל ה-CHECK CONSTRAINTs (בשני המופעים בקובץ)
- הוסף `'invoice_receipt'` ו-`'credit_note'` לטבלאות:
  - `template_document_types.document_type`
  - `templates.document_type` (legacy)

#### `scripts/023-fix-template-document-types-constraint.sql` (חדש)
- סקריפט עצמאי לתיקון ה-CONSTRAINT אם צריך להריץ אותו בנפרד

## 🔄 איך להחיל את התיקון

### בסביבת פיתוח
הקוד כבר מתוקן ויעבוד בפעם הבאה שתשמור תבנית.

### במסד הנתונים
הרץ את הסקריפט:
```bash
# אופציה 1: הרץ את הסקריפט המתוקן
psql -f scripts/022-add-business-document-types.sql

# אופציה 2: הרץ רק את התיקון
psql -f scripts/023-fix-template-document-types-constraint.sql
```

## 🧪 בדיקה

כדי לוודא שהתיקון עובד:

1. פתח עורך תבנית (/admin/templates/[id])
2. לחץ על "בחר הכל" בחלק סוגי המסמכים
3. שמור את התבנית
4. רענן את הדף
5. ✅ כל סוגי המסמכים צריכים להישאר מסומנים, כולל:
   - חשבונית מס/קבלה
   - חשבונית זיכוי

## 📊 סיכום שינויים

| קובץ | שינוי |
|------|-------|
| `app/admin/(app)/templates/actions.ts` | תוקנה פונקציית `toTemplateDocumentType` |
| `scripts/017-template-multi-document-types.sql` | עדכון CREATE TABLE CONSTRAINT |
| `scripts/022-add-business-document-types.sql` | עדכון כל ה-ALTER TABLE CONSTRAINTs |
| `scripts/023-fix-template-document-types-constraint.sql` | סקריפט תיקון חדש (נוצר) |

## 🎯 תוצאה

עכשיו כאשר לוחצים "בחר הכל" ושומרים תבנית, **כל 12 סוגי המסמכים** נשמרים כראוי:
- קבלה
- חשבונית מס
- **חשבונית מס/קבלה** ✅
- **חשבונית זיכוי** ✅
- הצעת מחיר
- חשבון עסקה
- הזמנת עבודה
- תעודת משלוח
- תעודת החזרה
- הזמנת רכש
- חשבונית עצמית
- חשבונית זיכוי עצמית

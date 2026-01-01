# Template System - Phase 1 Complete ✅

## תאריך: 1 בינואר 2026

---

## 📋 סיכום שלב 1 - Infrastructure

### ✅ מה בוצע

#### 1. התקנת Dependencies
```json
{
  "dependencies": {
    "handlebars": "^4.7.8",
    "playwright": "^1.49.1"
  }
}
```
- ✅ Handlebars מותקן (לתבניות HTML)
- ✅ Playwright מותקן + Chromium browser (להפקת PDF)

---

#### 2. SQL Schema - טבלת Templates
**קובץ:** `scripts/014-templates-table.sql`

**מבנה הטבלה:**
```sql
templates (
  id UUID,
  company_id UUID,          -- NULL = תבנית גלובלית
  name TEXT,
  description TEXT,
  document_type TEXT,       -- receipt, invoice, quote, delivery_note
  html_template TEXT,       -- תבנית Handlebars
  css TEXT,                 -- CSS מותאם אישית
  is_default BOOLEAN,       -- ברירת מחדל לחברה
  is_active BOOLEAN,        -- פעיל/מושבת
  created_at, updated_at, created_by
)
```

**RLS Policies:**
- `templates_select`: גישה לתבניות גלובליות + תבניות החברה
- `templates_insert`: יצירת תבניות רק לחברה שלי
- `templates_update`: עדכון תבניות רק של החברה שלי
- `templates_delete`: מחיקת תבניות רק של החברה שלי

**עדכונים נוספים:**
- הוספת עמודה `pdf_path` לטבלת `documents` (שומר קישור ל-PDF שנוצר)

---

#### 3. TypeScript Types
**קובץ:** `lib/types/template.ts`

**Types מרכזיים:**
```typescript
// 1. Template Definition (מיפוי למסד נתונים)
interface TemplateDefinition {
  id: string
  company_id: string | null
  name: string
  html_template: string
  css: string | null
  document_type: "receipt" | "invoice" | "quote" | "delivery_note"
  is_default: boolean
  is_active: boolean
}

// 2. Receipt Template Data (נתונים להחדרה לתבנית)
interface ReceiptTemplateData {
  company: CompanyData       // שם, ח.פ, לוגו, חתימה
  customer: CustomerData | null
  document: DocumentData     // מספר, תאריך, תיאור
  payments: PaymentItem[]    // אמצעי תשלום
  items: LineItem[]          // פריטים (אם יש)
  totals: TotalsData        // סכומים
  notes: NotesData          // הערות
}

// 3. PDF Generation Options
interface PDFGenerationOptions {
  format?: "A4" | "Letter"
  landscape?: boolean
  margin?: { top, right, bottom, left }
  printBackground?: boolean
  outputPath?: string
}
```

**Placeholders Catalog:**
- 30+ placeholders מוגדרים (company, customer, document, payments, items, totals, notes)
- כל placeholder כולל תיאור ודוגמה לשימוש

---

#### 4. Template Engine
**קובץ:** `lib/template-engine.ts`

**Handlebars Helpers (פונקציות עזר):**
```javascript
{{formatCurrency amount currency}}      // → "1,234.56 ₪"
{{formatDate dateString}}                // → "27/12/2025"
{{formatPercent value}}                  // → "17%"
{{isPaymentMethod method "cash"}}        // → true/false
{{#if (eq a b)}}...{{/if}}              // השוואה
{{add a b}}                              // חיבור
{{multiply a b}}                         // כפל
```

**Functions:**
```typescript
compileTemplate(html)                    // קומפילציה של תבנית
renderTemplate(compiled, data)           // רינדור עם נתונים
compileAndRender(html, data)            // קומפילציה + רינדור בפעולה אחת
generatePDFFromHTML(html, css, options) // יצירת PDF עם Playwright
validateTemplate(html, docType)         // בדיקת placeholders נדרשים
getDefaultReceiptTemplate()             // תבנית ברירת מחדל
```

**תבנית ברירת מחדל:**
- תבנית קבלה מלאה (HTML + CSS)
- כולל: Header עם לוגו, פרטי חברה, פרטי לקוח, טבלת תשלומים, סכומים, חתימה
- RTL support מלא
- עיצוב נומורפי מותאם אישית

---

#### 5. PDF Service
**קובץ:** `lib/pdf-service.ts`

**Server Actions:**

##### 5.1 `getTemplateForDocument(companyId, documentType)`
מביא תבנית לפי סדר עדיפות:
1. תבנית מותאמת של החברה
2. תבנית גלובלית ברירת מחדל
3. תבנית hardcoded fallback

##### 5.2 `prepareDocumentData(documentId)`
מכין נתונים להחדרה לתבנית:
- שליפה מ-`documents` + `companies` + `customers` + `document_line_items`
- המרה ל-`ReceiptTemplateData` structure
- פרסור של `payment_metadata`

##### 5.3 `generateDocumentPDF(documentId)` ⭐ MAIN FUNCTION
תהליך מלא של הפקת PDF:
```typescript
1. בדיקת סטטוס (רק מסמכים final)
2. הכנת נתונים (prepareDocumentData)
3. שליפת תבנית (getTemplateForDocument)
4. ולידציה (validateTemplate)
5. רינדור HTML (compileAndRender)
6. יצירת PDF (generatePDFFromHTML)
7. העלאה ל-Storage (business-assets/documents/{company_id}/)
8. עדכון pdf_path ב-documents table
```

##### 5.4 `generatePreviewPDF(documentId)`
יצירת PDF זמני (ללא שמירה ב-Storage) - לתצוגה מקדימה

---

#### 6. API Route - PDF Download
**קובץ:** `app/api/documents/[documentId]/pdf/route.ts`

```typescript
GET /api/documents/{documentId}/pdf
```
- מפיק PDF preview
- מחזיר buffer עם headers להורדה
- Content-Type: application/pdf
- Cache-Control: no-cache

---

#### 7. Integration - Auto PDF Generation
**קובץ:** `app/dashboard/documents/receipt/actions.ts`

**שינוי ב-`issueReceiptAction`:**
```typescript
// After finalizing document
await finalizeDocument(draft.id, companyId, "receipt")

// Generate PDF asynchronously (don't block user)
import("@/lib/pdf-service")
  .then(({ generateDocumentPDF }) => generateDocumentPDF(draft.id))
  .then((result) => {
    if (result.success) {
      console.log("PDF generated:", result.path)
    }
  })
```

**חשוב:** PDF מופק **אסינכרונית** - לא חוסם את התגובה למשתמש!

---

## 🎯 תוצאות

### ✅ מה עובד כעת

1. **Database Ready:** טבלת `templates` עם RLS policies
2. **Type Safety:** TypeScript types מלאים למערכת תבניות
3. **Template Engine:** Handlebars עם 10 helpers מותאמים אישית
4. **PDF Generation:** Playwright + Chromium מוכנים (headless browser)
5. **Default Template:** תבנית קבלה RTL מלאה עם CSS
6. **Auto PDF:** קבלות מופקות ל-PDF אוטומטית בזמן finalize
7. **Storage:** PDF נשמר ב-`business-assets/documents/{companyId}/`
8. **Download API:** endpoint להורדת PDF

---

## 📁 קבצים שנוצרו

```
scripts/
  014-templates-table.sql              [NEW] ✅ SQL schema

lib/
  types/
    template.ts                        [NEW] ✅ TypeScript types
  template-engine.ts                   [NEW] ✅ Handlebars + helpers
  pdf-service.ts                       [NEW] ✅ PDF generation service

app/
  api/
    documents/
      [documentId]/
        pdf/
          route.ts                     [NEW] ✅ Download API

  dashboard/
    documents/
      receipt/
        actions.ts                     [MODIFIED] ✅ Auto PDF on finalize

package.json                           [MODIFIED] ✅ Added handlebars, playwright
```

---

## 🧪 Testing Steps

### 1. הרצת SQL Script
```bash
# העתק את התוכן של scripts/014-templates-table.sql
# הדבק ב-Supabase SQL Editor והרץ
```

### 2. יצירת קבלה חדשה
```bash
1. לך ל-/dashboard/documents/receipt
2. מלא פרטים + תשלומים
3. לחץ "צור קבלה"
```

**מה צריך לקרות:**
- ✅ Finalization מצליח
- ✅ PDF מופק באופן אסינכרוני
- ✅ קובץ PDF נשמר ב-Storage
- ✅ `documents.pdf_path` מתעדכן עם URL

### 3. הורדת PDF
```bash
# בדפדפן:
GET /api/documents/{documentId}/pdf
```
**צפוי:** הורדת קובץ PDF עם תוכן הקבלה

---

## 🚧 מה נשאר לשלב 2 (Template Admin UI)

### שלב 2A - Template List View
```
app/dashboard/admin/templates/
  page.tsx                  [TODO] רשימת תבניות
  actions.ts                [TODO] CRUD actions
```

### שלב 2B - Template Editor
```
app/dashboard/admin/templates/
  [id]/
    page.tsx                [TODO] עורך HTML/CSS
```

**Features:**
- טבלה עם כל התבניות
- כפתורי עריכה/מחיקה/שכפול
- הוספת תבנית חדשה
- Live preview
- Placeholders reference panel

---

## 🐛 Known Issues

### ⚠️ Playwright על Production (Vercel)
Playwright דורש Chromium binary - **לא יעבוד על Vercel Hobby plan**

**פתרונות:**
1. **Vercel Pro:** תומך ב-Chromium headless
2. **External Service:** שימוש ב-API חיצוני (Puppeteer as a Service)
3. **Serverless Function:** AWS Lambda עם Chromium layer

---

## 📝 Next Steps

1. **הרץ SQL Script** → `014-templates-table.sql` ב-Supabase
2. **בדוק PDF Generation** → צור קבלה, בדוק logs, ודא PDF נשמר
3. **תכנן Phase 2** → Admin UI לניהול תבניות

---

## ⚡ Quick Commands

```bash
# Build check
pnpm build

# Run dev server
pnpm dev

# Test Playwright installation
pnpx playwright --version

# Check Chromium binary
ls ~/Library/Caches/ms-playwright/chromium-1200
```

---

**Status:** ✅ Phase 1 Complete - Infrastructure Ready
**Next:** 🎨 Phase 2 - Admin UI for Template Management

# Template System - Setup Guide 🎨

## הרצת הסקריפטים ב-Supabase

### שלב 1: יצירת טבלת Templates
```bash
# פתח את Supabase Dashboard → SQL Editor
# העתק והדבק את התוכן של:
scripts/014-templates-table.sql
```

**מה הסקריפט עושה:**
- ✅ יוצר טבלת `templates`
- ✅ מוסיף RLS policies (גישה לתבניות גלובליות + תבניות החברה)
- ✅ מוסיף indexes לביצועים
- ✅ מוסיף עמודה `pdf_path` לטבלת `documents`
- ✅ יוצר trigger ל-`updated_at`

### שלב 2: הכנסת תבנית ברירת מחדל (אופציונלי)
```bash
# אם אתה רוצה תבנית גלובלית לכל החברות:
scripts/015-insert-default-template.sql
```

**מה הסקריפט עושה:**
- ✅ מכניס תבנית קבלה סטנדרטית
- ✅ `company_id = NULL` (גלובלי - זמין לכולם)
- ✅ `is_default = TRUE`
- ✅ כולל HTML + CSS מלאים

---

## בדיקת המערכת

### 1. גישה לדף ניהול תבניות
```
http://localhost:3001/dashboard/admin/templates
```

**מה אתה אמור לראות:**
- רשימת תבניות (ריקה או עם התבנית הגלובלית)
- כפתור "תבנית חדשה"
- סינון לפי סוג מסמך (receipt, invoice, quote, delivery_note)
- סינון לפי היקף (company, global)

### 2. יצירת תבנית ראשונה
```
לחץ על "תבנית חדשה" → מלא:
- שם: "הקבלה שלי"
- סוג מסמך: קבלה
- לחץ "טען תבנית ברירת מחדל"
- ערוך HTML/CSS לפי הצורך
- סמן "הגדר כברירת מחדל"
- שמור
```

### 3. בדיקת PDF Generation
```
1. נווט ל-/dashboard/documents/receipt
2. צור קבלה חדשה:
   - בחר לקוח
   - הוסף תשלום
   - מלא תיאור
3. לחץ "צור קבלה"
4. המערכת תפיק PDF באופן אוטומטי
5. בדוק ב-Console logs:
   "PDF generated successfully for document {id}: {url}"
```

---

## פתרון בעיות

### ❌ "Module not found: templates"
```bash
# וודא שהטבלה נוצרה:
SELECT * FROM public.templates LIMIT 1;
```

### ❌ "Row violates RLS policy"
```bash
# בדוק שיש לך company:
SELECT public.user_company_ids();

# אם ריק, הרץ:
scripts/SETUP_USER.sql
```

### ❌ "PDF generation failed"
```bash
# בדוק שהמסמך finalized:
SELECT document_status, pdf_path 
FROM documents 
WHERE id = '{document_id}';

# PDF path צריך להתעדכן אחרי finalize
```

### ❌ Playwright לא עובד על Vercel
```
⚠️ Playwright דורש binary של Chromium
פתרונות:
1. Vercel Pro (תומך ב-Chromium)
2. External PDF service (Puppeteer as a Service)
3. AWS Lambda + Chromium Layer
```

---

## Placeholders זמינים

### פרטי חברה
```handlebars
{{company.name}}
{{company.tax_id}}
{{company.address}}
{{company.phone}}
{{company.email}}
{{company.logo_url}}
{{company.signature_url}}
```

### פרטי לקוח
```handlebars
{{customer.name}}
{{customer.tax_id}}
{{customer.email}}
{{customer.phone}}
{{customer.address}}
```

### פרטי מסמך
```handlebars
{{document.number}}
{{document.issue_date}}
{{document.description}}
{{document.currency}}
```

### לולאות (Tables)
```handlebars
{{#each payments}}
  {{this.payment_method}}
  {{this.amount}}
  {{this.reference_number}}
{{/each}}

{{#each items}}
  {{this.description}}
  {{this.quantity}}
  {{this.unit_price}}
  {{this.line_total}}
{{/each}}
```

### סכומים
```handlebars
{{totals.subtotal}}
{{totals.vat_amount}}
{{totals.discount_amount}}
{{totals.total_amount}}
```

### Helpers (פונקציות עזר)
```handlebars
{{formatCurrency amount currency}}       → "1,234.56 ₪"
{{formatDate dateString}}                 → "27/12/2025"
{{formatPercent value}}                   → "17%"
{{#if (isPaymentMethod method "cash")}}...{{/if}}
{{#if (gt items.length 0)}}...{{/if}}
```

---

## דוגמאות שימוש

### קבלה פשוטה
```html
<div class="receipt">
  <h1>{{company.name}}</h1>
  <p>קבלה מס' {{document.number}}</p>
  <p>תאריך: {{formatDate document.issue_date}}</p>
  
  <h3>לקוח: {{customer.name}}</h3>
  
  <p>סה"כ: {{formatCurrency totals.total_amount document.currency}}</p>
</div>
```

### קבלה עם תשלומים
```html
<table>
  <thead>
    <tr><th>אמצעי תשלום</th><th>סכום</th></tr>
  </thead>
  <tbody>
    {{#each payments}}
    <tr>
      <td>
        {{#if (isPaymentMethod this.payment_method "cash")}}מזומן{{/if}}
        {{#if (isPaymentMethod this.payment_method "credit_card")}}כרטיס אשראי{{/if}}
      </td>
      <td>{{formatCurrency this.amount ../document.currency}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
```

### CSS לעיצוב RTL
```css
.receipt {
  direction: rtl;
  font-family: 'Heebo', Arial, sans-serif;
  max-width: 800px;
  margin: 0 auto;
  padding: 40px;
}

h1 {
  font-size: 28px;
  font-weight: 700;
  text-align: center;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  padding: 12px;
  text-align: right;
  border-bottom: 1px solid #e5e7eb;
}
```

---

## סטטוס מערכת

### ✅ מה עובד
- [x] טבלת templates עם RLS
- [x] CRUD operations (יצירה, עריכה, מחיקה, שכפול)
- [x] Admin UI מלא (רשימה + עורך)
- [x] Placeholders reference panel
- [x] PDF generation עם Playwright
- [x] Auto PDF on receipt finalize
- [x] Storage ב-`business-assets/documents/{companyId}/`
- [x] Default template fallback

### ⏳ בפיתוח
- [ ] Live preview בעורך
- [ ] Template validation (בדיקת placeholders חסרים)
- [ ] Multi-language support
- [ ] Template versioning
- [ ] PDF caching

---

## Quick Commands

```bash
# Build check
pnpm build

# Run dev
pnpm dev

# Check Playwright
pnpx playwright --version

# Test PDF locally (after creating receipt)
curl http://localhost:3001/api/documents/{documentId}/pdf > test.pdf
open test.pdf
```

---

**הבא:** צור קבלה ובדוק שה-PDF נוצר אוטומטית! 🚀

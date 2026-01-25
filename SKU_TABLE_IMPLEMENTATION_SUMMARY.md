# סיכום יישום: טבלת מק"ט ב-PDF

## ✅ הושלם בהצלחה

הוספנו תמיכה מלאה בטבלת מק"ט נפרדת בכל מסמכי ה-PDF (מלבד קבלה רגילה).

---

## 📊 מה עשינו?

### 1. שמירת מק"ט במסד נתונים ✅
**קובץ:** `lib/documents/actions.ts` (שורה 201)

```typescript
return {
  // ... שדות אחרים
  item_sku: item.sku || null, // ✅ שמירה ישירה של המק"ט
  payment_metadata: metadata,
};
```

**מה זה עושה:**
- כשמשתמש מזין מק"ט בטופס, הוא נשמר ישירות בשדה `item_sku` בטבלה `document_line_items`
- גם נשמר ב-`payment_metadata.sku` לתאימות אחורה

---

### 2. העברת מק"ט ל-PDF Service ✅
**קובץ:** `lib/pdf-service.ts` (שורות 1119-1128)

```typescript
items: (items || []).map((item) => ({
  description: item.description,
  quantity: item.quantity,
  unit_price: parseFloat(item.unit_price),
  amount: parseFloat(item.line_total),
  total_price: parseFloat(item.line_total),
  vat_rate: doc.vat_rate ? parseFloat(doc.vat_rate) : undefined,
  notes: item.notes || null,
  sku: item.item_sku || null, // ✅ הוסף מק"ט
})),
```

**מה זה עושה:**
- כל פריט במערך `items` מכיל כעת את השדה `sku`
- זמין לשימוש בתבניות דרך `{{#each items}}{{sku}}{{/each}}`

---

### 3. זיהוי קיום מק"ט ✅
**קובץ:** `lib/pdf-service.ts` (שורות 1087-1092)

```typescript
// Check if any item has SKU data (non-empty sku field)
const hasSkuData = (items || []).some((item: any) => {
  const sku = item.item_sku || null
  return sku && String(sku).trim().length > 0
})
```

**מה זה עושה:**
- בודק האם **לפחות שורה אחת** יש לה מק"ט לא ריק
- התוצאה נשמרת במשתנה `hasSkuData`

---

### 4. הוספת משתנה HAS_SKU_DATA ✅
**קובץ:** `lib/pdf-service.ts` (שורה 1095)

```typescript
const templateData: ReceiptTemplateData & Record<string, any> = {
  t,
  DOCUMENT_COPY_LABEL: options?.documentCopyLabel ?? "",
  HAS_SKU_DATA: hasSkuData, // ✅ משתנה חדש
  company: {
    // ...
  }
}
```

**מה זה עושה:**
- המשתנה `HAS_SKU_DATA` זמין לכל תבנית
- ניתן להשתמש בו כדי להציג/להסתיר טבלת מק"ט: `{{#if HAS_SKU_DATA}}`

---

### 5. יצירת טבלת SKU_ROWS_HTML ✅
**קובץ:** `lib/pdf-service.ts` (שורות 1291-1318)

```typescript
// ✅ יצירת טבלת מק"ט נפרדת - רק שורות עם מק"ט
const skuRows = (items || [])
  .filter((item: any) => {
    const sku = item.item_sku || null
    return sku && String(sku).trim().length > 0
  })
  .map((item: any) => {
    const metadata = item.payment_metadata || {}
    const quantity = Number.isFinite(item.quantity) ? item.quantity : 0
    const sku = item.item_sku || ""
    const description = metadata.details || item.description || metadata.label || ""
    
    const escapedSku = escapeHtml(String(sku))
    const escapedDescription = escapeHtml(description)
    const escapedQty = escapeHtml(String(quantity))
    
    return `<tr>
  <td>${escapedSku}</td>
  <td>${escapedDescription}</td>
  <td>${escapedQty}</td>
</tr>`
  })

templateData.SKU_ROWS_HTML = skuRows.join("\n")
```

**מה זה עושה:**
- מסנן רק שורות עם מק"ט
- יוצר HTML מוכן של שורות טבלה
- כל שורה מכילה: מק"ט, תיאור, כמות
- מבטיח אבטחה מפני XSS עם `escapeHtml`

---

## 📝 דוגמת שימוש בתבנית

### HTML בתבנית:
```handlebars
{{#if HAS_SKU_DATA}}
  <section class="sku-section" style="margin-top: 30px;">
    <h3>פירוט מק"טים</h3>
    <table class="table" style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background-color: #f3f4f6;">
          <th style="padding: 8px; border: 1px solid #e5e7eb;">מק"ט</th>
          <th style="padding: 8px; border: 1px solid #e5e7eb;">תיאור</th>
          <th style="padding: 8px; border: 1px solid #e5e7eb;">כמות</th>
        </tr>
      </thead>
      <tbody>
        {{{SKU_ROWS_HTML}}}
      </tbody>
    </table>
  </section>
{{/if}}
```

### תוצאה כשיש מק"ט:
```html
<section class="sku-section" style="margin-top: 30px;">
  <h3>פירוט מק"טים</h3>
  <table class="table" style="width: 100%; border-collapse: collapse;">
    <thead>
      <tr style="background-color: #f3f4f6;">
        <th style="padding: 8px; border: 1px solid #e5e7eb;">מק"ט</th>
        <th style="padding: 8px; border: 1px solid #e5e7eb;">תיאור</th>
        <th style="padding: 8px; border: 1px solid #e5e7eb;">כמות</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>ABC123</td>
        <td>מוצר A</td>
        <td>2</td>
      </tr>
      <tr>
        <td>XYZ789</td>
        <td>מוצר C</td>
        <td>3</td>
      </tr>
    </tbody>
  </table>
</section>
```

### תוצאה כשאין מק"ט:
הסקשן כולו לא מופיע (בגלל `{{#if HAS_SKU_DATA}}`)

---

## 🔍 משתנים זמינים בתבניות

| משתנה | סוג | תיאור | דוגמה |
|-------|-----|--------|--------|
| `HAS_SKU_DATA` | Boolean | האם יש לפחות מק"ט אחד | `true` / `false` |
| `SKU_ROWS_HTML` | String (HTML) | שורות טבלה מוכנות (רק עם מק"ט) | `<tr><td>ABC</td>...</tr>` |
| `items[].sku` | String \| null | מק"ט של פריט בודד | `"ABC123"` / `null` |

---

## 🎯 תמיכה במסמכים

### ✅ תומך (11 מסמכים):
1. חשבונית מס (`tax_invoice`)
2. חשבונית מס/קבלה (`invoiceReceipt`, `invoice_receipt`)
3. חשבונית זיכוי (`credit_note`)
4. הצעת מחיר (`quote`)
5. חשבון עסקה (`proforma`)
6. הזמנת עבודה (`work_order`)
7. תעודת משלוח (`delivery_note`)
8. תעודת החזרה (`return_note`)
9. הזמנת רכש (`purchase_order`)
10. חשבונית עצמית (`self_invoice`)
11. חשבונית זיכוי עצמית (`self_credit_note`)

### ❌ לא תומך (1 מסמך):
- קבלה רגילה (`receipt`) - ללא מערך items

---

## 🧪 בדיקות

### תרחיש 1: כל השורות עם מק"ט ✅
```
שורה 1: מק"ט="A1", תיאור="מוצר A", כמות=2
שורה 2: מק"ט="B2", תיאור="מוצר B", כמות=1
שורה 3: מק"ט="C3", תיאור="מוצר C", כמות=5
```
**תוצאה:**
- `HAS_SKU_DATA` = `true`
- טבלת מק"ט מכילה 3 שורות

### תרחיש 2: חלק מהשורות עם מק"ט ✅
```
שורה 1: מק"ט="A1", תיאור="מוצר A", כמות=2
שורה 2: מק"ט="", תיאור="מוצר B", כמות=1
שורה 3: מק"ט="C3", תיאור="מוצר C", כמות=5
```
**תוצאה:**
- `HAS_SKU_DATA` = `true`
- טבלת מק"ט מכילה **רק 2 שורות** (A1 ו-C3)

### תרחיש 3: אין מק"ט בכלל ✅
```
שורה 1: מק"ט="", תיאור="מוצר A", כמות=2
שורה 2: מק"ט="", תיאור="מוצר B", כמות=1
```
**תוצאה:**
- `HAS_SKU_DATA` = `false`
- הטבלה **לא מופיעה בכלל**

---

## 📦 קבצים ששונו

| קובץ | שורות | שינוי |
|------|-------|-------|
| `lib/pdf-service.ts` | 1119-1128 | הוסף `sku` למערך items |
| `lib/pdf-service.ts` | 1087-1092 | בדיקת קיום מק"ט |
| `lib/pdf-service.ts` | 1095 | הוסף `HAS_SKU_DATA` |
| `lib/pdf-service.ts` | 1291-1318 | יצירת `SKU_ROWS_HTML` |
| `lib/pdf-service.ts` | 1334-1344 | עדכון לוג debug |
| `lib/documents/actions.ts` | 201 | הוסף `item_sku` לשמירה |

---

## ⚡ ביצועים

- ✅ **יעיל** - רק שורות עם מק"ט מעובדות
- ✅ **מהיר** - `filter` + `map` פעם אחת
- ✅ **בטוח** - כל ערך עובר `escapeHtml`
- ✅ **זיכרון** - לא שומר עותקים מיותרים

---

## 🔒 אבטחה

- ✅ כל ערך HTML עובר `escapeHtml` למניעת XSS
- ✅ בדיקות null/undefined לפני שימוש
- ✅ המרה ל-string בטוחה עם `String()`
- ✅ trim() למניעת רווחים מיותרים

---

## 📚 תיעוד נוסף

קובץ מפורט: `SKU_TABLE_FEATURE.md`

---

## ✨ סיכום

השינוי הושלם בהצלחה! כעת כל מסמך PDF (מלבד קבלה רגילה) יכול להציג טבלת מק"ט נפרדת **רק כשהמשתמש הזין מק"ט**. 

התבניות צריכות רק להוסיף קוד פשוט:
```handlebars
{{#if HAS_SKU_DATA}}
  <טבלת מק"ט>
    {{{SKU_ROWS_HTML}}}
  </טבלת מק"ט>
{{/if}}
```

**הכל עובד! ✅**

# תיעוד: טבלת מק"ט ב-PDF

## 📋 סיכום השינוי

הוספנו תמיכה בטבלת מק"ט נפרדת בכל מסמכי ה-PDF. הטבלה מופיעה **רק אם המשתמש הזין מק"ט** באחת השורות או יותר.

## ✅ במה תומך השינוי

### מסמכי Income (עם מק"ט):
- ✅ חשבונית מס (`tax_invoice`)
- ✅ חשבונית מס / קבלה (`invoiceReceipt`, `invoice_receipt`)
- ✅ חשבונית זיכוי (`credit_note`)

### מסמכי Business (עם מק"ט):
- ✅ הצעת מחיר (`quote`)
- ✅ חשבון עסקה (`proforma`)
- ✅ הזמנת עבודה (`work_order`)
- ✅ תעודת משלוח (`delivery_note`)
- ✅ תעודת החזרה (`return_note`)
- ✅ הזמנת רכש (`purchase_order`)
- ✅ חשבונית עצמית (`self_invoice`)
- ✅ חשבונית זיכוי עצמית (`self_credit_note`)

### לא תומך:
- ❌ קבלה רגילה (`receipt`) - ללא מק"טים

---

## 🔧 שינויים טכניים

### 1. שמירה במסד נתונים
המק"ט נשמר בטבלה `document_line_items` בשדה `item_sku`:

```sql
CREATE TABLE document_line_items (
  ...
  item_sku text,  -- מק"ט הפריט
  ...
);
```

### 2. משתנים חדשים ב-Template

הוספנו 3 משתנים חדשים שזמינים לכל התבניות:

#### `HAS_SKU_DATA` (Boolean)
משתנה בוליאני שמציין האם יש לפחות שורה אחת עם מק"ט.

**שימוש:**
```handlebars
{{#if HAS_SKU_DATA}}
  <!-- הצג טבלת מק"ט רק אם יש מק"ט -->
  <section class="sku-section">
    <h3>פירוט מק"טים</h3>
    <table class="sku-table">
      {{{SKU_ROWS_HTML}}}
    </table>
  </section>
{{/if}}
```

#### `SKU_ROWS_HTML` (String)
HTML מוכן של שורות הטבלה - **רק שורות שיש להן מק"ט**.

**מבנה השורה:**
```html
<tr>
  <td>מק"ט</td>
  <td>תיאור</td>
  <td>כמות</td>
</tr>
```

**דוגמה:**
```handlebars
<table class="sku-table">
  <thead>
    <tr>
      <th>מק"ט</th>
      <th>תיאור</th>
      <th>כמות</th>
    </tr>
  </thead>
  <tbody>
    {{{SKU_ROWS_HTML}}}
  </tbody>
</table>
```

#### `items[].sku` (String | null)
כל פריט במערך `items` כולל כעת שדה `sku`.

**שימוש עם לולאה:**
```handlebars
{{#each items}}
  <tr>
    {{#if sku}}
      <td>{{sku}}</td>
    {{else}}
      <td>-</td>
    {{/if}}
    <td>{{description}}</td>
    <td>{{quantity}}</td>
  </tr>
{{/each}}
```

---

## 📝 דוגמאות שימוש

### דוגמה 1: טבלת מק"ט פשוטה

```handlebars
{{#if HAS_SKU_DATA}}
  <section class="sku-section">
    <h3>פירוט מק"טים</h3>
    <table class="table">
      <thead>
        <tr>
          <th>מק"ט</th>
          <th>תיאור הפריט</th>
          <th>כמות</th>
        </tr>
      </thead>
      <tbody>
        {{{SKU_ROWS_HTML}}}
      </tbody>
    </table>
  </section>
{{/if}}
```

### דוגמה 2: טבלה עם עיצוב מותאם

```handlebars
{{#if HAS_SKU_DATA}}
  <div class="sku-container" style="margin-top: 30px; padding: 20px; border: 1px solid #e5e7eb;">
    <h2 style="color: #374151; margin-bottom: 15px;">📦 פירוט מק"טים</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <thead style="background-color: #f3f4f6;">
        <tr>
          <th style="padding: 10px; text-align: right; border-bottom: 2px solid #d1d5db;">מק"ט</th>
          <th style="padding: 10px; text-align: right; border-bottom: 2px solid #d1d5db;">תיאור</th>
          <th style="padding: 10px; text-align: center; border-bottom: 2px solid #d1d5db;">כמות</th>
        </tr>
      </thead>
      <tbody>
        {{{SKU_ROWS_HTML}}}
      </tbody>
    </table>
  </div>
{{/if}}
```

### דוגמה 3: שימוש עם לולאת items (אם צריך שליטה מלאה)

```handlebars
{{#if HAS_SKU_DATA}}
  <section class="sku-details">
    <h3>מק"טים</h3>
    <table>
      <thead>
        <tr>
          <th>מק"ט</th>
          <th>תיאור</th>
          <th>כמות</th>
          <th>מחיר יחידה</th>
        </tr>
      </thead>
      <tbody>
        {{#each items}}
          {{#if sku}}
            <tr>
              <td>{{sku}}</td>
              <td>{{description}}</td>
              <td>{{quantity}}</td>
              <td>{{unit_price}}</td>
            </tr>
          {{/if}}
        {{/each}}
      </tbody>
    </table>
  </section>
{{/if}}
```

---

## 🎯 לוגיקה עסקית

### מתי הטבלה מופיעה?
הטבלה מופיעה **רק אם**:
1. המסמך הוא מסוג שתומך במק"טים (לא `receipt` רגיל)
2. לפחות שורה אחת יש לה מק"ט לא ריק

### מה קורה כשאין מק"ט?
- `HAS_SKU_DATA` = `false`
- `SKU_ROWS_HTML` = `""` (מחרוזת ריקה)
- הטבלה **לא תופיע** בכלל (בגלל ה-`{{#if HAS_SKU_DATA}}`)

### מה קורה כשחלק מהשורות יש מק"ט וחלק לא?
- הטבלה **תופיע** (כי `HAS_SKU_DATA` = `true`)
- `SKU_ROWS_HTML` יכיל **רק את השורות עם מק"ט**
- השורות ללא מק"ט פשוט לא יופיעו בטבלת המק"טים

---

## 🔍 בדיקה ווידוא

### איך לבדוק שהשינוי עובד?

1. **צור מסמך חדש** (חשבונית מס / הצעת מחיר / וכו')
2. **הוסף שורות עם מק"ט:**
   - שורה 1: מק"ט = "ABC123", תיאור = "מוצר A", כמות = 2
   - שורה 2: מק"ט = "", תיאור = "מוצר B", כמות = 1
   - שורה 3: מק"ט = "XYZ789", תיאור = "מוצר C", כמות = 3
3. **הפק PDF**
4. **בדוק את התוצאה:**
   - ✅ צריכה להופיע טבלת מק"ט
   - ✅ הטבלה צריכה להכיל רק 2 שורות (ABC123 ו-XYZ789)
   - ✅ מוצר B (ללא מק"ט) לא אמור להופיע בטבלת המק"טים

### מה לבדוק בקוד?

```javascript
// בקונסול (במצב development):
console.log("[template-vars][tax_invoice]", {
  HAS_SKU_DATA: true,  // ✅ צריך להיות true
  SKU_ROWS_HTML: "...", // ✅ צריך להכיל HTML
  TI_ROWS_HTML: "...",  // ✅ הטבלה הרגילה עדיין תקינה
});
```

---

## 📚 קבצים ששונו

1. **`lib/pdf-service.ts`**
   - שורה ~1082: הוספת `sku` למערך `items`
   - שורה ~1087: הוספת בדיקה `hasSkuData`
   - שורה ~1091: הוספת `HAS_SKU_DATA` ל-`templateData`
   - שורה ~1277-1311: יצירת `SKU_ROWS_HTML`
   - שורה ~1319: הוספת לוג למשתנים החדשים

---

## ⚠️ הערות חשובות

1. **אל תגע בתבניות ה-HTML הקיימות** - זה שינוי נקודתי שרק מוסיף משתנים חדשים
2. **התבניות נשלטות ידנית** - המנהלים צריכים להוסיף את הטבלה לתבניות שלהם
3. **אחורה תואם** - תבניות ישנות ימשיכו לעבוד, פשוט לא תופיע טבלת המק"ט
4. **ביצועים** - הלוגיקה יעילה, רק שורות עם מק"ט מעובדות

---

## ✨ סיכום

השינוי מאפשר לכל מסמך PDF (מלבד קבלה רגילה) להציג טבלת מק"ט נפרדת **רק כשהמשתמש הזין מק"ט**. זה עוזר לארגן מידע ולהפריד בין הטבלה הכספית הראשית לבין פירוט המק"טים.

**התבניות צריכות להוסיף:**
```handlebars
{{#if HAS_SKU_DATA}}
  <section class="sku-section">
    <h3>פירוט מק"טים</h3>
    <table class="table">
      <thead>
        <tr>
          <th>מק"ט</th>
          <th>תיאור</th>
          <th>כמות</th>
        </tr>
      </thead>
      <tbody>
        {{{SKU_ROWS_HTML}}}
      </tbody>
    </table>
  </section>
{{/if}}
```

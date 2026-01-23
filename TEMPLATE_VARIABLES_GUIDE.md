# 📘 מדריך Variables לתבניות - Preview & PDF

**תאריך:** 1 בינואר 2026

---

## 🎯 סקירה כללית

מסמך זה מפרט את כל ה-**variables** הזמינים לשימוש בתבניות HTML שלך.  
התבניות משתמשות ב-**Handlebars-style syntax** עם שלושה סוגי פקודות:

1. **{{variable}}** - החלפת משתנה בערך
2. **{{#if condition}}...{{/if}}** - תנאי (הצג רק אם קיים)
3. **{{#each array}}...{{/each}}** - לולאה על מערך

---

## 📋 כל ה-Variables הזמינים

### 📄 מטא-דאטה של המסמך

| Variable | דוגמה | תיאור |
|----------|--------|-------|
| `{{previewNumber}}` | `"000042"` | מספר המסמך (או "—" אם טיוטה) |
| `{{documentDate}}` | `"01/01/2026"` | תאריך המסמך בפורמט dd/mm/yyyy |
| `{{currentTime}}` | `"14:30"` | שעת יצירת המסמך |
| `{{description}}` | `"עבודות תחזוקה"` | תיאור המסמך |
| `{{notes}}` | `"הערה פנימית"` | הערות פנימיות (לא ללקוח) |
| `{{footerNotes}}` | `"תודה רבה!"` | הערות ללקוח (מופיע בתחתית) |
| `{{total}}` | `1000` | סכום כמספר (לחישובים) |
| `{{formattedTotal}}` | `"1,000.00 ₪"` | סכום מעוצב עם פסיקים ומטבע |
| `{{currency}}` | `"₪"` | סמל המטבע |

---

### 🏢 פרטי החברה

| Variable | דוגמה | תיאור |
|----------|--------|-------|
| `{{companyName}}` | `"העסק שלי בע״מ"` | שם החברה |
| `{{companyRegistration}}` | `"514588967"` | ח.פ / ע.מ |
| `{{companyAddress}}` | `"רחוב הרצל 1, תל אביב"` | כתובת מלאה |
| `{{companyPhone}}` | `"03-1234567"` | טלפון |
| `{{companyEmail}}` | `"info@example.com"` | אימייל |
| `{{companyWebsite}}` | `"https://example.com"` | אתר אינטרנט |
| `{{companyLogoUrl}}` | `"https://storage.../logo.png"` | כתובת URL ללוגו (להצגה ב-`<img>`) |
| `{{companySignatureUrl}}` | `"https://storage.../signature.png"` | כתובת URL לחתימה |

**שימו לב:** אם הלוגו/חתימה לא הועלו, ה-URL יהיה ריק.

---

### 👤 פרטי הלקוח

| Variable | דוגמה | תיאור |
|----------|--------|-------|
| `{{customerName}}` | `"יעקב כהן"` | שם הלקוח |
| `{{customerTaxId}}` | `"123456789"` | ח.פ / ע.מ של הלקוח |
| `{{customerPhone}}` | `"050-1234567"` | טלפון הלקוח |
| `{{customerEmail}}` | `"customer@example.com"` | אימייל הלקוח |
| `{{customerAddress}}` | `"רחוב הדקל 5, ירושלים"` | כתובת הלקוח המלאה |

---

### 💰 תשלומים (Array)

**Variable:** `{{payments}}`  
**Type:** Array של אובייקטים

כל תשלום במערך מכיל:

#### שדות בסיסיים (קיימים תמיד)

| Field | דוגמה | תיאור |
|-------|--------|-------|
| `{{this.method}}` | `"העברה בנקאית"` | אמצעי התשלום |
| `{{this.date}}` | `"2026-01-01"` | תאריך התשלום (פורמט ISO) |
| `{{this.formattedDate}}` | `"01/01/2026"` | תאריך התשלום מעוצב |
| `{{this.amount}}` | `1000` | סכום כמספר |
| `{{this.formattedAmount}}` | `"1,000.00 ₪"` | סכום מעוצב |
| `{{this.currency}}` | `"₪"` | מטבע |
| `{{this.index}}` | `0` | מספר שורה במערך (מתחיל מ-0) |
| `{{this.isEven}}` | `true` | האם שורה זוגית (לעיצוב) |

#### שדות העברה בנקאית (`method = "העברה בנקאית"`)

| Field | דוגמה | תיאור |
|-------|--------|-------|
| `{{this.bankAccount}}` | `"456789"` | מספר חשבון לקוח |
| `{{this.bankBranch}}` | `"123"` | מספר סניף |
| `{{this.bankName}}` | `"בנק לאומי"` | שם הבנק |

#### שדות כרטיס אשראי (`method = "כרטיס אשראי"`)

| Field | דוגמה | תיאור |
|-------|--------|-------|
| `{{this.cardLastDigits}}` | `"1234"` | 4 ספרות אחרונות |
| `{{this.cardType}}` | `"visa"` | סוג כרטיס (visa/mastercard/isracard/amex/diners/other) |
| `{{this.cardDealType}}` | `"payments"` | סוג עסקה (regular/payments/credit/deferred) |
| `{{this.cardInstallments}}` | `3` | מספר תשלומים |

#### שדות צ'ק (`method = "צ׳ק"`)

| Field | דוגמה | תיאור |
|-------|--------|-------|
| `{{this.checkNumber}}` | `"123456"` | מספר הצ'ק |
| `{{this.checkBank}}` | `"בנק דיסקונט"` | בנק המושך |
| `{{this.checkBranch}}` | `"456"` | סניף |
| `{{this.checkAccount}}` | `"789012"` | מספר חשבון |

#### שדות ארנקים דיגיטליים (Bit, PayBox, PayPal, וכו')

| Field | דוגמה | תיאור |
|-------|--------|-------|
| `{{this.payerAccount}}` | `"050-1234567"` | חשבון/טלפון המשלם |
| `{{this.transactionReference}}` | `"TXN-ABC123"` | מספר אסמכתא/עסקה |

#### שדות ניכויים (`method = "ניכוי אחר"`)

| Field | דוגמה | תיאור |
|-------|--------|-------|
| `{{this.description}}` | `"ניכוי מס במקור"` | תיאור הניכוי |

**שימו לב:** השדות הנוספים יהיו ריקים (`undefined`) אם לא רלוונטיים לאמצעי התשלום.

---

### 🎨 הגדרות עיצוב (styleSettings)

אלו **לא** משתנים ישירים ב-HTML, אבל אפשר לגשת אליהם ב-CSS:

**CSS Variables זמינים:**
```css
--receipt-bg: #ffffff;
--receipt-text: #000000;
--receipt-accent: #3b82f6;
--receipt-header-bg: #f3f4f6;
--receipt-header-text: #1f2937;
--receipt-table-header-bg: #1f2937;
--receipt-table-header-text: #ffffff;
--receipt-table-border: #e5e7eb;
--receipt-total-bg: #1f2937;
--receipt-total-border: #3b82f6;
```

**שימוש:**
```css
.my-element {
  background: var(--receipt-bg);
  color: var(--receipt-text);
  border-color: var(--receipt-accent);
}
```

---

## 🔧 דוגמאות שימוש

### 1. משתנה פשוט

```html
<div class="company-name">{{companyName}}</div>
<!-- Output: <div class="company-name">העסק שלי בע״מ</div> -->
```

---

### 2. Conditional (הצג רק אם קיים)

```html
<!-- הצג לוגו רק אם הועלה -->
{{#if companyLogoUrl}}
<img src="{{companyLogoUrl}}" alt="{{companyName}}">
{{/if}}

<!-- הצג כתובת רק אם קיימת -->
{{#if companyAddress}}
<div>כתובת: {{companyAddress}}</div>
{{/if}}
```

---

### 3. Loop על מערך (תשלומים)

```html
{{#if hasPayments}}
<table>
  <thead>
    <tr>
      <th>תאריך</th>
      <th>אמצעי תשלום</th>
      <th>פרטים</th>
      <th>סכום</th>
    </tr>
  </thead>
  <tbody>
    {{#each payments}}
    <tr>
      <td>{{this.formattedDate}}</td>
      <td>{{this.method}}</td>
      <td>
        <!-- פרטי העברה בנקאית -->
        {{#if this.bankName}}
          {{this.bankName}}
          {{#if this.bankBranch}}, סניף {{this.bankBranch}}{{/if}}
          {{#if this.bankAccount}}, חשבון {{this.bankAccount}}{{/if}}
        {{/if}}
        
        <!-- פרטי כרטיס אשראי -->
        {{#if this.cardLastDigits}}
          ****{{this.cardLastDigits}}
          {{#if this.cardType}} ({{this.cardType}}){{/if}}
          {{#if this.cardInstallments}} - {{this.cardInstallments}} תשלומים{{/if}}
        {{/if}}
        
        <!-- פרטי צ'ק -->
        {{#if this.checkNumber}}
          צ'ק {{this.checkNumber}}
          {{#if this.checkBank}} - {{this.checkBank}}{{/if}}
        {{/if}}
        
        <!-- ארנק דיגיטלי -->
        {{#if this.transactionReference}}
          אסמכתא: {{this.transactionReference}}
        {{/if}}
      </td>
      <td>{{this.formattedAmount}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
{{/if}}
```

**Output Example (העברה בנקאית + כרטיס אשראי):**
```html
<table>
  <tbody>
    <tr>
      <td>01/01/2026</td>
      <td>העברה בנקאית</td>
      <td>בנק לאומי, סניף 123, חשבון 456789</td>
      <td>500.00 ₪</td>
    </tr>
    <tr>
      <td>02/01/2026</td>
      <td>כרטיס אשראי</td>
      <td>****1234 (visa) - 3 תשלומים</td>
      <td>500.00 ₪</td>
    </tr>
  </tbody>
</table>
```

---

### 4. Nested Conditionals (תנאים מקוננים)

```html
{{#each payments}}
<div class="payment-item">
  <span class="method">{{this.method}}</span>
  <span class="amount">{{this.formattedAmount}}</span>
  
  <!-- העברה בנקאית -->
  {{#if this.bankName}}
  <div class="bank-details">
    <span>בנק: {{this.bankName}}</span>
    {{#if this.bankBranch}}
    <span>| סניף: {{this.bankBranch}}</span>
    {{/if}}
    {{#if this.bankAccount}}
    <span>| חשבון: {{this.bankAccount}}</span>
    {{/if}}
  </div>
  {{/if}}
  
  <!-- כרטיס אשראי -->
  {{#if this.cardLastDigits}}
  <div class="card-details">
    <span>כרטיס: ****{{this.cardLastDigits}}</span>
    {{#if this.cardType}}
    <span>({{this.cardType}})</span>
    {{/if}}
    {{#if this.cardInstallments}}
    <span>- {{this.cardInstallments}} תשלומים</span>
    {{/if}}
  </div>
  {{/if}}
  
  <!-- צ'ק -->
  {{#if this.checkNumber}}
  <div class="check-details">
    <span>צ'ק מס׳: {{this.checkNumber}}</span>
    {{#if this.checkBank}}
    <span>- {{this.checkBank}}</span>
    {{/if}}
  </div>
  {{/if}}
  
  <!-- ארנק דיגיטלי -->
  {{#if this.payerAccount}}
  <div class="digital-wallet">
    <span>חשבון: {{this.payerAccount}}</span>
    {{#if this.transactionReference}}
    <span>| אסמכתא: {{this.transactionReference}}</span>
    {{/if}}
  </div>
  {{/if}}
  
  <!-- ניכוי אחר -->
  {{#if this.description}}
  <div class="deduction-desc">{{this.description}}</div>
  {{/if}}
</div>
{{/each}}
```

---

### 5. דוגמה מלאה: כותרת מסמך

```html
<div class="receipt-header">
  <!-- לוגו + פרטי חברה -->
  <div class="company-section">
    {{#if companyLogoUrl}}
    <img src="{{companyLogoUrl}}" alt="{{companyName}}" class="logo">
    {{/if}}
    
    <h1>{{companyName}}</h1>
    
    {{#if companyRegistration}}
    <div>ח.פ: {{companyRegistration}}</div>
    {{/if}}
    
    {{#if companyAddress}}
    <div>{{companyAddress}}</div>
    {{/if}}
    
    {{#if companyPhone}}
    <div>טל: {{companyPhone}}</div>
    {{/if}}
  </div>
  
  <!-- פרטי מסמך -->
  <div class="document-section">
    <h2>קבלה</h2>
    <div>מספר: {{previewNumber}}</div>
    <div>תאריך: {{documentDate}}</div>
    {{#if currentTime}}
    <div>שעה: {{currentTime}}</div>
    {{/if}}
  </div>
</div>
```

---

## 🚨 שגיאות נפוצות

### ❌ לא נכון:
```html
<!-- משתמש ב-company_name במקום companyName -->
<div>{{company_name}}</div>

<!-- לא סוגר את ה-if -->
{{#if companyLogoUrl}}
<img src="{{companyLogoUrl}}">
<!-- חסר: {{/if}} -->

<!-- לא משתמש ב-this בתוך loop -->
{{#each payments}}
<div>{{method}}</div>  <!-- ❌ -->
{{/each}}
```

### ✅ נכון:
```html
<!-- camelCase -->
<div>{{companyName}}</div>

<!-- סוגר את ה-if -->
{{#if companyLogoUrl}}
<img src="{{companyLogoUrl}}">
{{/if}}

<!-- משתמש ב-this בתוך loop -->
{{#each payments}}
<div>{{this.method}}</div>  <!-- ✅ -->
{{/each}}
```

---

## 📦 תבנית Starter מלאה

קובץ: [TEMPLATE_EXAMPLE.html](TEMPLATE_EXAMPLE.html)

תבנית מוכנה לשימוש עם:
- ✅ כל ה-variables
- ✅ Conditionals נכונים
- ✅ Loop על תשלומים
- ✅ CSS מובנה
- ✅ RTL Support
- ✅ Print-ready (A4)

**איך להשתמש:**
1. העתק את ה-HTML מ-[TEMPLATE_EXAMPLE.html](TEMPLATE_EXAMPLE.html)
2. הדבק ב-Admin → Templates → New Template → HTML
3. התאם את ה-CSS לפי העיצוב שלך
4. שמור ובחר כ-default
5. צור קבלה חדשה ובדוק ב-preview!

---

## 🔍 איך לבדוק שה-Variables עובדים

### 1. פתח Console בדפדפן (F12)

בעמוד ה-Preview תראה:
```javascript
🔵 [PreviewClient] Rendering with template: {
  hasTemplate: true,
  templateLength: 5240
}
```

### 2. בדוק שה-HTML מעובד

לחץ **F12 → Elements** וחפש את:
```html
<div id="receipt-pdf-root">
  <!-- כאן אמור להיות ה-HTML המעובד עם ערכים אמיתיים -->
  <div class="company-name">העסק שלי בע״מ</div>  <!-- ✅ -->
</div>
```

אם אתה רואה:
```html
<div class="company-name">{{companyName}}</div>  <!-- ❌ המשתנה לא הוחלף! -->
```

**אז יש בעיה ב-template processing.**

### 3. בדוק שאין שגיאות JavaScript

ב-Console, אם יש:
```javascript
❌ Error: Cannot read property 'replace' of undefined
```

**זה אומר שאחד ה-variables לא קיים ב-templateData.**

---

## 💡 טיפים מתקדמים

### 1. טבלת תשלומים מפורטת (כל השדות)

```html
<table class="payments-table" dir="rtl">
  <thead>
    <tr>
      <th>תאריך</th>
      <th>אמצעי תשלום</th>
      <th>פרטים נוספים</th>
      <th>סכום</th>
    </tr>
  </thead>
  <tbody>
    {{#each payments}}
    <tr class="{{#if this.isEven}}even-row{{/if}}">
      <td>{{this.formattedDate}}</td>
      <td>{{this.method}}</td>
      <td class="details">
        <!-- העברה בנקאית -->
        {{#if this.bankName}}
        <div class="bank-transfer">
          <strong>{{this.bankName}}</strong>
          {{#if this.bankBranch}}<span>סניף: {{this.bankBranch}}</span>{{/if}}
          {{#if this.bankAccount}}<span>חשבון: {{this.bankAccount}}</span>{{/if}}
        </div>
        {{/if}}
        
        <!-- כרטיס אשראי -->
        {{#if this.cardLastDigits}}
        <div class="credit-card">
          <span>****{{this.cardLastDigits}}</span>
          {{#if this.cardType}}
            {{#if this.cardType}}
              <span class="card-type">
                {{#if this.cardType}}({{this.cardType}}){{/if}}
              </span>
            {{/if}}
          {{/if}}
          {{#if this.cardInstallments}}
            <span class="installments">{{this.cardInstallments}} תשלומים</span>
          {{/if}}
          {{#if this.cardDealType}}
            <span class="deal-type">
              {{#if this.cardDealType}}
                {{#if this.cardDealType}}({{this.cardDealType}}){{/if}}
              {{/if}}
            </span>
          {{/if}}
        </div>
        {{/if}}
        
        <!-- צ'ק -->
        {{#if this.checkNumber}}
        <div class="check">
          <span>צ'ק מס׳: {{this.checkNumber}}</span>
          {{#if this.checkBank}}<span>{{this.checkBank}}</span>{{/if}}
          {{#if this.checkBranch}}<span>סניף: {{this.checkBranch}}</span>{{/if}}
          {{#if this.checkAccount}}<span>חשבון: {{this.checkAccount}}</span>{{/if}}
        </div>
        {{/if}}
        
        <!-- ארנקים דיגיטליים (Bit, PayBox, PayPal, etc.) -->
        {{#if this.payerAccount}}
        <div class="digital-wallet">
          <span>חשבון: {{this.payerAccount}}</span>
          {{#if this.transactionReference}}
            <span>אסמכתא: {{this.transactionReference}}</span>
          {{/if}}
        </div>
        {{/if}}
        
        <!-- ניכוי אחר -->
        {{#if this.description}}
        <div class="deduction">{{this.description}}</div>
        {{/if}}
      </td>
      <td class="amount">{{this.formattedAmount}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
```

### 2. רשימת כל אמצעי התשלום האפשריים

| אמצעי תשלום | שדות זמינים |
|------------|-------------|
| **העברה בנקאית** | `bankName`, `bankBranch`, `bankAccount` |
| **כרטיס אשראי** | `cardLastDigits`, `cardType`, `cardDealType`, `cardInstallments` |
| **צ'ק** | `checkNumber`, `checkBank`, `checkBranch`, `checkAccount` |
| **Bit** | `payerAccount`, `transactionReference` |
| **PayBox** | `payerAccount`, `transactionReference` |
| **PayPal** | `payerAccount`, `transactionReference` |
| **Payoneer** | `payerAccount`, `transactionReference` |
| **Google Pay** | `payerAccount`, `transactionReference` |
| **Apple Pay** | `payerAccount`, `transactionReference` |
| **מזומן** | (אין שדות נוספים) |
| **ביטקוין / אתריום** | `payerAccount`, `transactionReference` |
| **שוברים** | `transactionReference`, `description` |
| **ניכויים** | `description`, `transactionReference` |

### 3. פורמט מותאם של תאריכים

אם אתה רוצה פורמט תאריך אחר, אתה יכול להשתמש ב-CSS:

```html
<div class="date-custom">{{documentDate}}</div>
```

```css
.date-custom::before {
  content: "תאריך הנפקה: ";
  font-weight: 600;
}
```

### 2. תנאי מורכב (AND/OR)

**Workaround עבור "אם יש לוגו וחתימה":**
```html
{{#if companyLogoUrl}}
  {{#if companySignatureUrl}}
  <div>יש גם לוגו וגם חתימה!</div>
  {{/if}}
{{/if}}
```

### 3. Default Values

אם משתנה לא קיים, הוא פשוט לא יוחלף:
```html
<div>{{customerName}}</div>
<!-- אם customerName לא קיים, יוצג: <div></div> -->
```

**Workaround:** השתמש ב-conditional:
```html
{{#if customerName}}
<div>{{customerName}}</div>
{{/if}}
<!-- אם לא קיים, ה-div לא יופיע בכלל -->
```

---

## 🎨 דוגמה: תבנית מינימליסטית

```html
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
      direction: rtl;
    }
    .header { 
      border-bottom: 2px solid #000;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .total {
      font-size: 32px;
      font-weight: bold;
      text-align: center;
      margin: 30px 0;
      padding: 20px;
      background: #000;
      color: #fff;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>{{companyName}}</h1>
    <div>קבלה מס׳ {{previewNumber}} | {{documentDate}}</div>
  </div>
  
  {{#if customerName}}
  <div>לכבוד: {{customerName}}</div>
  {{/if}}
  
  {{#if description}}
  <div>תיאור: {{description}}</div>
  {{/if}}
  
  <div class="total">{{formattedTotal}}</div>
  
  {{#if hasPayments}}
  <table border="1" width="100%">
    <tr>
      <th>תאריך</th>
      <th>אמצעי תשלום</th>
      <th>סכום</th>
    </tr>
    {{#each payments}}
    <tr>
      <td>{{this.formattedDate}}</td>
      <td>{{this.method}}</td>
      <td>{{this.formattedAmount}}</td>
    </tr>
    {{/each}}
  </table>
  {{/if}}
</body>
</html>
```

---

## 📞 תמיכה

אם משהו לא עובד:
1. בדוק ב-Console שה-template נטען: `hasTemplate: true`
2. בדוק שה-variables נכתבים ב-**camelCase** (לא snake_case)
3. בדוק שסגרת את כל ה-`{{#if}}` עם `{{/if}}`
4. בדוק שבתוך `{{#each}}` אתה משתמש ב-`{{this.field}}`

**הכל אמור לעבוד עכשיו!** 🎉

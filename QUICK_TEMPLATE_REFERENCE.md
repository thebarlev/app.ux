# 🚀 Quick Template Reference

**עזר מהיר ליצירת תבניות**

---

## 📝 שתי דרכים ליצור תבנית

### אופציה 1: HTML + CSS נפרדים (ברירת מחדל)
- שדה HTML → רק את ה-HTML
- שדה CSS → רק את ה-CSS
- **מומלץ:** ארגון נקי ונוח לעריכה

### אופציה 2: HTML מלא (כולל CSS) ✨ **חדש!**
- **הפעל:** Switch "HTML מלא (כולל CSS)" בעורך התבניות
- **הדבק:** HTML אחד עם `<style>` tags
- **שמור:** המערכת תחלץ את ה-CSS אוטומטית!

**דוגמה:**
```html
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial; direction: rtl; }
    .total { font-size: 32px; }
  </style>
</head>
<body>
  <h1>{{companyName}}</h1>
  <div class="total">{{formattedTotal}}</div>
</body>
</html>
```

---

## 📝 Variables הכי שימושיים

```html
<!-- Document -->
{{previewNumber}}        מספר קבלה
{{documentDate}}         תאריך (dd/mm/yyyy)
{{formattedTotal}}       סכום מעוצב עם ₪
{{description}}          תיאור

<!-- Company -->
{{companyName}}          שם החברה
{{companyLogoUrl}}       URL ללוגו
{{companyPhone}}         טלפון
{{companyAddress}}       כתובת

<!-- Customer -->
{{customerName}}         שם הלקוח
{{customerPhone}}        טלפון לקוח
{{customerEmail}}        אימייל לקוח
```

---

## 🔧 Syntax מהיר

### 1. משתנה פשוט
```html
<div>{{companyName}}</div>
```

### 2. תנאי (הצג רק אם קיים)
```html
{{#if companyLogoUrl}}
  <img src="{{companyLogoUrl}}">
{{/if}}
```

### 3. לולאה (תשלומים)
```html
{{#each payments}}
  <div>{{this.method}} - {{this.formattedAmount}}</div>
{{/each}}
```

### 4. תנאי בתוך לולאה
```html
{{#each payments}}
  <div>{{this.method}}</div>
  {{#if this.bankName}}
    <span>בנק: {{this.bankName}}</span>
  {{/if}}
{{/each}}
```

---

## ⚡ קטעי קוד מוכנים

### כותרת עם לוגו
```html
<div style="text-align: center; margin-bottom: 30px;">
  {{#if companyLogoUrl}}
    <img src="{{companyLogoUrl}}" style="max-width: 150px;">
  {{/if}}
  <h1>{{companyName}}</h1>
  <div>קבלה מס׳ {{previewNumber}} | {{documentDate}}</div>
</div>
```

### פרטי לקוח
```html
{{#if customerName}}
<div style="background: #f3f4f6; padding: 15px; border-radius: 8px;">
  <strong>לקוח:</strong> {{customerName}}<br>
  {{#if customerPhone}}
  <strong>טלפון:</strong> {{customerPhone}}<br>
  {{/if}}
  {{#if customerEmail}}
  <strong>אימייל:</strong> {{customerEmail}}
  {{/if}}
</div>
{{/if}}
```

### טבלת תשלומים
```html
{{#if hasPayments}}
<table border="1" width="100%" style="border-collapse: collapse;">
  <tr style="background: #000; color: #fff;">
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
```

### סה"כ בולט
```html
<div style="background: #000; color: #fff; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; margin: 30px 0;">
  {{formattedTotal}}
</div>
```

### חתימה
```html
{{#if companySignatureUrl}}
<div style="margin-top: 50px;">
  <img src="{{companySignatureUrl}}" style="max-width: 200px;">
  <div style="border-top: 1px solid #000; width: 200px; padding-top: 10px; text-align: center;">
    חתימה וחותמת
  </div>
</div>
{{/if}}
```

---

## 🎨 תבנית מינימלית מלאה

```html
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    body { 
      font-family: Arial; 
      max-width: 800px; 
      margin: 0 auto; 
      padding: 40px; 
    }
    .total { 
      font-size: 32px; 
      font-weight: bold; 
      text-align: center; 
      background: #000; 
      color: #fff; 
      padding: 20px; 
    }
    table { border-collapse: collapse; width: 100%; }
    th { background: #000; color: #fff; padding: 10px; }
    td { border: 1px solid #ddd; padding: 8px; }
  </style>
</head>
<body>
  <!-- Header -->
  <h1>{{companyName}}</h1>
  <div>קבלה {{previewNumber}} | {{documentDate}}</div>
  <hr>
  
  <!-- Customer -->
  {{#if customerName}}
  <div style="margin: 20px 0;">
    <strong>לקוח:</strong> {{customerName}}
  </div>
  {{/if}}
  
  <!-- Description -->
  {{#if description}}
  <div style="margin: 20px 0;">
    <strong>תיאור:</strong> {{description}}
  </div>
  {{/if}}
  
  <!-- Total -->
  <div class="total">{{formattedTotal}}</div>
  
  <!-- Payments -->
  {{#if hasPayments}}
  <table>
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

## 🚨 שגיאות נפוצות

| ❌ לא נכון | ✅ נכון |
|------------|---------|
| `{{company_name}}` | `{{companyName}}` |
| `{{#if logo}}` (לא סוגר) | `{{#if logo}}...{{/if}}` |
| `{{#each payments}}{{method}}` | `{{#each payments}}{{this.method}}` |
| `{{CompanyName}}` | `{{companyName}}` (camelCase) |

---

## 📦 קבצים לדוגמה

1. **[TEMPLATE_EXAMPLE.html](TEMPLATE_EXAMPLE.html)** - תבנית HTML מלאה עם כל התכונות
2. **[TEMPLATE_EXAMPLE.css](TEMPLATE_EXAMPLE.css)** - CSS מקצועי מוכן לשימוש
3. **[TEMPLATE_VARIABLES_GUIDE.md](TEMPLATE_VARIABLES_GUIDE.md)** - מדריך מפורט עם כל ה-variables

---

## 🎯 איך להתחיל

### דרך 1: HTML + CSS נפרדים
1. **פתח** `/admin/templates/new`
2. **הדבק** HTML ב-tab "HTML"
3. **הדבק** CSS ב-tab "CSS"
4. **שמור** ובחר כ-default

### דרך 2: HTML מלא (קל יותר!) ✨
1. **פתח** `/admin/templates/new`
2. **הפעל** Switch "HTML מלא (כולל CSS)"
3. **העתק** את [TEMPLATE_EXAMPLE.html](TEMPLATE_EXAMPLE.html) כולו
4. **הדבק** בשדה (כולל ה-`<style>` tags)
5. **שמור** - המערכת תחלץ את ה-CSS אוטומטית!
6. **צור קבלה** ב-`/dashboard/documents/receipt`
7. **לחץ תצוגה מקדימה** - אמור להשתמש בתבנית החדשה!

---

## 🔍 Debug

אם משהו לא עובד:

1. **פתח Console (F12)** ב-preview page
2. **חפש:** `🔵 [PreviewClient] Rendering with template:`
3. **אם רואה:** `hasTemplate: false` → התבנית לא נטענה
4. **אם רואה:** `{{companyName}}` ב-HTML → ה-variable לא הוחלף

**פתרון:** בדוק שהשם ב-**camelCase** ושסגרת את כל ה-`{{#if}}`

---

**הכל מוכן! צור תבנית ותתחיל לעבוד!** 🎨✨

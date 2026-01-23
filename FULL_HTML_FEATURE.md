# ✨ תכונה חדשה: HTML מלא (כולל CSS)

**תאריך:** 1 בינואר 2026

---

## 🎯 מה השתנה?

עכשיו אפשר להעלות תבנית HTML **אחת** שכוללת גם את ה-CSS בתוכה!

### לפני:
```
❌ חייב להדביק HTML בשדה אחד
❌ חייב להדביק CSS בשדה אחר
❌ שני שלבים נפרדים
```

### עכשיו:
```
✅ הדבק HTML אחד עם <style> tags
✅ המערכת תחלץ את ה-CSS אוטומטית
✅ שלב אחד פשוט!
```

---

## 📋 איך להשתמש?

### 1. פתח עמוד יצירת/עריכת תבנית
```
/admin/templates/new
או
/admin/templates/[id]
```

### 2. הפעל את ה-Switch
```
בפינה הימנית העליונה של "עורך תבנית":
☑️ HTML מלא (כולל CSS)
```

### 3. הדבק HTML מלא
```html
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      direction: rtl;
      padding: 40px;
    }
    .total {
      font-size: 32px;
      font-weight: bold;
      background: #000;
      color: #fff;
      padding: 20px;
      text-align: center;
    }
  </style>
</head>
<body>
  <h1>{{companyName}}</h1>
  <div>קבלה מס׳ {{previewNumber}} | {{documentDate}}</div>
  <hr>
  <div class="total">{{formattedTotal}}</div>
</body>
</html>
```

### 4. שמור
```
לחץ "שמור תבנית"
המערכת תחלץ את כל <style> tags אוטומטית ל-CSS field
```

---

## 🔄 המרה בין מצבים

### מ-HTML מופרד → HTML מלא
```
1. הפעל Switch "HTML מלא"
2. המערכת תשלב את ה-CSS ב-HTML אוטומטית
3. תראה HTML אחד עם <style> tags
```

### מ-HTML מלא → HTML מופרד
```
1. כבה Switch "HTML מלא"
2. המערכת תחלץ את ה-CSS מתוך <style> tags
3. תראה שני שדות נפרדים: HTML + CSS
```

---

## ⚙️ מה קורה בשמירה?

כשאתה שומר תבנית עם "HTML מלא":

1. **המערכת מחפשת** את כל ה-`<style>` tags
2. **מחלצת** את ה-CSS מתוכם
3. **שומרת** את ה-CSS ב-`css` column
4. **מסירה** את ה-`<style>` tags מה-HTML
5. **שומרת** את ה-HTML הנקי ב-`html_template` column

**התוצאה:** בדיוק אותו דבר כמו להדביק בשני שדות נפרדים!

---

## 💡 טיפים

### ✅ מומלץ להשתמש ב-HTML מלא אם:
- יש לך תבנית מוכנה מקובץ HTML
- העתקת דוגמה מהאינטרנט
- אתה מעדיף לראות הכל במקום אחד
- אתה עובד עם עורך חיצוני (VS Code, Sublime)

### ✅ מומלץ להשתמש ב-HTML מופרד אם:
- אתה רוצה לערוך רק את ה-CSS
- אתה משתמש באותו CSS עבור כמה תבניות
- אתה מעדיף ארגון נקי ומופרד

---

## 🚨 שאלות נפוצות

### האם זה ישבור תבניות קיימות?
**לא!** תבניות קיימות ימשיכו לעבוד בדיוק כמו קודם.

### האם אני חייב להשתמש ב-HTML מלא?
**לא!** זו אפשרות בחירה. אפשר להמשיך לעבוד עם שני שדות נפרדים.

### מה קורה אם יש לי כמה `<style>` tags?
המערכת תחלץ את **כולם** ותשלב ל-CSS אחד.

### האם אפשר לערוב בין המצבים?
**כן!** אפשר להחליף ביניהם בכל עת. המערכת תטפל בהמרה אוטומטית.

### מה קורה ל-`<link>` tags לCSS חיצוני?
הם יישארו ב-HTML. המערכת מחלצת רק `<style>` tags פנימיים.

---

## 📖 דוגמאות

### דוגמה 1: תבנית מינימלית
```html
<!DOCTYPE html>
<html dir="rtl">
<head>
  <style>
    body { font-family: Arial; padding: 40px; }
    h1 { font-size: 24px; }
  </style>
</head>
<body>
  <h1>{{companyName}}</h1>
  <p>{{documentDate}}</p>
</body>
</html>
```

### דוגמה 2: תבנית מלאה
```html
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Heebo', Arial, sans-serif;
      direction: rtl;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
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
      background: #000;
      color: #fff;
      padding: 20px;
      margin: 30px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      background: #000;
      color: #fff;
      padding: 10px;
    }
    td {
      border: 1px solid #ddd;
      padding: 8px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>{{companyName}}</h1>
    <div>קבלה {{previewNumber}} | {{documentDate}}</div>
  </div>
  
  {{#if customerName}}
  <p><strong>לקוח:</strong> {{customerName}}</p>
  {{/if}}
  
  <div class="total">{{formattedTotal}}</div>
  
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

## 🎉 סיכום

**עכשיו יש לך 2 דרכים ליצור תבניות:**

| דרך | יתרונות | מתאים ל |
|-----|----------|---------|
| **HTML מופרד** | ארגון נקי, עריכה קלה | עבודה שוטפת, תחזוקה |
| **HTML מלא** ✨ | קל לייבא, רואה הכל | העתקה מקבצים, דוגמאות |

**שתי הדרכים תקינות ושומרות את אותו התוצאה!** 🚀

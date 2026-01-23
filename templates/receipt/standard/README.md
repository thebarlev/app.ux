# תבנית קבלה סטנדרטית - Standard Receipt Template

תבנית קבלה מודרנית להפקת מסמכי קבלות בפורמט A4.

## קבצים

- `receipt-standard-template.html` - תבנית HTML של הקבלה
- `receipt-standard-styles.css` - עיצוב CSS של הקבלה

## משתנים (Variables)

התבנית משתמשת ב-Handlebars syntax עם המבנה הבא:

### פרטי חברה
- `{{company.name}}` - שם החברה
- `{{company.tax_id}}` - מספר עוסק (ח.פ)
- `{{company.address}}` - כתובת
- `{{company.phone}}` - טלפון
- `{{company.email}}` - אימייל
- `{{company.website}}` - אתר אינטרנט
- `{{company.logo_url}}` - כתובת לוגו

### פרטי לקוח
- `{{customer.name}}` - שם הלקוח
- `{{customer.tax_id}}` - ח.פ / ת.ז של הלקוח
- `{{customer.phone}}` - טלפון

### פרטי מסמך
- `{{document.number}}` - מספר קבלה
- `{{document.issue_date}}` - תאריך יצירה
- `{{formatDate document.issue_date}}` - תאריך מעוצב

### תשלומים (Loop)
```handlebars
{{#each payments}}
  <tr>
    <td>{{this.payment_method}}</td>
    <td>{{formatPaymentDetails this}}</td>
    <td>{{formatDate this.date}}</td>
    <td>{{formatCurrency this.amount this.currency}}</td>
  </tr>
{{/each}}
```

### סכומים
- `{{totals.total_amount}}` - סה"כ
- `{{totals.currency}}` - מטבע
- `{{formatCurrency totals.total_amount totals.currency}}` - סה"כ מעוצב

### הערות
- `{{notes.internal_notes}}` - הערות פנימיות
- `{{notes.footer_text}}` - טקסט תחתית

## Helpers זמינים

- `{{formatDate date}}` - עיצוב תאריך
- `{{formatCurrency amount currency}}` - עיצוב מטבע
- `{{formatPaymentDetails payment}}` - פרטי תשלום לפי סוג

## הדפסה

התבנית מותאמת להדפסה בפורמט A4 עם:
- גודל: 210mm x 297mm
- שוליים: 16mm מכל צד
- RTL layout מלא
- Print-safe CSS

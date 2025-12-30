# מדריך Classes לעיצוב קבלות - למנהלי מערכת

## סקירה כללית
כל אלמנט בקבלה כולל classes ייחודיים שמאפשרים למנהל המערכת לעצב את המסמך באמצעות CSS מותאם אישית דרך ממשק ה-Admin.

---

## 🎯 מבנה המסמך - חלוקה לחלקים

### חלק 1 - פרטי מסמך (Part 1)
**Container:** `receipt-part-1`

| אלמנט | Class ראשי | Class משני | תיאור |
|-------|-----------|-----------|-------|
| תאריך יצירה | `receipt-date` | - | תאריך הנפקת הקבלה |
| קבלה + מספר | `receipt-title-and-number` | `receipt-title-text`, `receipt-number` | כותרת "קבלה" ומספר סידורי |
| העתק נאמן למקור | `receipt-copy-text` | - | טקסט סטטי |

### חלק 2 - פרטי לקוח (Part 2)
**Container:** `receipt-part-2`

| אלמנט | Class ראשי | Class משני | תיאור |
|-------|-----------|-----------|-------|
| לכבוד | `receipt-to-label` | - | Label קבוע |
| שם לקוח | `receipt-customer-name` | - | שם הלקוח |
| מספר ת.ז/ח.פ | `receipt-customer-id` | - | מספר זהות/חברה |
| טלפון לקוח | `receipt-customer-phone` | - | מספר טלפון |

### חלק 3 - פרטי מנפיק (Part 3)
**Container:** `receipt-part-3`

| אלמנט | Class ראשי | Class משני | תיאור |
|-------|-----------|-----------|-------|
| לוגו | `receipt-company-logo` | - | תמונת לוגו |
| שם עסק | `receipt-company-name` | - | שם החברה המנפיקה |
| מספר ע.מ/ח.פ | `receipt-company-registration` | - | מספר רישום |
| כתובת | `receipt-company-address` | - | כתובת העסק |
| טלפון | `receipt-company-phone` | - | מספר טלפון |
| אתר | `receipt-company-website` | - | כתובת אתר |

---

## 📝 חלק תוכן המסמך

### תיאור (Description Section)
**Container:** `receipt-description-section`

| אלמנט | Class | תיאור |
|-------|-------|-------|
| Label "תיאור:" | `receipt-description-label` | כותרת הסעיף |
| טקסט Label | `receipt-description-label-text` | הטקסט עצמו |
| תוכן התיאור | `receipt-description-text` | Container לתוכן |
| ערך התיאור | `receipt-description-value` | הטקסט בפועל |

### פירוט תקבולים (Payments Table)
**Container:** `receipt-payments-section`

#### כותרת טבלה
| אלמנט | Class | תיאור |
|-------|-------|-------|
| כותרת ראשית | `receipt-payments-title` | "פירוט תקבולים" |
| מסגרת טבלה | `receipt-payments-table` | הטבלה כולה |

#### שורת Header
**Container:** `receipt-payments-table-header`

| אלמנט | Class | תיאור |
|-------|-------|-------|
| כל תא header | `receipt-payments-header-cell` | תאי כותרת (אמצעי, תאריך, סכום, פרטים) |

#### שורות תשלומים
**Container:** `receipt-payment-row`

| אלמנט | Class | תיאור |
|-------|-------|-------|
| אמצעי תשלום | `receipt-payment-method` | סוג התשלום (העברה בנקאית, צ'ק, וכו') |
| תאריך | `receipt-payment-date` | תאריך התשלום |
| סכום | `receipt-payment-amount` | הסכום ששולם |
| פרטים | `receipt-payment-details` | פרטי בנק/חשבון |

#### שורת סה"כ
**Container:** `receipt-payments-total-row`

| אלמנט | Class | תיאור |
|-------|-------|-------|
| סכום סה"כ | `receipt-payments-total-amount` | סכום כולל של כל התשלומים |

### סה"כ לתשלום (Total Section)
**Container:** `receipt-total-section`

| אלמנט | Class | Class משני | תיאור |
|-------|-------|-----------|-------|
| Label | `receipt-total-label` | `receipt-total-label-text` | "סה״כ לתשלום:" |
| סכום | `receipt-total-amount` | `receipt-total-value` | הסכום הסופי |

---

## 💬 הערות (Notes)

### הערות פנימיות
**Container:** `receipt-notes-internal`

| אלמנט | Class | Class משני | תיאור |
|-------|-------|-----------|-------|
| Label | `receipt-notes-internal-label` | `receipt-notes-internal-label-text` | "הערות פנימיות:" |
| תוכן | `receipt-notes-internal-text` | `receipt-notes-internal-value` | הטקסט בפועל |

### הערות ללקוח
**Container:** `receipt-notes-customer`

| אלמנט | Class | Class משני | תיאור |
|-------|-------|-----------|-------|
| Label | `receipt-notes-customer-label` | `receipt-notes-customer-label-text` | "הערות ללקוח:" |
| תוכן | `receipt-notes-customer-text` | `receipt-notes-customer-value` | הטקסט בפועל |

---

## 🔻 Footer - פרטי קבלה

**Container:** `receipt-footer`

### מטא-דאטה (3 תאים)
**Container:** `receipt-footer-meta`

#### מספר קבלה
**Container:** `receipt-footer-number`

| אלמנט | Class | Class משני | תיאור |
|-------|-------|-----------|-------|
| Label | `receipt-footer-number-label` | `receipt-footer-number-label-text` | "מספר קבלה" |
| ערך | `receipt-footer-number-value` | `receipt-footer-number-value-text` | המספר בפועל |

#### תאריך הנפקה
**Container:** `receipt-footer-issue-date`

| אלמנט | Class | Class משני | תיאור |
|-------|-------|-----------|-------|
| Label | `receipt-footer-issue-date-label` | `receipt-footer-issue-date-label-text` | "תאריך הנפקה" |
| ערך | `receipt-footer-issue-date-value` | `receipt-footer-issue-date-value-text` | התאריך |

#### סטטוס
**Container:** `receipt-footer-status`

| אלמנט | Class | Class משני | תיאור |
|-------|-------|-----------|-------|
| Label | `receipt-footer-status-label` | `receipt-footer-status-label-text` | "סטטוס" |
| ערך | `receipt-footer-status-value` | `receipt-footer-status-value-text` | סופי/טיוטה |

### חתימה דיגיטלית
**Container:** `receipt-footer-signature`

| אלמנט | Class | תיאור |
|-------|-------|-------|
| שורה 1 כולה | `receipt-footer-signature-line1` | "מסמך זה הופק באופן דיגיטלי ב-" |
| טקסט פתיחה | `receipt-footer-signature-line1-text` | החלק הקבוע |
| שם חברה | `receipt-footer-signature-company-name` | שם העסק |
| שורה 2 כולה | `receipt-footer-signature-line2` | "תאריך יצירה: XX • XX" |
| טקסט "תאריך יצירה:" | `receipt-footer-signature-line2-prefix` | Label |
| תאריך | `receipt-footer-signature-date` | התאריך |
| מפריד | `receipt-footer-signature-separator` | " • " |
| שעה | `receipt-footer-signature-time` | השעה |
| Copyright כולו | `receipt-footer-copyright` | "© כל הזכויות שמורות" |
| טקסט copyright | `receipt-footer-copyright-text` | הטקסט עצמו |

---

## 🎨 דוגמאות CSS למנהל מערכת

### דוגמה 1: שינוי צבע כותרת ראשית
```css
.receipt-title-text {
  color: #2563eb !important;
  font-size: 28px !important;
}

.receipt-number {
  color: #dc2626 !important;
}
```

### דוגמה 2: עיצוב טבלת תשלומים
```css
.receipt-payments-table-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
}

.receipt-payments-header-cell {
  color: white !important;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.receipt-payment-row:hover {
  background: #f3f4f6 !important;
  transition: all 0.3s ease;
}
```

### דוגמה 3: עיצוב סה"כ
```css
.receipt-total-section {
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%) !important;
  border: 3px solid #d97706 !important;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.receipt-total-value {
  font-size: 32px !important;
  color: #78350f !important;
  text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
}
```

### דוגמה 4: לוגו מעוגל עם צל
```css
.receipt-company-logo img {
  border-radius: 50% !important;
  border: 4px solid #3b82f6 !important;
  box-shadow: 0 8px 16px rgba(59, 130, 246, 0.3) !important;
  padding: 10px;
  background: white;
}
```

### דוגמה 5: Footer מעוצב
```css
.receipt-footer-signature {
  background: linear-gradient(to top, #f3f4f6, transparent) !important;
  padding: 20px !important;
  border-radius: 8px;
}

.receipt-footer-copyright-text {
  font-family: 'Courier New', monospace !important;
  color: #6b7280 !important;
}
```

---

## ⚙️ הוספת CSS מותאם אישית בממשק Admin

1. היכנס לממשק ניהול המערכת
2. עבור ל: **הגדרות** → **עיצוב מסמכים** → **CSS מותאם אישית**
3. הדבק את קוד ה-CSS שלך
4. לחץ על **שמור שינויים**
5. תצוגה מקדימה תתעדכן אוטומטית

---

## ✅ Best Practices

### כללים חשובים:
1. **תמיד השתמש ב-`!important`** - כדי לדרוס את הסגנונות ברירת המחדל
2. **שמור על accessibility** - וודא ניגודיות צבעים מספקת
3. **בדוק תצוגה בהדפסה** - השתמש בתצוגה מקדימה של PDF
4. **שמור גיבוי** - לפני ביצוע שינויים גדולים
5. **התחל בקטן** - בדוק שינוי אחד בכל פעם

### Classes שכדאי להימנע משינוי:
- `receipt-pdf-root` - מבנה הבסיס של המסמך
- כל class שמתחיל ב-`grid-` - מבנה הרשת

---

## 📊 מפת Classes - תרשים היררכי

```
receipt-pdf-root
├── receipt-header
│   ├── receipt-part-1 (ימין)
│   │   ├── receipt-date
│   │   ├── receipt-title-and-number
│   │   │   ├── receipt-title-text
│   │   │   └── receipt-number
│   │   └── receipt-copy-text
│   ├── receipt-part-2 (ימין מתחת)
│   │   ├── receipt-to-label
│   │   ├── receipt-customer-name
│   │   ├── receipt-customer-id
│   │   └── receipt-customer-phone
│   └── receipt-part-3 (שמאל)
│       ├── receipt-company-logo
│       ├── receipt-company-name
│       ├── receipt-company-registration
│       ├── receipt-company-address
│       ├── receipt-company-phone
│       └── receipt-company-website
├── receipt-description-section
│   ├── receipt-description-label
│   │   └── receipt-description-label-text
│   └── receipt-description-text
│       └── receipt-description-value
├── receipt-payments-section
│   ├── receipt-payments-title
│   └── receipt-payments-table
│       ├── receipt-payments-table-header
│       │   └── receipt-payments-header-cell (×4)
│       ├── receipt-payment-row (×N)
│       │   ├── receipt-payment-method
│       │   ├── receipt-payment-date
│       │   ├── receipt-payment-amount
│       │   └── receipt-payment-details
│       └── receipt-payments-total-row
│           └── receipt-payments-total-amount
├── receipt-total-section
│   ├── receipt-total-label
│   │   └── receipt-total-label-text
│   └── receipt-total-amount
│       └── receipt-total-value
├── receipt-notes-internal
│   ├── receipt-notes-internal-label
│   │   └── receipt-notes-internal-label-text
│   └── receipt-notes-internal-text
│       └── receipt-notes-internal-value
├── receipt-notes-customer
│   ├── receipt-notes-customer-label
│   │   └── receipt-notes-customer-label-text
│   └── receipt-notes-customer-text
│       └── receipt-notes-customer-value
└── receipt-footer
    ├── receipt-footer-meta
    │   ├── receipt-footer-number
    │   │   ├── receipt-footer-number-label
    │   │   │   └── receipt-footer-number-label-text
    │   │   └── receipt-footer-number-value
    │   │       └── receipt-footer-number-value-text
    │   ├── receipt-footer-issue-date
    │   │   ├── receipt-footer-issue-date-label
    │   │   │   └── receipt-footer-issue-date-label-text
    │   │   └── receipt-footer-issue-date-value
    │   │       └── receipt-footer-issue-date-value-text
    │   └── receipt-footer-status
    │       ├── receipt-footer-status-label
    │       │   └── receipt-footer-status-label-text
    │       └── receipt-footer-status-value
    │           └── receipt-footer-status-value-text
    └── receipt-footer-signature
        ├── receipt-footer-signature-line1
        │   ├── receipt-footer-signature-line1-text
        │   └── receipt-footer-signature-company-name
        ├── receipt-footer-signature-line2
        │   ├── receipt-footer-signature-line2-prefix
        │   ├── receipt-footer-signature-date
        │   ├── receipt-footer-signature-separator
        │   └── receipt-footer-signature-time
        └── receipt-footer-copyright
            └── receipt-footer-copyright-text
```

---

## 🔐 אבטחה והרשאות

- **רק מנהלי מערכת** יכולים לערוך את ה-CSS המותאם אישית
- כל השינויים נשמרים ב-database עם `system_admins` RLS policy
- השינויים חלים על **כל המשתמשים** במערכת
- ניתן לשחזר לברירת מחדל בכל עת

---

**עדכון אחרון:** 30 בדצמבר 2025  
**גרסה:** 2.0 - מבנה Classes מלא ומפורט

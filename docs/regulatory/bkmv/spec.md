> ⚠️ **מיושן. מקור האמת הוא `docs/regulatory/bkmv/fields-1.31.json`.**

# BKMV / תקן 5.4 – Spec (Single Source of Truth)

מסמך זה הוא **Single Source of Truth** לפורמט ייצוא BKMV בתקינה 5.4, והוא מחייב את המימוש תחת `lib/regulatory/bkmv/`.

## Output structure

```
Income.zip
└── BKMVDATA.TXT
```

- קובץ ZIP אחד בשם: `Income.zip`
- בתוך ה־ZIP קובץ יחיד בשם: `BKMVDATA.TXT`

## Encoding / newline

- **Encoding**: ISO-8859-8-i (שדה 1029 = 1). **לא** Windows-1255 — הוא אינו מופיע במפרט.
- **Record format**: Fixed length (אין מפרידי שדות)
- **Newline**: CRLF (`\r\n`)

## Included documents

- נכללים רק מסמכים חשבונאיים במצב **FINAL** (`documents.document_status = 'final'`)
- **D120** מופיע רק למסמכי `receipt`

## Mandatory record codes

המערכת חייבת לייצר את הרשומות הבאות לפחות, בסדר הנכון:

| Code | Description |
|------|-------------|
| A100 | רשומת פתיחה |
| B100 | חשבון הנהלה ראשית |
| B110 | חשבון הנהלת חשבונות |
| C100 | כותרת מסמך |
| D110 | פרטי מסמך |
| D120 | פרטי קבלה (רק receipt) |
| M100 | פרטים כלליים |
| Z900 | רשומת סיום |

## Field-level spec (fixed-length)

⚠️ **חובה** להשלים כאן את טבלאות השדות (Length/Format/Padding/Required) מתוך מסמך 5.4.\n
המימוש יפעיל ולידציה ויחסום ייצוא אם הטבלאות אינן שלמות – כדי למנוע “המצאת תקן”.\n

### A100

| # | Field name | Description | Type | Length | Format | Padding | Required |
|---|------------|-------------|------|--------|--------|---------|----------|
| 1 | record_code | קוד רשומה | CHAR | 4 | A100 | - | כן |
| 2 | ... | ... | ... | ... | ... | ... | ... |

### B100

| # | Field name | Description | Type | Length | Format | Padding | Required |
|---|------------|-------------|------|--------|--------|---------|----------|
| 1 | record_code | קוד רשומה | CHAR | 4 | B100 | - | כן |
| 2 | ... | ... | ... | ... | ... | ... | ... |

### B110

| # | Field name | Description | Type | Length | Format | Padding | Required |
|---|------------|-------------|------|--------|--------|---------|----------|
| 1 | record_code | קוד רשומה | CHAR | 4 | B110 | - | כן |
| 2 | ... | ... | ... | ... | ... | ... | ... |

### C100

| # | Field name | Description | Type | Length | Format | Padding | Required |
|---|------------|-------------|------|--------|--------|---------|----------|
| 1 | record_code | קוד רשומה | CHAR | 4 | C100 | - | כן |
| 2 | ... | ... | ... | ... | ... | ... | ... |

### D110

| # | Field name | Description | Type | Length | Format | Padding | Required |
|---|------------|-------------|------|--------|--------|---------|----------|
| 1 | record_code | קוד רשומה | CHAR | 4 | D110 | - | כן |
| 2 | ... | ... | ... | ... | ... | ... | ... |

### D120 (Receipt only)

| # | Field name | Description | Type | Length | Format | Padding | Required |
|---|------------|-------------|------|--------|--------|---------|----------|
| 1 | record_code | קוד רשומה | CHAR | 4 | D120 | - | כן |
| 2 | ... | ... | ... | ... | ... | ... | ... |

### M100

| # | Field name | Description | Type | Length | Format | Padding | Required |
|---|------------|-------------|------|--------|--------|---------|----------|
| 1 | record_code | קוד רשומה | CHAR | 4 | M100 | - | כן |
| 2 | ... | ... | ... | ... | ... | ... | ... |

### Z900

| # | Field name | Description | Type | Length | Format | Padding | Required |
|---|------------|-------------|------|--------|--------|---------|----------|
| 1 | record_code | קוד רשומה | CHAR | 4 | Z900 | - | כן |
| 2 | ... | ... | ... | ... | ... | ... | ... |


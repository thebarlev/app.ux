# קו בסיס — לוגיקת הסטטוס והסגירה של מסמכים

נמדד 14.8.2026, **לפני** כל עבודת מיפוי לקובץ האחיד.
המסמך הזה הוא נקודת ההשוואה: בסוף העבודה נחזור אליו ונוכיח שהלוגיקה לא זזה.

⛔ **המסמך מתעד. הוא אינו מציע שינוי ואינו מבקש אחד.**

---

## ⚠️ תיקון הפניה — 16.8.2026, **נמדד מול המסד**

**ההפניה ל-`scripts/043` הייתה שגויה, וגם התיקון הראשון שנכתב כאן היה שגוי.**
בריפו יושבות שלוש גרסאות של `recompute_document_accounting`:

| קובץ | תאריך | מצב, **כפי שנמדד** |
|---|---|---|
| `scripts/043-fix-conversion-logic.sql` | 26.1.2026 | הוחלף |
| `scripts/110-receipt-always-paid.sql` | 27.7.2026 | הוחלף |
| `scripts/111-conversion-amount-aware.sql` | 27.7.2026 | ✅ **חי במסד** |

**המדידה:** `select pg_get_functiondef('public.recompute_document_accounting(uuid)'::regprocedure);`
החזירה גוף המכיל `total_converted`, `has_conversion`, וענף `partially_paid` עם
`outstanding_balance = doc_total - total_converted`. שלושת אלה קיימים אך ורק ב-`111`.

⛔ **הודעות הקומיט `3310b44` ו-`c8c8d22`, שטענו ש-111 "NOT applied", שגויות.**
`scripts/117-lock-security-definer-functions.sql:10` ("latest: scripts/111:54") צדק.
הנימוק המלא: `scripts/111-CORRECTION-applied-status.md`.

⚠️ **וזה משנה התנהגות, לא רק הפניה.** הענף החי הוא **מודע-סכום**: חשבונית מס של
₪100 מול חשבון עסקה של ₪700 **אינה** סוגרת אותו — הוא נשאר `partially_paid` עם
יתרה 600. תיאור ענף ה-conversion בהמשך המסמך (ארבעת השלבים) מתאר את גוף `043`/`110`
ו**אינו** מתאר את מה שרץ היום.

⛔ **הכלל שנלמד: הודעת קומיט אינה עדות למצב מסד. הבסיס היחיד הוא `pg_get_functiondef`.**

---

## היכן הלוגיקה יושבת

| שכבה | נתיב | טווח שורות |
|---|---|---|
| הכלל בקוד | `lib/documents/chaining.ts` | 198–222 |
| הביצוע במסד — ✅ **החי, נמדד** | `scripts/111-conversion-amount-aware.sql` | 103–145, בתוך `recompute_document_accounting` |
| הביצוע במסד — הוחלף | `scripts/110-receipt-always-paid.sql` | 96–119 |
| הביצוע במסד — הוחלף | `scripts/043-fix-conversion-logic.sql` | 61–93 |
| הקוראים בפועל | `app/dashboard/documents/tax-invoice/TaxInvoiceFormClient.tsx` | 965 |
| | `app/dashboard/documents/invoice-receipt/InvoiceReceiptFormClient.tsx` | 1144 |

⚠️ מספרי השורות של שני הטפסים נמדדו על `main`. בענף `security/stage-1` הם 898 ו-1077.

---

## הכלל בפועל, לכל סוג מסמך

**שתי הקבוצות שמגדירות את הכלל** (`chaining.ts:198, 201`):

```
SUPERSEDED_BY_INVOICE_TYPES = { "proforma" }
SUPERSEDING_TYPES           = { "tax_invoice", "invoice_receipt" }
```

`chainSupersedesSource()` מחזיר true **אך ורק** כאשר המקור הוא `proforma`
והיעד הוא `tax_invoice` או `invoice_receipt`.

| סוג מסמך | ניתן לסגור ידנית? | מה סוגר אותו, ובאיזה תנאי |
|---|---|---|
| `proforma` חשבון עסקה | **לא** | נסגר **רק** בהפקת `tax_invoice` או `invoice_receipt` שמצביעה עליו בקישור `link_type='conversion'`. הסטטוס שנקבע: `converted`, או `paid` אם היעד הוא `invoice_receipt` |
| `tax_invoice` | נסגר בתשלום | קבלה/זיכוי דרך קישורי `payment`/`credit`; לא דרך ענף ה-conversion |
| `invoice_receipt` | נושא תשלום בעצמו | `paid` בהפקה |
| `receipt` | נושא תשלום בעצמו | `paid` בהפקה |
| `credit_note` | — | `open` |
| `work_order`, `delivery_note`, `return_note`, `purchase_order`, `self_invoice`, `self_credit_note`, `quote` | — | אינם בקבוצות כלל; נשארים `open` |

⛔ **ארבעת השלבים הבאים מתארים את `043`/`110` ואינם מתארים את מה שרץ היום.** הענף החי
(`111`:103–145) מודע-סכום — הוא סוכם את סכומי ה-conversion במקום לסגור על עצם הקיום.
נשמר כפי שנמדד ב-14.8, ראה תיקון ההפניה למעלה. מילה במילה בהתנהגותו **דאז**:

1. בודק `exists(... document_links where source_document_id = p_document_id and link_type='conversion')`
2. אם קיים — לוקח את סוג מסמך היעד של הקישור האחרון
3. `new_status := case when target_type='invoice_receipt' then 'paid' else 'converted' end`
4. מעדכן `accounting_status`, `paid_amount = doc_total`, `credited_amount = 0`, `outstanding_balance = 0`

⚠️ **הכיוון קריטי:** המסמך שנסגר הוא ה-`source_document_id` של הקישור. זה **הפוך**
מקישור `credit`, שבו מסמך הזיכוי הוא ה-source. שינוי כיוון באחד מהם שובר את השני.

---

## מצב הסטטוסים בפרודקשן, כפי שנמדד

```
credit_note        open 80          delivery_note      open 105
invoice_receipt    paid 72          proforma           open 1
purchase_order     open 1           receipt            paid 64
return_note        open 1           self_credit_note   open 1
self_invoice       open 1           tax_invoice        open 33 · credited 26 · paid 7
work_order         open 109
```

---

## מה שאסור שיזוז

- שתי הקבוצות ב-`chaining.ts:198` ו-`:201`, ותוכנן.
- כיוון הקישור בענף ה-conversion: המסמך הנסגר הוא ה-source.
- `link_type` כמחרוזות: `'conversion'`, `'payment'`, `'credit'`.
- העובדה ש-`proforma` אינו נסגר בלחיצה.

⛔ מיפוי סוג מסמך לקוד נספח 1 נוגע ב-`lib/regulatory/bkmv/codes.ts` בלבד.
אם יתברר שמיפוי כלשהו מחייב נגיעה במשהו מהרשימה הזאת — זו עצירה, לא ביצוע.

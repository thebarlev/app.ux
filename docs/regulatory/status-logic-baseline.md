# קו בסיס — לוגיקת הסטטוס והסגירה של מסמכים

נמדד 14.8.2026, **לפני** כל עבודת מיפוי לקובץ האחיד.
המסמך הזה הוא נקודת ההשוואה: בסוף העבודה נחזור אליו ונוכיח שהלוגיקה לא זזה.

⛔ **המסמך מתעד. הוא אינו מציע שינוי ואינו מבקש אחד.**

---

## היכן הלוגיקה יושבת

| שכבה | נתיב | טווח שורות |
|---|---|---|
| הכלל בקוד | `lib/documents/chaining.ts` | 198–222 |
| הביצוע במסד | `scripts/043-fix-conversion-logic.sql` | 61–93, בתוך `recompute_document_accounting` |
| הקוראים בפועל | `app/dashboard/documents/tax-invoice/TaxInvoiceFormClient.tsx` | 965 |
| | `app/dashboard/documents/invoice-receipt/InvoiceReceiptFormClient.tsx` | 1144 |

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

**ענף ה-conversion במסד** (`043`, שורות 61–93), מילה במילה בהתנהגותו:

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

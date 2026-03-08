# שלב בדיקה ותיקון אחרי הרצת Migration 085

## Root cause (אושר)

- Migration 085 לא הורצה → הפונקציה עם 3 פרמטרים לא הייתה קיימת ב-DB
- הקוד ב-`process-indicator-event.ts` קורא עם 3 params → כשל

---

## 1. SQL Verify – אימות שהפונקציה קיימת

### 1.1 הצגת כל ה-overloads

```sql
-- הצגת כל ה-overloads של issue_auditor_charge_invoice_receipt_service
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  oidvectortypes(p.proargtypes) AS arg_types
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'issue_auditor_charge_invoice_receipt_service'
ORDER BY p.oid;
```

**תוצאה צפויה אחרי 085:**

| function_name | identity_args | arg_types |
|---------------|---------------|-----------|
| issue_auditor_charge_invoice_receipt_service | p_auditor_charge_id, p_issuer_company_id | uuid, uuid |
| issue_auditor_charge_invoice_receipt_service | p_auditor_charge_id, p_issuer_company_id, p_is_en | uuid, uuid, boolean |

אם יש רק שורה אחת עם `uuid,uuid` – 085 לא רץ. צריך להריץ:
```bash
psql "$DATABASE_URL" -f scripts/085-auditor-en-invoice-no-vat.sql
```

---

## 2. SQL – איתור charges ללא חשבונית

```sql
-- Charges שחויבו בהצלחה אבל לא קיבלו issued_invoice_id
SELECT
  c.id AS charge_id,
  c.company_id,
  c.plan_id,
  c.amount,
  c.currency,
  c.subscription_period_start,
  c.subscription_period_end,
  c.created_at
FROM public.auditor_subscription_charges c
WHERE c.status = 'succeeded'
  AND c.issued_invoice_id IS NULL
ORDER BY c.created_at DESC;
```

**הערה:** `currency = 'USD'` → EN flow (צריך `p_is_en = true`). `currency = 'ILS'` → Hebrew flow (`p_is_en = false`).

---

## 3. מסלול תיקון רטרואקטיבי – ממצאים

### 3.1 קיים: `app/api/admin/auditor/repair-missing-invoices`

| פריט | ערך |
|------|-----|
| **Method** | POST |
| **Auth** | `x-admin-secret: AUDITOR_REPAIR_SECRET` |
| **Body** | `{ "chargeId": "<uuid>" }` |
| **פעולה** | קורא ל-RPC עם 2 params: `p_auditor_charge_id`, `p_issuer_company_id` |

**בעיה:** ה-endpoint קורא עם **2 פרמטרים** בלבד → משתמש ב-overload מ-082 → תמיד מנפיק `invoice_receipt` עם מע״מ.  
לחיובים ב-USD (EN) רצוי `tax_invoice` ללא מע״מ, ולכן יש להעביר גם `p_is_en`.

### 3.2 אין script SQL ל-auditor charges

- `scripts/066-find-missing-paid-checkout-invoice-receipts.sql` – מיועד ל-`checkout_sessions` (לא auditor)
- אין script מקביל ל-`auditor_subscription_charges`

### 3.3 Idempotency

הפונקציה `issue_auditor_charge_invoice_receipt_service` היא idempotent:

1. אם `issued_invoice_id` כבר מלא → מחזירה את המסמך הקיים
2. אם קיים `documents.reference_text = 'auditor_charge:' || charge_id` → מקשרת ומחזירה
3. אחרת → יוצרת מסמך חדש

**אין סיכון ליצירת כפילויות** – אפשר לקרוא שוב באותו charge.

### 3.4 מסלול תיקון מומלץ

**אופציה א – שימוש ב-repair endpoint (לאחר עדכון):**

1. להריץ את ה-SQL לאיתור charges (סעיף 2)
2. לכל `charge_id` – לשלוח POST ל-repair endpoint
3. **נדרש עדכון:** ה-endpoint צריך להעביר `p_is_en` לפי `currency === 'USD'`

**אופציה ב – קריאה ישירה ל-RPC (psql):**

```sql
-- לכל charge_id מהרשימה – הרצה ידנית (החלף את ה-UUIDs)
SELECT * FROM public.issue_auditor_charge_invoice_receipt_service(
  '<charge_id>'::uuid,
  '<VOW_BILLING_COMPANY_ID>'::uuid,
  true   -- p_is_en: true ל-USD, false ל-ILS
);
```

**אופציה ג – batch script:**

לולאה על כל charge חסר, קריאה ל-RPC עם `p_is_en` לפי `currency`.

---

## 4. בדיקת ה-flows הרלוונטיים

### 4.1 `app/api/admin/auditor/repair-missing-invoices`

- מקבל `chargeId`
- קורא ל-RPC עם 2 params
- **חסר:** שליפת `currency` והעברת `p_is_en`

### 4.2 `lib/auditor/billing/process-indicator-event.ts`

- אחרי תשלום: קורא ל-RPC עם 3 params
- `p_is_en` נקבע מ-`success_url.includes("/en/auditor")`
- **תקין** אחרי 085

### 4.3 `app/api/auditor/billing/renewals/run/route.ts`

- קורא ל-RPC עם 2 params (חידוש מנוי)
- משתמש ב-overload מ-082 → `invoice_receipt` עם מע״מ
- חידושים כרגע רק בעברית (ILS) – מתאים

---

## 5. סיכום

| פריט | ערך |
|------|-----|
| **Root cause** | migration 085 לא הורצה |
| **תיקון migration** | `psql "$DATABASE_URL" -f scripts/085-auditor-en-invoice-no-vat.sql` |
| **מסלול תיקון charges היסטוריים** | repair endpoint (אחרי עדכון) או RPC ידני/script |
| **תיקון נדרש ב-repair** | הוספת `p_is_en` לפי `currency === 'USD'` |

---

## 6. תוכנית בדיקה – תשלום חדש

### 6.1 טרם הרצה

1. **Verify פונקציה:**
   ```sql
   SELECT proname, oidvectortypes(proargtypes)
   FROM pg_proc p
   JOIN pg_namespace n ON p.pronamespace = n.oid
   WHERE n.nspname = 'public'
     AND proname = 'issue_auditor_charge_invoice_receipt_service';
   ```
   צפויות 2 שורות: `uuid,uuid` ו-`uuid,uuid,bool`.

2. **Verify env:**
   - `AUDITOR_BILLING_ACCOUNT_ID` או `VOW_BILLING_COMPANY_ID` מוגדר
   - `AUDITOR_REPAIR_SECRET` (לצורך repair)

### 6.2 תשלום חדש – Hebrew (ILS)

1. כניסה ל-`/auditor`, בחירת חבילה, תשלום
2. אחרי אישור – בדיקה:
   - `auditor_subscription_charges`: `status = 'succeeded'`, `issued_invoice_id` לא null
   - `documents`: מסמך `invoice_receipt` עם `reference_text = 'auditor_charge:' || charge_id`
3. בדף חשבוניות – המסמך מופיע וניתן להורדה

### 6.3 תשלום חדש – English (USD)

1. כניסה ל-`/en/auditor`, בחירת חבילה, תשלום
2. אחרי אישור – בדיקה:
   - `auditor_subscription_charges`: `status = 'succeeded'`, `currency = 'USD'`, `issued_invoice_id` לא null
   - `documents`: מסמך `tax_invoice` עם `vat_rate = 0`
3. בדף חשבוניות – המסמך מופיע וניתן להורדה

### 6.4 Logs

בהצלחה:
```
[AUDITOR_PROCESS] Invoice issued { chargeId: '...', document_number: '...' }
```

בכשל:
```
[AUDITOR_PROCESS] Invoice issuance failed { chargeId: '...', error: '...' }
```

---

## 7. עדכון repair endpoint (בוצע)

ה-endpoint `repair-missing-invoices` עודכן:

1. שולף את ה-charge (כולל `currency`)
2. מחשב `p_is_en = currency === 'USD'`
3. קורא ל-RPC עם 3 params: `p_auditor_charge_id`, `p_issuer_company_id`, `p_is_en`
4. Fallback ל-issuer: `VOW_BILLING_COMPANY_ID` או `AUDITOR_BILLING_ACCOUNT_ID`

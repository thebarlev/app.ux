# Migration 085 – Deployment Verification & Safe Fix

## 1. Root Cause

- **הקוד** קורא ל-`issue_auditor_charge_invoice_receipt_service(p_auditor_charge_id, p_issuer_company_id, p_is_en)` (3 פרמטרים)
- **ב-DB** קיימת רק הגרסה מ-082 עם 2 פרמטרים
- PostgreSQL מחפש פונקציה עם 3 פרמטרים ולא מוצא → `Could not find the function in the schema cache`

---

## 2. אימות הקובץ 085

### 2.1 האם זה הקובץ הנכון?

**כן.** `scripts/085-auditor-en-invoice-no-vat.sql` הוא הקובץ שיוצר את הפונקציה עם 3 פרמטרים.

### 2.2 CREATE OR REPLACE

**כן.** השורה 17:
```sql
create or replace function public.issue_auditor_charge_invoice_receipt_service(
```

### 2.3 חתימה מדויקת

```sql
public.issue_auditor_charge_invoice_receipt_service(
  p_auditor_charge_id uuid,
  p_issuer_company_id uuid,
  p_is_en boolean default false
)
returns table (ok boolean, document_id uuid, document_number text)
```

### 2.4 תלויות (tables/functions/views)

| אובייקט | מקור | סיכון |
|---------|------|-------|
| `auditor_subscription_charges` | 081 | נמוך – קיים אם 082 רץ |
| `companies` | בסיס | נמוך |
| `auditor_plans` | 081 | נמוך |
| `documents` | בסיס | נמוך |
| `document_sequences` | בסיס | נמוך – יש fallback אם לא קיים |
| `document_line_items` | בסיס | נמוך |
| `pgcrypto` | extension | נמוך – `create extension if not exists` |
| `auth.role()` | Supabase | נמוך |

הסקריפט משתמש ב-`information_schema.columns` ו-`to_regclass` לבדיקות דפנסיביות – מתאים לשינויים בסכמה.

---

## 3. תלות ב-migrations קודמים

| Migration | נדרש ל-085? | הסבר |
|-----------|-------------|------|
| **082** | **כן** | יוצר את `auditor_subscription_charges`, `documents` linkage, והפונקציה עם 2 פרמטרים. 085 מוסיף overload עם 3 פרמטרים. |
| 081 | כן (דרך 082) | `auditor_subscription_charges`, `auditor_plans` |
| 080 | כן | `auditor_leads` |
| 079 | כן | auditor schema |

**מסקנה:** אם 082 רץ בהצלחה, **מספיק להריץ רק 085**. אין צורך להריץ migrations נוספים לפניו.

---

## 4. פקודת הרצה לפרודקשן

```bash
cd /Users/uxellent/v0-system-owner-admin-panel
psql "$DATABASE_URL" -f scripts/085-auditor-en-invoice-no-vat.sql
```

**לפני ההרצה:** וודא ש-`DATABASE_URL` מצביע על DB הפרודקשן.

---

## 5. SQL Verify – אחרי התיקון

```sql
-- Verify: function exists with 3-param signature (uuid, uuid, boolean)
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  oidvectortypes(p.proargtypes) AS arg_types
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'issue_auditor_charge_invoice_receipt_service'
ORDER BY p.oid;
```

**תוצאה צפויה:** לפחות שורה אחת עם `arg_types = 'uuid,uuid,bool'` (או `uuid,uuid,boolean`).

---

## 6. SQL Test – בדיקה בטוחה בלי חיוב

```sql
-- Safe test: call with invalid UUIDs → fails fast with 'missing_params'
-- No document is created; transaction rolls back
SELECT * FROM public.issue_auditor_charge_invoice_receipt_service(
  '00000000-0000-0000-0000-000000000000'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  false
);
```

**התנהגות:** אם ה-charge לא קיים, הפונקציה מחזירה `(false, null, null)` – לא exception.  
לבדיקה שהפונקציה נרשמה ב-schema בלי לקרוא לה:

```sql
-- Schema-only check (no RPC call)
SELECT proname, oidvectortypes(proargtypes)
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND proname = 'issue_auditor_charge_invoice_receipt_service'
  AND oidvectortypes(proargtypes) = 'uuid,uuid,bool';
```

אם יש תוצאה – הפונקציה קיימת עם החתימה הנכונה.

---

## 7. בדיקת כל הקריאות – חתימה

| קובץ | פרמטרים | תואם? |
|------|----------|-------|
| `lib/auditor/billing/process-indicator-event.ts` | `p_auditor_charge_id`, `p_issuer_company_id`, `p_is_en` | ✓ 3 params |
| `app/api/auditor/billing/renewals/run/route.ts` | `p_auditor_charge_id`, `p_issuer_company_id` | ✓ 2 params → overload מ-082 |
| `app/api/admin/auditor/repair-missing-invoices/route.ts` | `p_auditor_charge_id`, `p_issuer_company_id` | ✓ 2 params → overload מ-082 |

**מסקנה:** אין mismatch. אחרי 085:
- קריאות עם 3 פרמטרים → פונקציה `(uuid, uuid, boolean)` מ-085
- קריאות עם 2 פרמטרים → פונקציה `(uuid, uuid)` מ-082 (נשארת)

---

## 8. Fallback (רק אם 085 נכשל)

**אין צורך ב-fallback** – הרצת 085 היא הפתרון הנכון.

אם מסיבה כלשהי אי אפשר להריץ 085:
- **אופציה א:** rollback זמני בקוד – להסיר `p_is_en` מ-`process-indicator-event.ts` ולקרוא עם 2 params (EN יקבל invoice_receipt עם מע״מ במקום tax_invoice).
- **אופציה ב:** wrapper SQL – פונקציה עם 2 params שקוראת ל-3 params עם `p_is_en := false` – מיותר כי 082 כבר מספקת את זה.

---

## 9. סיכונים לפני הרצה

| סיכון | הסבר | חומרה |
|-------|------|-------|
| 082 לא רץ | טבלאות `auditor_subscription_charges` וכו' לא קיימות | גבוה – 085 ייכשל |
| `document_sequences` חסר | הסקריפט מטפל ב-`to_regclass` ו-fallback | נמוך |
| הרשאות | הפונקציה מוגבלת ל-`service_role` | נמוך |
| Lock | הסקריפט משתמש ב-`pg_advisory_xact_lock` – אין lock ארוך | נמוך |

**המלצה:** לפני הרצה, וודא ש-082 רץ:
```sql
SELECT 1 FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'issue_auditor_charge_invoice_receipt_service'
  AND oidvectortypes(p.proargtypes) = 'uuid,uuid';
```

אם יש תוצאה – 082 רץ, אפשר להריץ 085.

---

## 10. סיכום

| פריט | ערך |
|------|-----|
| **Root cause** | migration 085 לא הורצה; חסרה פונקציה עם 3 פרמטרים |
| **האם מספיק 085 בלבד?** | כן, אם 082 כבר רץ |
| **פקודה** | `psql "$DATABASE_URL" -f scripts/085-auditor-en-invoice-no-vat.sql` |
| **SQL verify** | ראה סעיף 5 |
| **סיכונים** | נמוכים; וודא ש-082 רץ לפני 085 |

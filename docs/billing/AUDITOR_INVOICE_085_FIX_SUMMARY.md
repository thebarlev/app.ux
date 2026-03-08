# תיקון שגיאת `issue_auditor_charge_invoice_receipt_service` – סיכום

## 1. Root Cause

**השגיאה:** `Could not find the function public.issue_auditor_charge_invoice_receipt_service(p_auditor_charge_id, p_is_en, p_issuer_company_id) in the schema cache`

**סיבה:** הקוד ב-`process-indicator-event.ts` קורא לפונקציה עם **3 פרמטרים** (`p_auditor_charge_id`, `p_issuer_company_id`, `p_is_en`), אך ב-DB קיימת רק הגרסה מ-migration **082** עם **2 פרמטרים**.

**מסקנה:** Migration **085** לא הורצה על ה-DB. חסרה הפונקציה עם החתימה `(uuid, uuid, boolean)`.

---

## 2. איזה migration יוצר את הפונקציה

| פריט | ערך |
|------|-----|
| **קובץ** | `scripts/085-auditor-en-invoice-no-vat.sql` |
| **מספר** | 085 |
| **תיאור** | EN flow: auditor charge → tax_invoice (no VAT) |

### ה-SQL שמגדיר את הפונקציה (שורות 17–21):

```sql
create or replace function public.issue_auditor_charge_invoice_receipt_service(
  p_auditor_charge_id uuid,
  p_issuer_company_id uuid,
  p_is_en boolean default false
)
returns table (ok boolean, document_id uuid, document_number text)
```

---

## 3. האם ה-migration רץ או לא

**לא.** אם השגיאה מופיעה – הפונקציה עם 3 פרמטרים אינה קיימת ב-DB, ולכן 085 לא הורצה.

---

## 4. הפקודה המדויקת להריץ כדי לתקן

```bash
psql "$DATABASE_URL" -f scripts/085-auditor-en-invoice-no-vat.sql
```

**לפני ההרצה:** וודא ש-`DATABASE_URL` מצביע על ה-DB הנכון (פרודקשן/סטייג'ינג).

**אלטרנטיבה** (אם `DATABASE_URL` לא מוגדר):

```bash
psql "postgresql://user:pass@host:5432/dbname" -f scripts/085-auditor-en-invoice-no-vat.sql
```

---

## 5. האם יש mismatch בחתימת הפונקציה

**לא.** החתימה תואמת:

| מקור | חתימה | תואם? |
|------|--------|-------|
| **085 SQL** | `(p_auditor_charge_id uuid, p_issuer_company_id uuid, p_is_en boolean)` | ✓ |
| **process-indicator-event.ts** | `{ p_auditor_charge_id, p_issuer_company_id, p_is_en }` | ✓ |
| **renewals/run** | `{ p_auditor_charge_id, p_issuer_company_id }` | ✓ (2 params → overload מ-082) |
| **repair-missing-invoices** | `{ p_auditor_charge_id, p_issuer_company_id }` | ✓ (2 params → overload מ-082) |

אחרי הרצת 085:
- קריאות עם 3 פרמטרים → פונקציה `(uuid, uuid, boolean)` מ-085
- קריאות עם 2 פרמטרים → פונקציה `(uuid, uuid)` מ-082 (נשארת)

---

## 6. תלות ב-migrations קודמים

| Migration | נדרש? | הסבר |
|-----------|--------|------|
| **082** | **כן** | יוצר את `auditor_subscription_charges` והפונקציה עם 2 פרמטרים |
| 081 | כן (דרך 082) | `auditor_subscription_charges`, `auditor_plans` |
| 079–080 | כן | auditor schema |

**בדיקה לפני הרצה** – וודא ש-082 רץ:

```sql
SELECT 1 FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'issue_auditor_charge_invoice_receipt_service'
  AND oidvectortypes(p.proargtypes) = 'uuid,uuid';
```

אם יש תוצאה – 082 רץ, אפשר להריץ 085.

---

## 7. אימות אחרי התיקון

```sql
SELECT proname, oidvectortypes(proargtypes)
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND proname = 'issue_auditor_charge_invoice_receipt_service'
ORDER BY proname, proargtypes;
```

**תוצאה צפויה:** שתי שורות:
- `uuid,uuid` (מ-082)
- `uuid,uuid,bool` (מ-085)

---

## 8. מיגרציות נוספות שתלויות בפונקציה

| קובץ | תלות |
|------|------|
| `scripts/084-auditor-invoice-receipt-finalize-drafts.sql` | מזכיר את הפונקציה בתיעוד – לא תלות טכנית |
| `app/api/auditor/billing/process-pending/route.ts` | מזכיר script 085 – לא קורא ל-RPC ישירות |

אין triggers או RPC calls נוספים שתלויים בפונקציה.

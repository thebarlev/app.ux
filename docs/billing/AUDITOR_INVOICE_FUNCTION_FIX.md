# Root Cause: `issue_auditor_charge_invoice_receipt_service` not found

## 1. Root Cause

**הפונקציה לא קיימת ב-DB כי migration 085 לא הורצה.**

הקוד קורא לפונקציה עם 3 פרמטרים: `(p_auditor_charge_id, p_issuer_company_id, p_is_en)`  
ב-DB קיימת רק הגרסה מ-082 עם 2 פרמטרים: `(p_auditor_charge_id, p_issuer_company_id)`  
PostgreSQL מחפש פונקציה עם 3 פרמטרים ולא מוצא → "Could not find the function in the schema cache"

---

## 2. Migration שיוצר את הפונקציה

| שדה | ערך |
|-----|-----|
| **קובץ** | `scripts/085-auditor-en-invoice-no-vat.sql` |
| **פרויקט** | v0-system-owner-admin-panel |

### חתימת הפונקציה ב-085

```sql
create or replace function public.issue_auditor_charge_invoice_receipt_service(
  p_auditor_charge_id uuid,
  p_issuer_company_id uuid,
  p_is_en boolean default false
)
returns table (ok boolean, document_id uuid, document_number text)
```

---

## 3. האם המיגרציה רצה?

**לא.** אם הייתה רצה, הפונקציה הייתה קיימת ב-DB.

---

## 4. הפקודה המדויקת לתיקון

```bash
cd /Users/uxellent/v0-system-owner-admin-panel
psql "$DATABASE_URL" -f scripts/085-auditor-en-invoice-no-vat.sql
```

או דרך Supabase SQL Editor:
1. פתח את Supabase Dashboard → SQL Editor
2. העתק את תוכן `scripts/085-auditor-en-invoice-no-vat.sql`
3. הרץ את ה-SQL

---

## 5. Mismatch בחתימה?

**אין mismatch.** הקוד והמיגרציה תואמים.

---

## 6. איפה קוראים לפונקציה

| קובץ | שימוש |
|------|-------|
| `lib/auditor/billing/process-indicator-event.ts` | לאחר תשלום – יצירת חשבונית (עם p_is_en) |
| `app/api/auditor/billing/renewals/run/route.ts` | חידוש מנויים – יצירת חשבונית (בלי p_is_en) |

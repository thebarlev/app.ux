# הגדרת חשבונות ללא מגבלת מסמכים חודשית

## סקירה

המערכת מאפשרת להגדיר חשבונות (בעלים) ללא מגבלת מסמכים חודשית. המגבלה **חודשית** (לא שנתית) – `documents_per_month` / `plan_snapshot_documents_limit`.

## איפה להגדיר

### 1. משתני סביבה (`.env.local`)

```env
# אימיילים ללא מגבלה (מופרד בפסיקים)
UNLIMITED_DOCUMENT_EMAILS=support@uxellent.com

# חברות ללא מגבלה (UUID מופרד בפסיקים)
UNLIMITED_DOCUMENT_COMPANY_IDS=4ae68334-15a0-4fa3-a9ba-fd77deccc95d
```

ברירת מחדל: `support@uxellent.com` ו־`4ae68334-15a0-4fa3-a9ba-fd77deccc95d`.

### 2. מסד נתונים – טבלת `unlimited_document_companies`

להוספת חברה נוספת ללא מגבלה (Supabase SQL Editor):

```sql
INSERT INTO public.unlimited_document_companies (company_id)
VALUES ('your-company-uuid-here')
ON CONFLICT (company_id) DO NOTHING;
```

רק `system_admins` יכולים להוסיף/להסיר שורות בטבלה זו.

### 3. טבלת `system_admins`

משתמשים ב־`system_admins` (למשל `support@uxellent.com`) מקבלים פטור אוטומטי – גם בלי שורת מנוי.

```sql
-- הרץ scripts/092-add-support-vow-system-admin.sql
```

## איפה הקוד משתמש בהגדרות

| קובץ | שימוש |
|------|------|
| `lib/subscription-unlimited.ts` | קונפיגורציה מרכזית |
| `lib/documents/actions.ts` | `precheckSubscriptionEligibility` – לפני finalize |
| `app/api/subscription/status/route.ts` | API סטטוס מנוי (כרטיס "מנוי ושימוש חודשי") |
| `scripts/091-vow-bypass-no-subscription.sql` | RPC `finalize_document_with_period_guard` – טבלת `unlimited_document_companies` + `system_admins` |

## מגבלה חודשית (לא שנתית)

- הספירה נעשית לפי **חודש קלנדרי** (או חודש anniversary למנוי בתשלום)
- `plan_snapshot_documents_limit` = מגבלה **לחודש**
- חשבונות ללא מגבלה מקבלים `documents_limit = 1,000,000` (בפועל ללא הגבלה)

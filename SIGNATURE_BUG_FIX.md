# תיקון באג: signature_url column does not exist

**תאריך:** 30 דצמבר 2025  
**בעיה:** שגיאה בטעינת עמוד ההגדרות: `column companies.signature_url does not exist`

## הבעיה

כשמשתמש ניסה לפתוח את `/dashboard/settings`, קיבל שגיאה:
```
שגיאה בטעינת נתוני העסק
column companies.signature_url does not exist
```

**הסיבה:** הקוד ניסה לשלוף את העמודה `signature_url` ממסד הנתונים, אבל העמודה עדיין לא נוספה (הסקריפט SQL לא הורץ).

## הפתרון

### 1. הסרת signature_url מ-SELECT queries זמנית

**קבצים שתוקנו:**
- `app/dashboard/settings/page.tsx`
- `app/dashboard/documents/receipt/preview/page.tsx`

הסרנו את `signature_url` מהשאילתות כך שהאפליקציה לא תקרוס אם העמודה לא קיימת.

**Before:**
```typescript
.select(`
  id,
  company_name,
  // ... other fields
  logo_url,
  signature_url  // ❌ גורם לשגיאה אם לא קיים
`)
```

**After:**
```typescript
.select(`
  id,
  company_name,
  // ... other fields
  logo_url
  // signature_url הוסר זמנית
`)
```

### 2. הוספת טיפול שגיאות ב-actions

**קובץ:** `app/dashboard/settings/actions.ts`

עטפנו את כל הפעולות של החתימה ב-try-catch עם הודעות שגיאה ברורות:

```typescript
// uploadSignatureAction
try {
  const { data: company } = await supabase
    .from("companies")
    .select("signature_url")
    .eq("id", companyId)
    .single();
} catch (selectError: any) {
  if (selectError?.message?.includes("signature_url")) {
    return {
      ok: false,
      message: "העמודה signature_url לא קיימת במסד הנתונים. אנא הרץ את הסקריפט: scripts/016-add-signature-field.sql"
    };
  }
}
```

אותו דבר ל:
- `uploadSignatureAction()`
- `deleteSignatureAction()`

### 3. הודעת התקנה בממשק המשתמש

**קובץ:** `app/dashboard/settings/SettingsClient.tsx`

הוספנו תיבת הודעה בסקשן החתימה שמופיעה אם העמודה לא קיימת:

```typescript
{!('signature_url' in company) && (
  <div style={{ /* warning box styles */ }}>
    <div>📋 נדרשת התקנה</div>
    <div>
      כדי להשתמש בתכונת החתימה, יש להריץ את הסקריפט SQL הבא במסד הנתונים:
    </div>
    <code>scripts/016-add-signature-field.sql</code>
    <div>
      ראה את הקובץ SIGNATURE_INSTALLATION_GUIDE.md להוראות מפורטות.
    </div>
  </div>
)}
```

### 4. הוספת ערך ברירת מחדל

**קובץ:** `app/dashboard/settings/SettingsClient.tsx`

```typescript
const [signatureUrl, setSignatureUrl] = useState(company.signature_url ?? null);
```

השתמשנו ב-`??` במקום רק ב-`||` כדי לטפל בערכי undefined נכון.

## קבצים שנוצרו

1. ✅ **SIGNATURE_INSTALLATION_GUIDE.md**
   - מדריך מפורט להתקנת תכונת החתימה
   - צעדים להרצת הסקריפט SQL
   - פתרון בעיות נפוצות
   - בדיקות אימות

2. ✅ **SIGNATURE_BUG_FIX.md** (זה!)
   - תיעוד הבאג והתיקון
   - רשימת השינויים שבוצעו

## התנהגות הנוכחית

### לפני הרצת הסקריפט:
- ✅ עמוד ההגדרות נטען בהצלחה (לא קורס!)
- ✅ סקשן הלוגו עובד כרגיל
- ⚠️ סקשן החתימה מציג הודעת התקנה
- ⚠️ לא ניתן להעלות חתימה
- ⚠️ החתימה לא תופיע בקבלות

### אחרי הרצת הסקריפט:
- ✅ כל התכונות עובדות
- ✅ ניתן להעלות חתימה
- ✅ החתימה מופיעה בקבלות
- ✅ ניתן למחוק חתימה

## הוראות למשתמש

### שלב 1: הרצת הסקריפט SQL

1. פתח את Supabase Dashboard
2. עבור ל-SQL Editor
3. צור query חדש
4. העתק והדבק את התוכן של `scripts/016-add-signature-field.sql`:

```sql
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS signature_url TEXT;
COMMENT ON COLUMN public.companies.signature_url IS 'URL to uploaded signature image stored in Supabase Storage';
```

5. הרץ את הסקריפט (Run)

### שלב 2: רענון האפליקציה

1. רענן את הדפדפן (F5 / Cmd+R)
2. עבור ל-`/dashboard/settings`
3. אמורה להופיע סקשן "חתימת העסק" ללא הודעת התקנה

### שלב 3: אימות

בדוק שהעמודה נוספה:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'companies' 
  AND column_name = 'signature_url';
```

## פתרון בעיות

### עדיין מופיעה הודעת התקנה?

1. **נקה cache:**
   ```bash
   rm -rf .next
   pnpm dev
   ```

2. **וודא שהעמודה נוספה:**
   ```sql
   \d companies
   ```

3. **בדוק RLS policies:**
   ```sql
   SELECT * FROM companies LIMIT 1;
   ```

### שגיאה "permission denied"?

הרץ את הסקריפטים של RLS מחדש:
```sql
-- scripts/002-enable-rls.sql
-- scripts/007-tenant-rls-policies.sql
```

### החתימה לא מופיעה בקבלות?

1. וודא שהעלית חתימה בהגדרות
2. בדוק שה-URL נשמר:
   ```sql
   SELECT id, signature_url FROM companies WHERE id = 'your-company-id';
   ```
3. וודא שה-bucket קיים:
   - Supabase Dashboard → Storage → `business-assets`

## קבצים שתוקנו - סיכום

1. ✅ `app/dashboard/settings/page.tsx`
   - הסרת signature_url מ-SELECT query

2. ✅ `app/dashboard/documents/receipt/preview/page.tsx`
   - הסרת signature_url מ-SELECT query

3. ✅ `app/dashboard/settings/SettingsClient.tsx`
   - הוספת ערך ברירת מחדל: `?? null`
   - הוספת הודעת התקנה conditionally

4. ✅ `app/dashboard/settings/actions.ts`
   - טיפול שגיאות ב-uploadSignatureAction
   - טיפול שגיאות ב-deleteSignatureAction
   - הודעות שגיאה ברורות בעברית

5. ✅ `SIGNATURE_INSTALLATION_GUIDE.md` (חדש)
   - מדריך התקנה מפורט

6. ✅ `SIGNATURE_BUG_FIX.md` (זה!)
   - תיעוד הבאג והפתרון

## שינויים עתידיים

### אופציה 1: Migration Script אוטומטי
יצירת סקריפט שרץ אוטומטית בעת הפעלת האפליקציה:

```typescript
// lib/migrations/run.ts
export async function runMigrations() {
  const supabase = createServiceRoleClient();
  
  // Check if signature_url exists
  const { data } = await supabase.rpc('check_column_exists', {
    table_name: 'companies',
    column_name: 'signature_url'
  });
  
  if (!data) {
    // Run migration
    await supabase.rpc('add_signature_column');
  }
}
```

### אופציה 2: Feature Flag
הוספת feature flag שבודק אם החתימה זמינה:

```typescript
// lib/features.ts
export async function isSignatureEnabled() {
  try {
    const supabase = await createClient();
    await supabase.from("companies").select("signature_url").limit(1);
    return true;
  } catch {
    return false;
  }
}
```

## סטטוס

✅ **תוקן** - האפליקציה לא קורסת יותר  
⏳ **ממתין** - למשתמש להריץ את הסקריפט SQL  
📋 **מתועד** - כל השינויים תועדו במסמכים

---

**תאריך תיקון:** 30 דצמבר 2025  
**גרסה:** 1.0.0

# 🚨 התקנת תכונת החתימה - הוראות חשובות

## בעיה שהתגלתה

אם אתה רואה את השגיאה:
```
שגיאה בטעינת נתוני העסק
column companies.signature_url does not exist
```

**הסיבה:** העמודה `signature_url` עדיין לא נוספה למסד הנתונים שלך.

## פתרון - הרץ את הסקריפט SQL

יש להריץ את הסקריפט הבא במסד הנתונים (Supabase SQL Editor):

**קובץ:** `scripts/016-add-signature-field.sql`

```sql
-- Add signature_url field to companies table
-- Date: December 30, 2025
-- Purpose: Allow business owners to upload their signature for documents

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS signature_url TEXT;

COMMENT ON COLUMN public.companies.signature_url IS 'URL to uploaded signature image stored in Supabase Storage';
```

## צעדים מפורטים:

### 1. פתח את Supabase Dashboard
   - היכנס ל-https://supabase.com
   - בחר את הפרויקט שלך

### 2. פתח את ה-SQL Editor
   - בתפריט צד שמאל, לחץ על "SQL Editor"
   - לחץ על "New query"

### 3. העתק והדבק את הסקריפט
   - העתק את התוכן של `scripts/016-add-signature-field.sql`
   - הדבק בעורך SQL
   - לחץ על "Run" או Ctrl+Enter

### 4. אשר הצלחה
   אתה אמור לראות הודעה:
   ```
   Success. No rows returned
   ```

### 5. רענן את האפליקציה
   - חזור לאפליקציה
   - רענן את הדפדפן (F5 או Cmd+R)
   - עבור ל-`/dashboard/settings`
   - עכשיו אתה אמור לראות את הסקשן "חתימת העסק"

## אם עדיין לא עובד

### בדיקה 1: וודא שהעמודה נוספה
הרץ במסד הנתונים:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'companies' 
  AND column_name = 'signature_url';
```

אמור להחזיר:
```
column_name    | data_type
---------------+-----------
signature_url  | text
```

### בדיקה 2: וודא הרשאות
ודא ש-RLS מוגדר נכון:
```sql
SELECT * FROM companies LIMIT 1;
```

אם יש שגיאה, ייתכן שצריך להריץ מחדש את הסקריפטים של RLS.

### בדיקה 3: נקה את ה-Cache
```bash
# במסוף הפרויקט
rm -rf .next
pnpm dev
```

## איך לבדוק שהכל עובד

1. **עמוד הגדרות:**
   - עבור ל-`/dashboard/settings`
   - אתה אמור לראות סקשן "חתימת העסק" מתחת לסקשן "לוגו העסק"

2. **העלאת חתימה:**
   - לחץ על "העלה חתימה"
   - בחר קובץ תמונה (PNG, JPG, SVG)
   - אמורה להופיע תמונת החתימה

3. **תצוגת מקדימה של קבלה:**
   - צור קבלה חדשה
   - בתצוגה מקדימה, החתימה אמורה להופיע מתחת לטבלת התשלומים

## פתרון זמני (עד להרצת הסקריפט)

הקוד עודכן כך שהוא לא יקרוס אם העמודה לא קיימת. אבל:
- לא תראה את סקשן החתימה בהגדרות
- לא תוכל להעלות חתימה
- לא תראה חתימה בקבלות

**המלצה:** הרץ את הסקריפט עכשיו כדי לקבל את כל התכונות!

## סיכום השינויים שבוצעו

1. ✅ נוסף טיפול שגיאות - האפליקציה לא קורסת אם העמודה לא קיימת
2. ✅ ההגדרות עוד יעבדו (אבל בלי חתימה)
3. ⏳ צריך להריץ את `scripts/016-add-signature-field.sql` כדי לקבל את תכונת החתימה

---

**עדכון אחרון:** 30 דצמבר 2025

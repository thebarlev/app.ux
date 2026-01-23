# 🔧 מדריך פתרון בעיות: תבניות לא מתעדכנות

## 📋 סדר פעולות מדויק

### שלב 1: הרץ Migration ב-Supabase (קריטי!)

1. **פתח Supabase Dashboard** → SQL Editor
2. **העתק והרץ את הקוד הזה:**

```sql
-- Drop old policy
DROP POLICY IF EXISTS templates_update ON public.templates;

-- Create new comprehensive policy
CREATE POLICY templates_update ON public.templates
  FOR UPDATE
  USING (
    -- CASE 1: Admin updating global template (full access to HTML/CSS)
    (
      company_id IS NULL 
      AND EXISTS (
        SELECT 1 FROM public.system_admins
        WHERE auth_user_id = auth.uid()
      )
    )
    OR
    -- CASE 2: User updating company template (full access)
    (
      company_id IS NOT NULL
      AND company_id IN (SELECT public.user_company_ids())
    )
    OR
    -- CASE 3: User setting is_default on global template
    (
      company_id IS NULL
      AND auth.uid() IS NOT NULL
    )
  )
  WITH CHECK (
    (
      company_id IS NULL 
      AND EXISTS (
        SELECT 1 FROM public.system_admins
        WHERE auth_user_id = auth.uid()
      )
    )
    OR
    (
      company_id IS NOT NULL
      AND company_id IN (SELECT public.user_company_ids())
    )
    OR
    (
      company_id IS NULL
      AND auth.uid() IS NOT NULL
    )
  );
```

**Expected Output:**
```
DROP POLICY
CREATE POLICY
```

---

### שלב 2: בדוק מצב נוכחי

```sql
-- הצג את כל התבניות
SELECT 
  id,
  name,
  document_type,
  company_id,
  is_default,
  is_active
FROM templates
WHERE document_type = 'receipt' AND is_active = TRUE
ORDER BY company_id NULLS FIRST, is_default DESC;
```

**מה לחפש:**
- ✅ אמורה להיות **רק תבנית אחת** עם `is_default = TRUE` לכל document_type
- ❌ אם יש **יותר מאחת** → באג! קפוץ לשלב 3
- ❌ אם **אף אחת לא TRUE** → המשתמש לא הצליח לבחור

---

### שלב 3: נקה Duplicates (אם נמצאו)

```sql
-- מצא duplicates
SELECT 
  document_type,
  company_id,
  COUNT(*) as count,
  STRING_AGG(name, ', ') as templates
FROM templates
WHERE is_default = TRUE AND is_active = TRUE
GROUP BY document_type, company_id
HAVING COUNT(*) > 1;
```

**אם רואה שורות (יש duplicates):**

```sql
-- נקה הכל
UPDATE templates 
SET is_default = FALSE 
WHERE document_type = 'receipt';

-- הגדר רק את זו שאתה רוצה
UPDATE templates 
SET is_default = TRUE 
WHERE name = 'תבנית קלאסית'  -- ⚠️ שנה לשם שאתה רוצה
  AND company_id IS NULL 
  AND document_type = 'receipt';

-- ודא שזה עבד
SELECT name, is_default 
FROM templates 
WHERE document_type = 'receipt' AND company_id IS NULL;
```

---

### שלב 4: הרץ את האפליקציה ב-Dev Mode

```bash
pnpm dev
```

**שמור את ה-terminal פתוח** - תראה logs!

---

### שלב 5: בדוק בדפדפן

1. **פתח Browser DevTools:**
   - Chrome/Edge: `F12` או `Cmd+Option+I`
   - **לך ל-Tab "Console"**

2. **לך ל-`http://localhost:3000/dashboard/settings`**

3. **לחץ על תבנית אחרת** (לא זו שכבר ירוקה)

4. **צפה ב-Console Logs:**

**Expected Logs (Success):**
```javascript
🔵 [SimpleTemplateSelector] User clicked template: {
  templateName: "תבנית מודרנית",
  currentDefault: false,
  newDefault: true
}

🔵 [SimpleTemplateSelector] Calling API /api/templates/set-default...

🟢 [API /set-default] Received request
🟢 [API /set-default] User: test20@gmail.com
🟢 [API /set-default] Template found: {
  name: "תבנית מודרנית",
  documentType: "receipt",
  companyId: "global"
}
🟢 [API /set-default] Unsetting other defaults...
🟢 [API /set-default] Unset global templates: ["תבנית קלאסית"]
✅ [API /set-default] Successfully updated template: {
  name: "תבנית מודרנית",
  is_default: true
}

🔵 [SimpleTemplateSelector] API Response: {status: 200, result: {ok: true}}
🔵 [SimpleTemplateSelector] Reloading templates...
🔵 [SimpleTemplateSelector] Loaded templates: [
  {name: "תבנית מודרנית", is_default: true},  ← זו שבחרת!
  {name: "תבנית קלאסית", is_default: false}
]
```

**Error Logs (Failure):**
```javascript
❌ [API /set-default] Error unsetting global defaults: {
  code: "42501",
  message: "new row violates row-level security policy"
}
❌ [API /set-default] This likely means RLS policy is blocking!
```

**אם רואה שגיאת RLS:**
→ **חזור לשלב 1** - ה-migration לא רץ נכון!

---

### שלב 6: ודא שזה נשמר ב-DB

**חזור ל-Supabase SQL Editor:**

```sql
SELECT name, is_default, updated_at
FROM templates
WHERE document_type = 'receipt' AND company_id IS NULL
ORDER BY updated_at DESC;
```

**Expected:**
```
name              | is_default | updated_at
------------------|------------|------------------------
תבנית מודרנית    | TRUE       | 2026-01-01 15:30:45  ← זו שבחרת!
תבנית קלאסית     | FALSE      | 2026-01-01 15:30:45
```

**⚠️ אם is_default עדיין FALSE:**
→ ה-UPDATE נכשל! בדוק logs בשלב 5

---

### שלב 7: בדוק PDF

1. **לך ל-`http://localhost:3000/dashboard/documents/receipt`**
2. **צור קבלה חדשה:**
   - לקוח: כלשהו
   - סכום: 100
3. **לחץ "שמור"**
4. **הורד PDF**

**בדוק ב-Terminal Logs:**

```bash
✅ Using global default template: תבנית מודרנית (uuid-here)
```

**אם רואה:**
```bash
⚠️ Using hardcoded fallback template for receipt
```
→ **הבעיה:** is_default לא מתעדכן! חזור לשלב 2

---

### שלב 8: אם עדיין לא עובד - Debug מעמיק

**בדוק Supabase Logs:**

1. **Supabase Dashboard** → Logs → API Logs
2. **סנן:** `POST /rest/v1/templates`
3. **חפש:** Status 403 או 500

**שגיאות נפוצות:**

| שגיאה | פירוש | פתרון |
|-------|--------|--------|
| `42501 - row-level security policy` | RLS חוסם | הרץ שוב את Migration (שלב 1) |
| `23505 - duplicate key` | יש duplicates | נקה duplicates (שלב 3) |
| `23503 - foreign key` | בעיית קשרים | בדוק company_id תקין |

---

## 🎯 Checklist סופי

לפני שתקבע "זה עובד":

- [ ] Migration רץ ב-Supabase (שלב 1)
- [ ] אין duplicates ב-DB (שלב 3)
- [ ] Console logs מראים success (שלב 5)
- [ ] DB מראה is_default = TRUE (שלב 6)
- [ ] PDF משתמש בתבנית הנכונה (שלב 7)

---

## 🆘 אם כלום לא עוזר

הרץ את זה ב-Supabase (nuclear option):

```sql
-- 1. מחק את כל ה-defaults
UPDATE templates SET is_default = FALSE;

-- 2. הגדר ידנית את התבנית שאתה רוצה
UPDATE templates 
SET is_default = TRUE 
WHERE name = 'תבנית קלאסית' 
  AND company_id IS NULL 
  AND document_type = 'receipt';

-- 3. ודא
SELECT name, is_default FROM templates WHERE document_type = 'receipt';

-- 4. צור PDF חדש ובדוק
```

---

## 📊 איך לדעת מה הבעיה

| תסמין | גורם סביר | פתרון |
|-------|-----------|--------|
| העיגול חוזר לאפור | RLS חוסם UPDATE | שלב 1 |
| Console: `Error unsetting global defaults` | RLS חוסם UPDATE | שלב 1 |
| DB מראה 2 templates עם is_default=TRUE | Duplicates | שלב 3 |
| PDF משתמש בתבנית ישנה | is_default לא TRUE | שלב 6 |
| Console: `Status 403` | אין הרשאות | שלב 1 |

---

## ✅ Success Indicator

**כשהכל עובד תראה:**

1. **Browser Console:**
   ```
   ✅ Successfully updated template
   ```

2. **Terminal (pnpm dev):**
   ```
   ✅ Using global default template: תבנית מודרנית
   ```

3. **Supabase DB:**
   ```sql
   is_default = TRUE  -- רק לתבנית שבחרת
   ```

4. **PDF:**
   - העיצוב תואם לתבנית שבחרת
   - לא התבנית ההקודדת הישנה

**כשכל 4 מתקיימים → הבעיה נפתרה! 🎉**

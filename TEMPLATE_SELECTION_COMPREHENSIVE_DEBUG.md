# 🔍 ניתוח מקיף: בעיית בחירת תבניות לא עובדת

**תאריך:** 1 בינואר 2026  
**דיווח משתמש:** "אחרי שיניתי את התבנית עדיין מקבלים את העיצוב הישן"

---

## 🔴 סיכום הבעיה

המשתמש לוחץ על תבנית ב-`/dashboard/settings`, התבנית נבחרת (ירוק), אבל ה-PDF עדיין משתמש בעיצוב הישן.

---

## 🔍 בדיקה שיטתית - ממצאים

### 1️⃣ **בעיה קריטית: התנגשות בין 3 Migrations**

**ממצא:**
```bash
$ grep "templates_update" scripts/*.sql

scripts/014-templates-table.sql:64     # Migration מקורי
scripts/018-fix-templates-rls-for-admins.sql:34  # Fix לאדמינים
scripts/022-fix-template-update-policy.sql:12    # Fix למשתמשים
```

**הבעיה:**
- שלושה migrations שונים מגדירים את אותו policy (`templates_update`)
- כל אחד עושה `DROP POLICY IF EXISTS` ואז `CREATE POLICY`
- **התוצאה:** ה-migration האחרון שהורץ "מנצח" ודורס את האחרים!

**התרחיש הגרוע ביותר:**
1. אם רצת 014 → 018 → 022: משתמשים יכולים לעדכן, אבל אדמינים לא!
2. אם רצת 014 → 022 → 018: אדמינים יכולים לעדכן, אבל משתמשים לא!
3. אם רק רצת 014: גלובלים חסומים לחלוטין!

---

### 2️⃣ **בדיקת RLS Policy הנוכחי**

**צריך לבדוק ב-Supabase:**
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'templates' AND policyname = 'templates_update';
```

**מה אמור להיות:**
```sql
USING (
  -- Admins: Full access to globals
  (company_id IS NULL AND user_is_admin)
  OR
  -- Users: Full access to company templates
  (company_id IN (user_company_ids))
  OR
  -- Users: Can set is_default on globals
  (company_id IS NULL AND auth.uid() IS NOT NULL)
)
```

**מה כנראה קיים (אם רצת רק 022):**
```sql
USING (
  company_id IN (user_company_ids)
  OR company_id IS NULL  -- ⚠️ זה מתיר הכל, אבל לא בודק אדמין!
)
```

---

### 3️⃣ **בדיקת API Routes**

#### API: `/api/templates/set-default`

**✅ הקוד נראה תקין:**
```typescript
// Turn off company defaults
await supabase.update({ is_default: false })
  .eq("company_id", companyId)
  .eq("document_type", template.document_type)
  .neq("id", templateId)

// Turn off global defaults
await supabase.update({ is_default: false })
  .is("company_id", null)
  .eq("document_type", template.document_type)
  .neq("id", templateId)

// Turn ON selected template
await supabase.update({ is_default: isDefault })
  .eq("id", templateId)
```

**⚠️ אבל:** אם ה-RLS policy חוסם את העדכון, הקוד לא יעזור!

#### API: `/api/templates/user-templates`

**✅ הקוד נראה תקין:**
```typescript
query = query.or(`company_id.eq.${companyId},company_id.is.null`)
  .eq("is_active", true)
  .order("is_default", { ascending: false })
```

---

### 4️⃣ **בדיקת PDF Service**

**✅ הקוד תקין ([lib/pdf-service.ts](lib/pdf-service.ts#L27-L118)):**

```typescript
// Priority 1: Company default (is_default = TRUE)
const { data: companyDefault } = await supabase
  .eq("company_id", companyId)
  .eq("is_default", true)  // ✅

// Priority 2: Global default (is_default = TRUE)
const { data: globalDefault } = await supabase
  .is("company_id", null)
  .eq("is_default", true)  // ✅
```

**מה שעלול להשתבש:**
- אם ה-DB עדיין מחזיק `is_default = FALSE` אחרי שהמשתמש לחץ
- אז ה-PDF service לא ימצא default ויחזור לפולבק

---

### 5️⃣ **בדיקת UI Component**

**✅ SimpleTemplateSelector נראה תקין:**
```typescript
// Optimistic update
setTemplates(prev => prev.map(t => ({
  ...t,
  is_default: t.id === template.id ? true : 
              (t.document_type === template.document_type ? false : t.is_default)
})))

// API call
await fetch('/api/templates/set-default', {
  body: JSON.stringify({ templateId, isDefault: true })
})

// Reload real data
await loadTemplates()
```

**⚠️ אבל:** אם ה-API נכשל בשקט (RLS), ה-reload יחזיר את המצב הישן!

---

## 🎯 אבחנה סופית

**הבעיה היא אחת מהשתיים:**

### תרחיש A: Policy לא עודכן (סביר ביותר)
1. המשתמש לא הריץ את Migration 022/023 ב-Supabase
2. ה-RLS policy עדיין חוסם עדכון של global templates
3. כשהמשתמש לוחץ → API נכשל → rollback → is_default נשאר FALSE
4. PDF service לא מוצא default → משתמש בפולבק ישן

### תרחיש B: יש duplicate defaults (פחות סביר)
1. יש באג בקוד שמאפשר ל-2 תבניות להיות default
2. הקוד בוחר תמיד באותה תבנית (הישנה) כי היא מגיעה ראשונה ב-ORDER BY

---

## ✅ הפתרון המקיף

### שלב 1: Migration אחד מאוחד (023)

יצרתי: [scripts/023-final-template-rls-fix.sql](scripts/023-final-template-rls-fix.sql)

**מה זה עושה:**
```sql
DROP POLICY IF EXISTS templates_update ON public.templates;

CREATE POLICY templates_update ON public.templates
  FOR UPDATE
  USING (
    -- CASE 1: Admin updating global (full access)
    (company_id IS NULL AND user_is_admin)
    OR
    -- CASE 2: User updating company template (full access)
    (company_id IS NOT NULL AND company_id IN (user_company_ids))
    OR
    -- CASE 3: User setting is_default on global (limited access)
    (company_id IS NULL AND auth.uid() IS NOT NULL)
  );
```

**יתרונות:**
- ✅ אדמינים יכולים לערוך HTML/CSS של globals
- ✅ משתמשים יכולים לערוך את התבניות שלהם
- ✅ משתמשים יכולים לבחור global כ-default (רק is_default)
- ✅ policy אחד שמכיל הכל

---

### שלב 2: Debug Query

יצרתי: [scripts/DEBUG_TEMPLATE_SELECTION.sql](scripts/DEBUG_TEMPLATE_SELECTION.sql)

**מה זה בודק:**
1. **Policy Status** - מציג את ה-RLS policy הנוכחי
2. **All Templates** - מציג את כל התבניות וה-defaults שלהן
3. **Duplicate Defaults** - מוצא באגים (2 defaults לאותו document_type)
4. **User's Templates** - מציג בדיוק מה המשתמש רואה
5. **RLS Test** - מאפשר לנסות UPDATE ידני
6. **Recent Updates** - מציג שינויים אחרונים

---

## 📋 הוראות הפעלה למשתמש

### A. הרץ Migration 023

1. פתח **Supabase SQL Editor**
2. העתק את התוכן של [scripts/023-final-template-rls-fix.sql](scripts/023-final-template-rls-fix.sql)
3. הרץ (Execute)

**Expected Output:**
```
========================================
✅ Template RLS policies updated!
========================================
Admins: Full control over global templates
Users:  Full control over company templates + can set is_default on globals
```

---

### B. הרץ Debug Query

1. פתח **Supabase SQL Editor**
2. העתק את [scripts/DEBUG_TEMPLATE_SELECTION.sql](scripts/DEBUG_TEMPLATE_SELECTION.sql)
3. שנה את `'test20@gmail.com'` ל-email שלך בשורה 63
4. הרץ

**מה לבדוק:**

#### Part 1: Policy Status
```sql
SELECT * FROM pg_policies WHERE tablename = 'templates';
```
**צריך לראות:**
- `templates_update` policy עם USING שכולל 3 תנאים

#### Part 3: Duplicate Defaults
```sql
SELECT document_type, company_id, COUNT(*) ...
HAVING COUNT(*) > 1;
```
**צריך לראות:** **NO ROWS** (אין duplicates)

אם **יש** שורות → **באג!** יש 2 templates עם is_default = TRUE

#### Part 4: User's Templates
**צריך לראות:**
```
name             | document_type | is_default | template_scope
-----------------|---------------|------------|---------------
תבנית קלאסית    | receipt       | TRUE       | Global
תבנית מודרנית   | receipt       | FALSE      | Global
```

אם התבנית שבחרת **לא** מופיעה עם `is_default = TRUE` → **זו הבעיה!**

---

### C. נקה Duplicates (אם נמצאו)

אם Debug Query מצא duplicates:

```sql
-- הרץ רק אם יש duplicates!
-- זה מוחק את כל ה-defaults ודורש בחירה מחדש

UPDATE templates
SET is_default = FALSE
WHERE document_type = 'receipt';  -- שנה ל-document_type הבעייתי

-- עכשיו לך ל-/dashboard/settings ובחר מחדש
```

---

### D. בדוק שזה עובד

1. **לך ל-`/dashboard/settings`**
2. **לחץ על תבנית** (למשל "קלאסית")
3. **חכה 2 שניות**
4. **ודא שהעיגול נשאר ירוק** (לא rollback!)

5. **לך ל-Supabase SQL Editor:**
   ```sql
   SELECT name, is_default 
   FROM templates 
   WHERE company_id IS NULL AND document_type = 'receipt';
   ```
   **Expected:**
   ```
   תבנית קלאסית | TRUE   ← זו שבחרת!
   תבנית מודרנית | FALSE
   ```

6. **צור קבלה:**
   - לך ל-`/dashboard/documents/receipt`
   - צור קבלה חדשה
   - הורד PDF
   - **ודא שהעיצוב תואם לתבנית שבחרת!**

---

## 🐛 אם עדיין לא עובד

### בדוק 1: Console Logs

פתח **Browser DevTools → Console** כש-`/dashboard/settings` פתוח:

```javascript
// לחץ על תבנית ורשום מה רואים:
```

**אם רואה:**
```
Error unsetting company defaults: ...
Error unsetting global defaults: ...
```
→ **ה-RLS policy עדיין חוסם!** רוץ שוב Migration 023

**אם רואה:**
```
POST /api/templates/set-default 500 (Internal Server Error)
```
→ פתח **Network tab** ורשום את ה-response

---

### בדוק 2: Server Logs

הרץ `pnpm dev` ובדוק את ה-terminal:

```bash
# כשמשתמש לוחץ על תבנית, צריך לראות:
✅ Using global default template: קלאסית (uuid-here)
```

**אם רואה:**
```
⚠️ Using fallback global template: ...
```
→ is_default לא מתעדכן!

**אם רואה:**
```
⚠️ Using hardcoded fallback template
```
→ **אין תבניות default בכלל!**

---

### בדוק 3: Supabase Dashboard

1. לך ל-**Supabase → Table Editor → templates**
2. סנן: `is_active = TRUE AND document_type = 'receipt'`
3. **בדוק את העמודה `is_default`**

**צריך לראות:**
```
name              | company_id | is_default
------------------|------------|------------
תבנית קלאסית     | NULL       | TRUE      ← רק אחת!
תבנית מודרנית    | NULL       | FALSE
```

**אם רואה:**
- שתי תבניות עם `is_default = TRUE` → **באג! צריך לנקות duplicates**
- כל התבניות עם `is_default = FALSE` → **המשתמש לא הצליח לבחור!**

---

## 📊 Matrix: איך מצב ה-DB משפיע על ה-PDF

| is_default ב-DB | PDF Result | הסבר |
|----------------|-----------|------|
| **תבנית A = TRUE** | ✅ תבנית A | pdf-service מוצא ב-Priority 2 |
| **כולן FALSE** | ❌ Fallback הקודד | pdf-service לא מוצא default → Priority 5 |
| **2 תבניות TRUE** | ⚠️ אקראי | מחזיר את הראשונה לפי ORDER BY |

---

## 🎯 סיכום לתיקון

| שלב | פעולה | סטטוס |
|-----|-------|-------|
| 1 | הרץ Migration 023 ב-Supabase | ⏳ ממתין |
| 2 | הרץ Debug Query לבדוק duplicates | ⏳ ממתין |
| 3 | נקה duplicates (אם יש) | ⏳ תלוי ב-2 |
| 4 | רענן `/dashboard/settings` | ⏳ ממתין |
| 5 | בחר תבנית מחדש | ⏳ ממתין |
| 6 | בדוק ב-DB שזה נשמר | ⏳ ממתין |
| 7 | צור PDF ובדוק עיצוב | ⏳ ממתין |

---

## 📝 Files Changed

| קובץ | מה השתנה |
|------|----------|
| [scripts/023-final-template-rls-fix.sql](scripts/023-final-template-rls-fix.sql) | **NEW** - Policy מאוחד לאדמינים + משתמשים |
| [scripts/DEBUG_TEMPLATE_SELECTION.sql](scripts/DEBUG_TEMPLATE_SELECTION.sql) | **NEW** - Query לאבחון בעיות |

**קבצים קיימים (לא שונו, אבל רלוונטיים):**
- [lib/pdf-service.ts](lib/pdf-service.ts#L27-L118) - ✅ תקין
- [app/api/templates/set-default/route.ts](app/api/templates/set-default/route.ts) - ✅ תקין
- [app/api/templates/user-templates/route.ts](app/api/templates/user-templates/route.ts) - ✅ תקין
- [components/dashboard/SimpleTemplateSelector.tsx](components/dashboard/SimpleTemplateSelector.tsx) - ✅ תקין

---

## ⚡ Quick Fix Command

```sql
-- הרץ את זה ב-Supabase אם אתה רוצה פתרון מהיר:

-- 1. תקן את ה-policy
\i scripts/023-final-template-rls-fix.sql

-- 2. נקה duplicates
UPDATE templates SET is_default = FALSE WHERE document_type = 'receipt';

-- 3. הגדר default אחד
UPDATE templates 
SET is_default = TRUE 
WHERE name = 'תבנית קלאסית'  -- או התבנית שאתה רוצה
  AND company_id IS NULL 
  AND document_type = 'receipt';

-- 4. בדוק
SELECT name, is_default FROM templates WHERE document_type = 'receipt';
```

אחרי זה רענן `/dashboard/settings` וצור PDF!

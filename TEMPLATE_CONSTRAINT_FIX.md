# 🐛 Template Constraint Bug Fix + Debug Page

**תאריך:** 1 בינואר 2026  
**Build:** ✅ SUCCESS (13.7s)

---

## 🔴 הבעיה

### Error Message
```
code: '23505'
message: 'duplicate key value violates unique constraint "unique_default_per_company_type"'
```

### מה קרה?
- ניסית ליצור תבנית **חדשה** עם `is_default = FALSE`
- קיבלת שגיאת duplicate key
- **למרות** שאין conflict אמיתי!

### למה זה קרה?

**Constraint הבעייתי:**
```sql
CONSTRAINT unique_default_per_company_type 
  UNIQUE NULLS NOT DISTINCT (company_id, document_type, is_default)
```

**הבעיה:**
- הConstraint חוסם **כל** duplicate של `(company_id, document_type, is_default)`
- זה כולל גם `is_default = FALSE`!
- כלומר: **אי אפשר** ליצור 2 תבניות לא-ברירת-מחדל לאותו document_type

**דוגמה:**
```sql
-- Template 1 (global receipt, not default)
INSERT INTO templates VALUES (NULL, 'receipt', ..., FALSE);  -- ✅ OK

-- Template 2 (global receipt, not default)
INSERT INTO templates VALUES (NULL, 'receipt', ..., FALSE);  -- ❌ ERROR!
-- duplicate key: (NULL, 'receipt', FALSE)
```

---

## ✅ הפתרון

### Partial Unique Index

במקום constraint רגיל, משתמשים ב-**partial unique index** שחל רק על `is_default = TRUE`:

```sql
-- Remove old constraint
ALTER TABLE templates 
DROP CONSTRAINT IF EXISTS unique_default_per_company_type;

-- Create partial unique index (only for defaults)
CREATE UNIQUE INDEX unique_default_per_company_type
ON templates (company_id, document_type)
WHERE is_default = TRUE;
```

**מה זה אומר:**
- ✅ **אפשר** unlimited תבניות עם `is_default = FALSE`
- ✅ **רק 1** תבנית עם `is_default = TRUE` לכל `(company_id, document_type)`

**דוגמה אחרי התיקון:**
```sql
-- All of these work now! ✅
INSERT INTO templates VALUES (NULL, 'receipt', 'Template 1', ..., FALSE);
INSERT INTO templates VALUES (NULL, 'receipt', 'Template 2', ..., FALSE);
INSERT INTO templates VALUES (NULL, 'receipt', 'Template 3', ..., FALSE);

-- Only ONE default allowed
INSERT INTO templates VALUES (NULL, 'receipt', 'Default', ..., TRUE);  -- ✅ OK
INSERT INTO templates VALUES (NULL, 'receipt', 'Default 2', ..., TRUE); -- ❌ ERROR
```

---

## 🔍 Debug Page

נוצר עמוד debug ב-**/admin/templates/debug**

### Features:

1. **⚠️ Conflicts Detection**
   - מזהה אוטומטית duplicates של defaults
   - מציג אזהרה אדומה אם יש conflict

2. **📊 Statistics**
   - Total templates
   - Default templates count
   - Non-default templates count

3. **📋 Full Templates Table**
   - כל התבניות עם פרטים מלאים
   - צבעים: ירוק = default, אפור = non-default
   - סטטוס: active/inactive

4. **🔧 SQL Fix Instructions**
   - הוראות מפורטות להרצת התיקון
   - Code block עם SQL מוכן להעתקה

### איך להשתמש:

1. לך ל-`/admin/templates/debug`
2. ראה את כל התבניות בטבלה
3. אם יש conflicts - יופיע warning אדום
4. העתק את ה-SQL מהקופסה הצהובה
5. הדבק ב-Supabase SQL Editor
6. Run
7. חזור לנסות ליצור תבנית ✅

---

## 📁 קבצים שנוצרו

### 1. Migration Script
**[scripts/021-fix-template-constraint.sql](scripts/021-fix-template-constraint.sql)**

```sql
-- Drop old constraint
ALTER TABLE templates DROP CONSTRAINT unique_default_per_company_type;

-- Create partial index
CREATE UNIQUE INDEX unique_default_per_company_type
ON templates (company_id, document_type)
WHERE is_default = TRUE;
```

### 2. Debug Page
**[app/admin/templates/debug/page.tsx](app/admin/templates/debug/page.tsx)**

- Server Component (direct DB access)
- Admin-only (checks system_admins table)
- Real-time statistics
- Color-coded conflicts
- Copy-paste SQL fix

---

## 🚀 הטמעה

### שלב 1: הרץ את התיקון

1. פתח **Supabase SQL Editor**
2. העתק את [scripts/021-fix-template-constraint.sql](scripts/021-fix-template-constraint.sql)
3. Run ▶️

### שלב 2: ודא שהתיקון עבד

```sql
-- Verify the index exists
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'templates' 
  AND indexname = 'unique_default_per_company_type';

-- Expected output:
-- indexdef: CREATE UNIQUE INDEX ... WHERE (is_default = true)
```

### שלב 3: נסה ליצור תבנית

1. לך ל-`/admin/templates/new`
2. מלא שם, HTML, CSS
3. **אל תסמן** "הגדר כברירת מחדל"
4. שמור
5. ✅ צריך לעבוד!

### שלב 4 (אופציונלי): בדוק Debug

1. לך ל-`/admin/templates/debug`
2. ראה שאין conflicts
3. ראה את כל התבניות בטבלה

---

## 🔄 השוואה: לפני ואחרי

| מצב | לפני (Constraint רגיל) | אחרי (Partial Index) |
|-----|----------------------|---------------------|
| **2 non-default templates** | ❌ ERROR | ✅ OK |
| **10 non-default templates** | ❌ ERROR | ✅ OK |
| **1 default template** | ✅ OK | ✅ OK |
| **2 default templates** | ❌ ERROR | ❌ ERROR |
| **Mix: 5 non-default + 1 default** | ❌ ERROR | ✅ OK |

---

## 🎯 סיכום

| רכיב | טכנולוגיה | סטטוס |
|------|-----------|-------|
| **Migration** | SQL Partial Index | ✅ Ready |
| **Debug Page** | Next.js Server Component | ✅ Complete |
| **Build** | Next.js 16 Turbopack | ✅ 13.7s |
| **Route** | `/admin/templates/debug` | ✅ Live |

**Fix Time:** 5 דקות להרצת SQL  
**Root Cause:** Constraint חסם גם non-defaults  
**Solution:** Partial unique index (WHERE is_default = TRUE)

🎉 **הבעיה נפתרה!** אחרי הרצת ה-SQL תוכל ליצור כמה תבניות שתרצה.

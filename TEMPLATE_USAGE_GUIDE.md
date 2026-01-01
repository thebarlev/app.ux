# מערכת בחירת תבניות - הוראות שימוש

## ✅ מה נוצר?

### 1. **אדמין - ניהול תבניות** (`/admin/templates`)
- תצוגת גלריה עם כרטיסים
- כל כרטיס מציג:
  - תמונת תצוגה מקדימה (או אייקון placeholder)
  - שם התבנית
  - תיאור
  - Badge סטטוס (פעיל/מושבת)
  - סוג מסמך
  - היקף (גלובלי/חברה)
- פעולות זמינות:
  - עריכה (לחיצה על כרטיס או כפתור Edit)
  - שכפול
  - הפעלה/השבתה
  - תצוגה מקדימה
  - מחיקה (רק לתבניות חברה)

### 2. **משתמשים - בחירת תבנית** (`/dashboard/templates`)
- גלריית תבניות זמינות (פעילות בלבד)
- בחירת תבנית אחת בלחיצה
- סימון התבנית הנבחרת ב-checkmark ירוק
- מידע: המשתמש יכול לשנות תבנית בכל שלב

### 3. **מסד הנתונים**
- שדה `thumbnail_url` בטבלת templates
- שדה `selected_template_id` בטבלת companies
- אינדקסים לביצועים

## 📋 צעדים להפעלה

### שלב 1: הרצת Migration
```bash
# בעורך SQL של Supabase, הרץ:
psql -f scripts/016-add-template-selection.sql
```

או העתק את התוכן של `016-add-template-selection.sql` לעורך SQL.

### שלב 2: בדיקת אדמין
1. היכנס ל-`/admin` (כאדמין)
2. לחץ על "Templates" בתפריט העליון
3. צפה בגלריה - אמור לראות את התבניות הקיימות
4. נסה ליצור תבנית חדשה
5. העלה תמונת תצוגה מקדימה (אופציונלי)

### שלב 3: בדיקת משתמשים
1. היכנס ל-`/dashboard` (כמשתמש רגיל)
2. נווט ל-`/dashboard/templates`
3. צפה בתבניות הזמינות
4. לחץ על תבנית לבחירה
5. וודא שהתבנית מסומנת

## 🖼️ הוספת תמונות תצוגה מקדימה

### אופציה 1: URL ישיר
```typescript
// בעת יצירת/עריכת תבנית באדמין
thumbnailUrl: "https://example.com/template-preview.png"
```

### אופציה 2: Supabase Storage
1. העלה תמונה ל-Storage bucket: `business-assets/template-thumbnails/`
2. קבל Public URL
3. שמור ב-`thumbnail_url`

### אופציה 3: יצירה אוטומטית (עתידי)
```typescript
// אפשר להוסיף פונקציה שתצור screenshot באמצעות Playwright
async function generateThumbnail(templateId: string) {
  const page = await browser.newPage()
  await page.setContent(htmlContent)
  const screenshot = await page.screenshot()
  // Upload to storage...
}
```

### מידות מומלצות לתמונות
- **Aspect Ratio**: 16:9
- **Resolution**: 800x450px או 1200x675px
- **Format**: PNG או JPG
- **Size**: עד 500KB

## 🔧 שימוש מהקוד

### קבלת תבנית נבחרת
```typescript
import { getSelectedTemplateAction } from "@/app/dashboard/templates/actions"

const { templateId } = await getSelectedTemplateAction()
if (templateId) {
  // Load template and use for PDF generation
}
```

### בחירת תבנית
```typescript
import { setSelectedTemplateAction } from "@/app/dashboard/templates/actions"

await setSelectedTemplateAction(templateId)
```

### קבלת רשימת תבניות זמינות
```typescript
import { getAvailableTemplatesAction } from "@/app/dashboard/templates/actions"

const { templates } = await getAvailableTemplatesAction()
// templates = array of active templates (company + global)
```

## 📊 מבנה הנתונים

### טבלת templates
```sql
CREATE TABLE templates (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id), -- NULL = global
  name TEXT NOT NULL,
  description TEXT,
  document_type TEXT NOT NULL, -- 'receipt', 'invoice', etc.
  html_template TEXT NOT NULL,
  css TEXT,
  thumbnail_url TEXT, -- ← NEW
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### טבלת companies
```sql
ALTER TABLE companies 
ADD COLUMN selected_template_id UUID 
REFERENCES templates(id) ON DELETE SET NULL;
```

## 🎨 UI Components

### גלריית אדמין (TemplatesClient.tsx)
- שימוש ב-Card, CardHeader, CardContent, CardFooter
- Hover effect עם Overlay לפעולות
- Responsive grid (1/2/3 עמודות)
- Filter & Search

### בחירת משתמש (TemplateSelectionClient.tsx)
- Card grid עם אייקון Check למסומן
- Badge לסוגי תבניות (גלובלי/מותאם)
- Info card עם חוקי השימוש

## 🔒 הרשאות

### אדמין
- ✅ צפייה בכל התבניות
- ✅ יצירה/עריכה/מחיקה של תבניות חברה
- ✅ צפייה בתבניות גלובליות (לא עריכה)
- ✅ הפעלה/השבתה
- ✅ העלאת thumbnails

### משתמש
- ✅ צפייה בתבניות פעילות בלבד
- ✅ בחירת תבנית
- ❌ אין עריכת HTML/CSS
- ❌ אין מחיקה
- ❌ אין יצירה

## 🚀 שילוב עם PDF Generator

### עדכון נדרש ב-lib/pdf-service.ts
```typescript
import { createClient } from "@/lib/supabase/server"

// בתוך generatePDF()
async function getCompanyTemplate(companyId: string) {
  const supabase = await createClient()
  
  // Get company's selected template
  const { data: company } = await supabase
    .from("companies")
    .select("selected_template_id")
    .eq("id", companyId)
    .single()
  
  if (!company?.selected_template_id) {
    // Fallback to default template
    const { data: defaultTemplate } = await supabase
      .from("templates")
      .select("*")
      .eq("document_type", "receipt")
      .eq("is_default", true)
      .eq("is_active", true)
      .single()
    
    return defaultTemplate
  }
  
  // Get selected template
  const { data: template } = await supabase
    .from("templates")
    .select("*")
    .eq("id", company.selected_template_id)
    .single()
  
  return template
}
```

## 📝 TODO List

- [ ] הרצת migration 016
- [ ] בדיקת גלריה באדמין
- [ ] בדיקת בחירה למשתמשים
- [ ] העלאת thumbnail לתבנית ברירת מחדל
- [ ] שילוב עם PDF Generator
- [ ] יצירת thumbnails אוטומטית (אופציונלי)

## 🐛 Troubleshooting

### "לא נמצאו תבניות" במשתמשים
- וודא שיש לפחות תבנית אחת פעילה (`is_active = true`)
- בדוק ש-RLS מאפשר גישה לתבניות
- וודא שהמשתמש שייך לחברה

### תמונת Thumbnail לא מוצגת
- וודא שה-URL ציבורי
- בדוק CORS אם התמונה בשרת חיצוני
- נסה לפתוח את ה-URL ישירות בדפדפן

### שגיאה בעת בחירת תבנית
- בדוק שה-template_id קיים
- וודא שהתבנית פעילה
- בדוק לוגים בקונסול

## 📚 קבצים שנוצרו

1. `scripts/016-add-template-selection.sql` - Migration
2. `app/admin/templates/TemplatesClient.tsx` - גלריה (מעודכן)
3. `app/dashboard/templates/page.tsx` - דף בחירה למשתמשים
4. `app/dashboard/templates/actions.ts` - Server actions
5. `app/dashboard/templates/TemplateSelectionClient.tsx` - UI בחירה
6. `app/admin/templates/actions.ts` - תמיכה ב-thumbnailUrl (מעודכן)
7. `TEMPLATE_SELECTION_SYSTEM.md` - מדריך מפורט
8. `TEMPLATE_USAGE_GUIDE.md` - הקובץ הזה

---

**סטטוס**: ✅ קוד מוכן | ⏳ צריך להריץ migration

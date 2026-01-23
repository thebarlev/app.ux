# בחירת תבנית בעמוד ההגדרות - סיכום

## ✅ מה נוסף?

### עמוד ההגדרות (`/dashboard/settings`)
עכשיו כולל **בחירת תבנית** עם שתי תצוגות:

#### 1️⃣ **תצוגת גלריה** (Gallery View)
- כרטיסים עם תמונות preview
- תצוגה חזותית ונוחה
- סימון התבנית הנבחרת עם ✓ ירוק ורינג כחול
- Badges: "ברירת מחדל", "תבנית מערכת", "פעיל"
- Hover effects מלאים

#### 2️⃣ **רשימה נפתחת** (Dropdown)
- Select פשוט ונקי
- טקסט בלבד עם אייקון check
- מתאים למשתמשים שמעדיפים פשטות

### Features
- ✅ החלפה בין שתי התצוגות בכפתור
- ✅ בחירה בלחיצה אחת
- ✅ עדכון מיידי עם toast notification
- ✅ Loading state עם overlay
- ✅ תיבת טיפים בתחתית
- ✅ תמיכה בתמונות thumbnail או placeholder
- ✅ Badge למערכת/חברה
- ✅ Badge לברירת מחדל

## 📋 קבצים שנוצרו/עודכנו

### 1. קומפוננטה חדשה
**`components/dashboard/TemplateSelector.tsx`**
- קומפוננטה עצמאית לבחירת תבנית
- שתי תצוגות: Gallery + Dropdown
- Props: initialTemplates, selectedTemplateId, onTemplateSelect
- State management מלא עם loading

### 2. Server Actions
**`app/dashboard/settings/template-actions.ts`**
- `setSelectedTemplateInSettingsAction()` - עדכון תבנית נבחרת
- Validation של התבנית (קיימת + פעילה)
- Revalidation של הדפים הרלוונטיים

### 3. עדכון דף הגדרות
**`app/dashboard/settings/page.tsx`**
- שאילתה נוספת: `selected_template_id` מטבלת companies
- שאילתה לתבניות זמינות
- העברת הנתונים ל-SettingsClient

### 4. עדכון Client Component
**`app/dashboard/settings/SettingsClient.tsx`**
- Type חדש: `Template`
- Props מורחב: `initialTemplates`
- סקשן חדש עם TemplateSelector
- Import של הקומפוננטה

## 🎨 UI/UX Details

### Gallery View
```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ [תמונה]      │  │ [תמונה]      │  │ [תמונה]      │
│ ✓ פעיל       │  │              │  │              │
│ תבנית 1      │  │ תבנית 2      │  │ תבנית 3      │
│ תיאור...     │  │ תיאור...     │  │ תיאור...     │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Dropdown View
```
┌────────────────────────────────┐
│ ✓ תבנית 1  [ברירת מחדל]       │ ▼
└────────────────────────────────┘
  ├─ תבנית 2  [תבנית מערכת]
  ├─ תבנית 3
  └─ תבנית 4
```

### Selected State
- **Ring**: `ring-2 ring-primary`
- **Shadow**: `shadow-lg`
- **Check Icon**: ירוק בתוך עיגול
- **Badge**: "פעיל" בצבע ראשי

## 🔧 איך זה עובד?

### 1. טעינת דף
```typescript
// Server Component
const { data: company } = await supabase
  .from("companies")
  .select("..., selected_template_id")
  .single()

const { data: templates } = await supabase
  .from("templates")
  .select("id, name, description, thumbnail_url, is_default, company_id")
  .eq("is_active", true)
  .or(`company_id.eq.${companyId},company_id.is.null`)
```

### 2. בחירת תבנית
```typescript
// User clicks on template card
handleSelect(templateId) → 
  setSelectedTemplateInSettingsAction(templateId) →
    Update companies.selected_template_id →
      Revalidate pages →
        Toast success
```

### 3. תצוגה
```typescript
// TemplateSelector renders based on viewMode
viewMode === "gallery" ? <Cards /> : <Dropdown />
```

## 📱 Responsive Design

- **Mobile (< 768px)**: 1 עמודה
- **Tablet (768px - 1024px)**: 2 עמודות
- **Desktop (> 1024px)**: 3 עמודות
- Dropdown תמיד ברוחב מלא

## 🎯 User Flow

1. משתמש נכנס ל-`/dashboard/settings`
2. גולל למטה לסקשן "תבנית מסמכים"
3. רואה את שתי האפשרויות: גלריה / רשימה נפתחת
4. בוחר תצוגה מועדפת
5. לוחץ על תבנית
6. Loading overlay מופיע
7. Toast הצלחה
8. התבנית מסומנת כפעילה

## 🚀 הצעדים הבאים

1. ✅ הרץ migration: `016-add-template-selection.sql`
2. ✅ פתח את `/dashboard/settings`
3. ✅ גלול למטה
4. ✅ בחר תבנית מהגלריה או מהרשימה
5. ✅ וודא שהבחירה נשמרה (רענן דף)

## 💡 טיפים למשתמש

כפי שמופיע בעמוד:
- התבנית הנבחרת תשמש לכל המסמכים החדשים
- ניתן לשנות תבנית בכל שלב
- שינוי תבנית לא ישפיע על מסמכים קיימים

## 🎨 Customization

### שינוי מספר עמודות בגלריה
```tsx
// TemplateSelector.tsx, line ~130
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
//                                              ^^^^ שנה ל-4
```

### שינוי תצוגת ברירת מחדל
```tsx
const [viewMode, setViewMode] = useState<"gallery" | "dropdown">("dropdown")
//                                                                ^^^^^^^^^^
```

### הסתרת כפתור המעבר
```tsx
// הסר את הקוד בשורות 80-95 (View Mode Toggle)
```

---

**סטטוס**: ✅ קוד מוכן | ✅ Build הצליח | ⏳ צריך migration

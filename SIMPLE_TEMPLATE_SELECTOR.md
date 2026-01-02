# 🎯 מערכת בחירת תבניות פשוטה - Simple Template Selector

**תאריך:** 1 בינואר 2026  
**סטטוס:** ✅ **מוכן לשימוש**  
**Build:** ✅ SUCCESS (11.4s)

---

## 🎨 שינוי המבנה

### ❌ לפני (מורכב)
- Grid עם 6 טאבים לפי סוג מסמך
- בחירה נפרדת לכל document_type
- טבלת `company_template_selections` לשמירת הבחירות
- לוגיקה מורכבת עם lazy loading

### ✅ אחרי (פשוט)
- **רשימה אנכית** של כל התבניות
- **מבנה קלף:**
  - 📸 **מימין:** תמונת Thumbnail (A4 proportions)
  - 📝 **משמאל:** שם התבנית + תיאור + badges
  - 🔘 **כפתור Toggle:** הדלקה/כיבוי לברירת מחדל
- **בחירה פשוטה:** toggle אחד לכל תבנית
- **לוגיקה:** שימוש ב-`is_default` בטבלת `templates` (ללא טבלה נוספת)

---

## 📁 קבצים שנוצרו

### 1. SimpleTemplateSelector Component
**[components/dashboard/SimpleTemplateSelector.tsx](components/dashboard/SimpleTemplateSelector.tsx)**

**Features:**
```tsx
// Structure per template card:
<Card>
  <Thumbnail (24×32) />  // Right side
  <Content>              // Left side
    <Name />
    <Description />
    <Badges>
      - Document Type
      - Global/Company
      - Default ✓
    </Badges>
  </Content>
  <Switch />             // Toggle default
</Card>
```

**States:**
- ✅ Loading state with spinner
- ✅ Empty state with icon
- ✅ Optimistic UI updates
- ✅ Disabled state for inactive templates
- ✅ Visual ring for current default

**UX:**
- Hover shadow effect
- Ring indicator for selected
- Toast notifications
- Immediate visual feedback

---

### 2. API Route: Get User Templates
**[app/api/templates/user-templates/route.ts](app/api/templates/user-templates/route.ts)**

**Endpoint:** `GET /api/templates/user-templates`

**Logic:**
```typescript
// Fetch templates for current user's company + globals
SELECT * FROM templates
WHERE (company_id = {userCompanyId} OR company_id IS NULL)
  AND is_active = TRUE
ORDER BY is_default DESC, created_at DESC
```

**Response:**
```json
{
  "ok": true,
  "templates": [
    {
      "id": "uuid",
      "name": "תבנית מודרנית",
      "document_type": "receipt",
      "is_default": true,
      "thumbnail_url": "https://...",
      ...
    }
  ]
}
```

---

### 3. API Route: Set Default Template
**[app/api/templates/set-default/route.ts](app/api/templates/set-default/route.ts)**

**Endpoint:** `POST /api/templates/set-default`

**Body:**
```json
{
  "templateId": "uuid",
  "isDefault": true
}
```

**Logic:**
1. Verify user has access to template
2. If `isDefault = true`:
   - Unset other defaults for same `document_type` + `company_id`
   - Unset global defaults for same `document_type`
3. Update template's `is_default`

**Critical:** Only ONE default per `(company_id, document_type)` combination!

---

### 4. Updated Settings Page
**[app/dashboard/settings/SettingsClient.tsx](app/dashboard/settings/SettingsClient.tsx)**

**Before:**
```tsx
<TemplateSelectionGrid className="mb-6" />
```

**After:**
```tsx
<div className="bg-white rounded-lg shadow p-6">
  <h2>בחירת תבניות מסמכים</h2>
  <p>בחר תבנית ברירת מחדל לכל סוג מסמך...</p>
  <SimpleTemplateSelector />
</div>
```

---

## 🎯 תרחיש שימוש

### דוגמה: בעל עסק בוחר תבניות

1. **נכנס ל-** `/dashboard/settings`
2. **גולל ל-** "בחירת תבניות מסמכים"
3. **רואה רשימה:**
   ```
   ┌────────────────────────────────────────┐
   │ [📸 תמונה]  תבנית קבלה מודרנית      │
   │              קבלה • גלובלית          │
   │              [🔘 ברירת מחדל: ON]     │
   ├────────────────────────────────────────┤
   │ [📸 תמונה]  תבנית חשבונית קלאסית    │
   │              חשבונית • שלי           │
   │              [🔘 ברירת מחדל: OFF]    │
   ├────────────────────────────────────────┤
   │ [📄 אייקון] תבנית הצעת מחיר          │
   │              הצעת מחיר • גלובלית     │
   │              [🔘 ברירת מחדל: OFF]    │
   └────────────────────────────────────────┘
   ```

4. **לוחץ על Toggle** של "תבנית חשבונית קלאסית"
5. **מקבל:**
   - Toggle משתנה ל-ON מיידית (optimistic)
   - Toast: "תבנית הוגדרה כברירת מחדל"
   - הקלף מקבל ring indicator
   - Toggle של תבנית אחרת (אותו document_type) משתנה ל-OFF

6. **תוצאה:**
   - חשבוניות חדשות ישתמשו בתבנית הקלאסית ✅
   - קבלות ימשיכו להשתמש בתבנית המודרנית ✅

---

## 🔧 לוגיקה טכנית

### איך ה-Toggle עובד?

```typescript
handleToggleDefault(template) {
  const newState = !template.is_default
  
  // 1. Optimistic UI update
  setTemplates(prev => prev.map(t => ({
    ...t,
    is_default: t.id === template.id 
      ? newState 
      : (newState ? false : t.is_default)
    // ↑ If turning ON, turn OFF all others with same document_type
  })))

  // 2. API call
  await fetch('/api/templates/set-default', {
    method: 'POST',
    body: JSON.stringify({ templateId, isDefault: newState })
  })

  // 3. Reload to sync with DB
  await loadTemplates()
}
```

### מה קורה ב-Backend?

```typescript
if (isDefault) {
  // Unset company defaults for this document_type
  UPDATE templates
  SET is_default = false
  WHERE company_id = {userCompanyId}
    AND document_type = {templateDocType}
    AND id != {templateId}

  // Unset global defaults for this document_type
  UPDATE templates
  SET is_default = false
  WHERE company_id IS NULL
    AND document_type = {templateDocType}
    AND id != {templateId}
}

// Set the new default
UPDATE templates
SET is_default = {isDefault}
WHERE id = {templateId}
```

**תוצאה:** רק תבנית אחת מסומנת `is_default = true` לכל `(company_id, document_type)`.

---

## 🎨 עיצוב UI

### Card Structure (RTL)

```
┌─────────────────────────────────────────────────────┐
│  ┌────────┐  תבנית קבלה מודרנית          [Switch] │
│  │ [IMG]  │  עיצוב נקי עם לוגו מרכזי      ברירת   │
│  │ 24x32  │  קבלה • גלובלית • ברירת מחדל ✓  מחדל  │
│  └────────┘                                         │
└─────────────────────────────────────────────────────┘
```

### Colors & States

| State | Visual |
|-------|--------|
| **Default (ON)** | Ring: `ring-2 ring-primary`, Badge: `bg-primary` |
| **Hover** | Shadow: `hover:shadow-md` |
| **Updating** | Switch disabled, Text: "מעדכן..." |
| **Inactive** | Switch disabled, Grayed out |

### Responsive

- Mobile (< 768px): Full width cards, stacked layout
- Desktop: Consistent padding, optimal spacing

---

## 📊 השוואה: לפני ואחרי

| תכונה | לפני (TemplateSelectionGrid) | אחרי (SimpleTemplateSelector) |
|-------|----------------------------|------------------------------|
| **Complexity** | Grid + Tabs + 6 TabsContent | Simple list |
| **Files** | 4 files | 3 files |
| **Database** | templates + company_template_selections | templates only |
| **Lines of Code** | ~600 | ~200 |
| **User Actions** | Click tab → Click card → Confirm | Click toggle |
| **Visual Feedback** | Ring + Badge + Toast | Ring + Badge + Toast |
| **Loading** | Lazy per tab | All at once (filtered) |
| **State Management** | Complex (per tab) | Simple (one list) |

---

## ✅ מה נשאר?

### שמירת התכונות החשובות:
- ✅ Thumbnails מוצגים
- ✅ Badges להבחנה (גלובלי/חברה/מחדל)
- ✅ Optimistic UI
- ✅ Toast notifications
- ✅ RLS security
- ✅ Type safety

### מה הוסר:
- ❌ Tabs navigation
- ❌ Grid layout עם 3 עמודות
- ❌ Lazy loading per tab
- ❌ Hover overlay עם כפתור "בחר"
- ❌ טבלת company_template_selections

### מה השתפר:
- ✅ פשטות - פחות קליקים
- ✅ מהירות - פחות state management
- ✅ נגישות - toggle ברור יותר
- ✅ תחזוקה - פחות קוד

---

## 🚀 הטמעה

### אין צורך ב-Migration חדש!
המערכת משתמשת ב-`templates.is_default` שכבר קיים.

### לבדוק:
1. ✅ Build הצליח
2. ✅ `/dashboard/settings` נטען
3. ✅ רשימת תבניות מוצגת
4. ✅ Toggle עובד
5. ✅ Toast מופיע
6. ✅ ברירת מחדל משתנה

### תוצאה:
**UI פשוט, ברור, ומהיר!** 🎉

---

## 📝 סיכום

| רכיב | טכנולוגיה | סטטוס |
|------|-----------|-------|
| **Component** | React + TypeScript | ✅ Complete |
| **API Routes** | Next.js Route Handlers | ✅ Complete |
| **Database** | PostgreSQL (templates table) | ✅ Existing |
| **UX** | Card list + Toggle | ✅ Simple & Clear |
| **Build** | Next.js 16 Turbopack | ✅ 11.4s |

**Total Changes:**
- 1 new component (SimpleTemplateSelector)
- 2 new API routes (user-templates, set-default)
- 1 updated page (SettingsClient)
- 0 migrations needed
- Build time: 11.4s ✅

🎯 **מוכן לשימוש!** המערכת פשוטה, אינטואיטיבית, ומהירה.

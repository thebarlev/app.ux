# Receipt Style Admin - Implementation Summary

## מה בוצע

מערכת מלאה לניהול עיצוב קבלות ברמת המערכת, הניתנת לשליטה מלאה על ידי ה-Admin.

## קבצים שנוצרו

### 1. **Types & Schema**
- **`lib/types/receipt-style.ts`**: 
  - TypeScript interface `ReceiptStyleSettings` עם כל ההגדרות
  - הגדרות ברירת מחדל `DEFAULT_RECEIPT_STYLE`
  - פונקציות validation לצבעים HEX ולהגדרות

### 2. **Database Migration**
- **`scripts/013-receipt-style-settings.sql`**:
  - טבלה `receipt_style_settings` עם שדה JSONB
  - RLS policies - רק admin יכול לקרוא/לכתוב
  - Trigger לעדכון `updated_at` אוטומטי
  - Default settings בעת יצירה

### 3. **Server Actions**
- **`app/admin/receipt-style/actions.ts`**:
  - `getReceiptStyleSettings()` - קריאת הגדרות (admin only)
  - `getReceiptStyleSettingsPublic()` - קריאה ציבורית לתצוגה (עם fallback לdefaults)
  - `saveReceiptStyleSettings()` - שמירת הגדרות (admin only, with validation)
  - `resetReceiptStyleSettings()` - איפוס לברירת מחדל

### 4. **Admin UI**
- **`app/admin/receipt-style/page.tsx`**: 
  - Server component עם auth check
  - מעביר settings ל-client component

- **`app/admin/receipt-style/ReceiptStyleForm.tsx`**:
  - Client component עם tabs: Typography, Colors, Layout, Custom CSS
  - Real-time validation לצבעי HEX
  - טפסים מלאים לכל סקציה
  - כפתורי שמירה ואיפוס
  - הצגת הודעות success/error

### 5. **Preview Integration**
- **`app/dashboard/documents/receipt/preview/page.tsx`** (עודכן):
  - טעינת `styleSettings` דרך `getReceiptStyleSettingsPublic()`
  - העברה ל-`PreviewClient`

- **`app/dashboard/documents/receipt/preview/PreviewClient.tsx`** (עודכן):
  - קבלת `styleSettings` כprop
  - שימוש ב-CSS variables (`--receipt-*`)
  - החלת כל ההגדרות: טיפוגרפיה, צבעים, מרווחים, padding
  - Injection של Custom CSS
  - תאימות מלאה ל-html2pdf.js (HEX only)

### 6. **Navigation**
- **`components/admin/admin-header.tsx`** (עודכן):
  - הוספת כפתור "Receipt Style" עם אייקון Palette בתפריט Admin

## איך להשתמש

### שלב 1: הרצת Migration
```bash
# בSupabase SQL Editor, הרץ:
scripts/013-receipt-style-settings.sql
```

### שלב 2: כניסה לממשק Admin
1. התחבר כ-System Admin
2. לחץ על "Receipt Style" בתפריט העליון
3. תגיע לעמוד: `/admin/receipt-style`

### שלב 3: התאמה אישית
השתמש ב-4 טאבים:

1. **טיפוגרפיה**:
   - משפחת גופן (font-family)
   - גודל טקסט בסיסי
   - גודל כותרת "קבלה 100"
   - גודל כתובית

2. **צבעים** (כל הצבעים HEX):
   - רקע כללי
   - טקסט כללי
   - צבע הדגשה (קווים)
   - רקע/טקסט באזור עליון
   - רקע/טקסט טבלה
   - צבעי תיבת סה״כ

3. **פריסה ומרווחים**:
   - Padding של העמוד (mm)
   - Padding של כותרת (px)
   - Padding טבלה (px)
   - Padding תיבת סה״כ (px)
   - יישורים (right/left, top/center)

4. **CSS מותאם**:
   - כתיבת CSS חופשי
   - מוחל רק בתוך `#receipt-preview`
   - **אין להשתמש ב-lab() או color-mix()** (תאימות PDF)

### שלב 4: שמירה ובדיקה
1. לחץ "שמור הגדרות"
2. המערכת תאמת שכל הצבעים HEX תקינים
3. עבור ל-`/dashboard/documents/receipt/preview?...` לראות את השינויים
4. צור PDF - הכל יעבוד עם html2pdf.js

### איפוס
לחץ "איפוס לברירת מחדל" כדי לחזור להגדרות המקוריות.

## כיצד זה עובד

### CSS Variables System
```tsx
<div id="receipt-preview" style={{
  "--receipt-bg": "#ffffff",
  "--receipt-text": "#111827",
  "--receipt-accent": "#111827",
  // ... all other colors
}}>
```

### Dynamic Styles
```tsx
<div style={{
  background: styleSettings.colors.background,
  color: styleSettings.colors.text,
  padding: styleSettings.sections.totalBox.padding,
  fontSize: styleSettings.typography.baseFontSize,
}}>
```

### Custom CSS Injection
```tsx
<style>{`
  ${styleSettings.customCss}
`}</style>
```

## אבטחה

- **RLS Policies**: רק `system_admins` יכולים לערוך
- **Validation**: כל צבע נבדק שהוא HEX תקין
- **Public Reading**: כל אחד יכול לקרוא (לתצוגת קבלות), אבל עם fallback ל-defaults אם אין הרשאה

## תאימות PDF

✅ **כל הצבעים HEX בלבד** - אין lab() או color-mix()  
✅ **Inline styles** - html2canvas תומך  
✅ **CSS Variables** - עובד עם html2canvas  
✅ **Custom CSS** - עובד אם הכללים תקינים  

## דוגמת שימוש - Custom CSS

```css
/* הגדלת רווח בין שורות בכותרת */
#receipt-preview .header-section {
  line-height: 2;
}

/* שינוי צבע רקע ללוגו */
#receipt-preview .logo-container {
  background: #f0f0f0;
  padding: 10px;
  border-radius: 8px;
}

/* הוספת צל לתיבת סה״כ */
#receipt-preview .total-box {
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}
```

## טיפים לשימוש

1. **התחל עם הצבעים** - שנה צבע אחד בכל פעם וראה את האפקט
2. **השתמש ב-color picker** - נוח יותר מהקלדת HEX ידנית
3. **בדוק PDF** - לאחר כל שינוי, צור PDF לוודא שהכל עובד
4. **Custom CSS בזהירות** - ודא שהכללים לא שוברים את הפריסה
5. **גיבוי הגדרות** - שמור צילום מסך של ההגדרות לפני שינויים גדולים

## Known Limitations

- אין preview חי בעמוד ה-admin (צריך לעבור ל-preview page)
- אין history של שינויים (רק save אחרון)
- אין multi-tenant styling (כל החברות משתמשות באותן הגדרות)

## עתיד אפשרי

- ✨ Preview חי בתוך עמוד ה-Admin
- ✨ History של שינויים + Undo
- ✨ Templates מוכנים (Classic, Modern, Minimal)
- ✨ Per-company styling (override מהגדרות גלובליות)
- ✨ Import/Export של הגדרות (JSON)

---

**תיעוד נוצר**: 29 דצמבר 2025  
**גרסה**: 1.0.0

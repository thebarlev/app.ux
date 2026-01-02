# הוספת לוגו BARLEV לתצוגת דוגמה

כדי להוסיף את הלוגו של BARLEV לתצוגת הדוגמה:

1. הוסף את קובץ הלוגו לתיקייה `/public/` עם השם `barlev-logo.png`

2. עדכן את הנתיב בקובץ:
   `app/admin/templates/[id]/preview/TemplatePreviewClient.tsx`
   
   שנה את:
   ```typescript
   logo_url: "/placeholder-logo.png", // Replace with /barlev-logo.png when available
   ```
   
   ל:
   ```typescript
   logo_url: "/barlev-logo.png",
   ```

3. עשה את אותו הדבר לכל המופעים של `/placeholder-logo.png` בקובץ.

## מיקום הקובץ הסופי:
```
/Users/uxellent/v0-system-owner-admin-panel/public/barlev-logo.png
```

עכשיו התצוגה לדוגמה תציג את הלוגו האמיתי!

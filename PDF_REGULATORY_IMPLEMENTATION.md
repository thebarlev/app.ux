# PDF Regulatory Implementation - מערכת PDF רגולטורית

## ✅ מה יושם

### 1. מערכת סטטוסים רגולטורית
- **DRAFT** - טיוטה (מותר Preview, מותר Generate זמני)
- **FINALIZED** - הונפק רשמית (נעול)
- **PDF_READY** - יש PDF שמור ב-Storage

### 2. PDF Immutable (בלתי ניתן לשינוי)
- PDF נוצר **פעם אחת בלבד** ב-`finalizeDocument`
- Storage path קבוע: `documents/{documentId}/source.pdf`
- `upsert: false` - לא ניתן לדרוס PDF קיים
- אם PDF כבר קיים → תמיד מחזיר אותו

### 3. נעילה אחרי FINALIZED
- אי אפשר לשנות נתונים כספיים/תאריכים/מספר מסמך
- אי אפשר לייצר PDF מחדש (בשום endpoint/UI)
- אם PDF חסר למסמך FINALIZED → שגיאה 500 (נדרש טיפול מערכת)

### 4. API Behavior
- `GET /api/documents/:id/pdf`:
  - אם PDF קיים → מחזיר 200 + הקובץ
  - אם אין PDF ו-`status == FINALIZED` → 500 (לא מייצר מחדש!)
  - אם אין PDF ו-`status == DRAFT` → מייצר Preview זמני (לא נשמר)

### 5. תיקון mime type
- הוסר `contentType: "application/pdf"` מה-upload
- Supabase יזהה אוטומטית את ה-mime type מה-buffer

---

## ⚠️ פעולות נדרשות - Supabase Dashboard

### שלב 1: עדכון Storage Bucket MIME Types

1. פתח Supabase Dashboard
2. לך ל-**Storage** → **business-assets** bucket
3. לחץ על **Settings** או **Configuration**
4. מצא את השדה **"Allowed MIME types"**
5. עדכן מ:
   ```
   image/png,image/jpeg,image/jpg,image/svg+xml
   ```
   ל:
   ```
   image/png,image/jpeg,image/jpg,image/svg+xml,application/pdf
   ```
6. שמור

### שלב 2: הרצת Migration Scripts

הרץ את ה-SQL scripts הבאים ב-Supabase SQL Editor:

1. **`scripts/025-add-pdf-status-and-fields.sql`** - מוסיף סטטוסים ושדות PDF
2. **`scripts/026-update-storage-bucket-mime-types.sql`** - מוסיף RLS policies ל-PDFs

---

## 📋 שינויים בקוד

### 1. `lib/pdf-service.ts`
- ✅ Storage path: `documents/{documentId}/source.pdf` (immutable)
- ✅ בדיקה אם PDF כבר קיים לפני יצירה
- ✅ הוסר `contentType` מה-upload
- ✅ הוספת SHA256 checksum
- ✅ שמירת `template_version_id` (snapshot)
- ✅ עדכון סטטוס ל-`pdf_ready` אחרי יצירה

### 2. `lib/document-helpers.ts` - `finalizeDocument`
- ✅ קריאה אוטומטית ל-`generateDocumentPDF` אחרי finalize
- ✅ PDF נוצר **באותו זמן** עם finalize

### 3. `app/api/documents/[documentId]/pdf/route.ts`
- ✅ בדיקה של `pdf_storage_key` במקום `pdf_path`
- ✅ אם PDF חסר למסמך FINALIZED → 500 (לא מייצר מחדש)
- ✅ Preview זמני רק ל-DRAFT

### 4. `app/dashboard/documents/receipt/actions.ts` - `issueReceiptAction`
- ✅ הסרת קריאה כפולה ל-`generateDocumentPDF`
- ✅ PDF נוצר אוטומטית ב-`finalizeDocument`

---

## 🔒 הגנות רגולטוריות

1. **Immutable PDF**: לא ניתן לדרוס PDF קיים
2. **Single Source of Truth**: PDF אחד בלבד לכל מסמך
3. **No Regeneration**: אי אפשר לייצר PDF מחדש למסמך FINALIZED
4. **Template Snapshot**: שמירת `template_version_id` בזמן finalize
5. **Integrity Check**: SHA256 checksum לכל PDF

---

## 🧪 בדיקות

לאחר יישום השינויים:

1. ✅ צור קבלה חדשה → PDF אמור להיווצר אוטומטית
2. ✅ הורד PDF מהפופאפ → אמור לעבוד
3. ✅ הורד PDF ממסך התצוגה → אמור להיות אותו PDF
4. ✅ נסה ליצור קבלה נוספת → PDF חדש אמור להיווצר
5. ✅ בדוק ב-Storage → אמור להיות `documents/{id}/source.pdf`

---

## 📝 הערות חשובות

- **mime type**: אם עדיין יש שגיאה, ודא שהוספת `application/pdf` ל-bucket
- **RLS Policies**: ה-policies ב-`026-update-storage-bucket-mime-types.sql` מאפשרים העלאה והורדה של PDFs
- **Backward Compatibility**: מסמכים קיימים ימשיכו לעבוד, אבל PDFs חדשים ישתמשו ב-path החדש

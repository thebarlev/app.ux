# Setup: `regulatory-exports` (private) bucket

מטרה: לאחסן קבצי ייצוא רגולטוריים (BKMV) ב־Storage bucket פרטי, ללא גישה ישירה מהלקוח. ההורדה תתבצע דרך API server-side בלבד.

## 1) יצירת bucket

ב־Supabase Dashboard:
- Storage → Create bucket
- **Name**: `regulatory-exports`
- **Public**: false (private)

## 2) גישה (Recommended)

המלצה: **לא לפתוח policies ל-client**. \n
המערכת תעלה ותוריד קבצים דרך **service role** בלבד בתוך endpoints שרת, עם בקרת הרשאות לפי `company_members.role`.\n

אם בעתיד רוצים גישה ישירה (Signed URLs), יש להוסיף policies באופן מדויק — אך זה מחוץ לסקופ הנוכחי.

## 3) Environment variables (Server)

ודא שקיים בסביבה:
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL` (או `SUPABASE_URL`)


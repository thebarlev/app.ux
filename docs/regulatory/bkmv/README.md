# BKMV (תקן 5.4) – ייצוא קובץ רישום (Income.zip)

מסמך זה מתאר את מנגנון הייצוא הרגולטורי (BKMV) בהתאם לתקן 5.4:

- הפלט הוא **ZIP בשם `Income.zip`**
- בתוך ה־ZIP קובץ יחיד: **`BKMVDATA.TXT`**
- `BKMVDATA.TXT` בנוי מ־**רשומות fixed-length** (אין מפרידי שדות)
- **Encoding**: Windows-1255
- **סיום שורה**: CRLF
- **Scope**: רק מסמכים במצב **FINAL** (כלומר `documents.document_status = 'final'`)
- **D120**: יופיע רק עבור מסמכי `receipt`

## Storage path convention

- **Bucket**: `regulatory-exports` (private)
- **Key format**:

`company_{companyId}/bkmv/YYYY/MM/bkmv_{fromDDMMYYYY}_{toDDMMYYYY}_{yyyyMMdd_HHmmss}.zip`

דוגמה:

`company_0f3c.../bkmv/2026/01/bkmv_01012026_31012026_20260112_153045.zip`

## Access control rules

### Generate (server-only)
- Endpoint: `POST /api/regulatory/bkmv/export`
- מותר רק למשתמשים שהם חברי החברה (`company_members`) עם role:
  - `owner`, `admin`, `accountant`
- הכתיבה ל־Storage מבוצעת **רק דרך service role** (server-only).

### Download (server-only)
- Endpoint: `GET /api/regulatory/bkmv/download?companyId=...&key=...`
- מותר רק לחברי החברה עם role:
  - `owner`, `admin`, `accountant`
- הקריאה ל־Storage מתבצעת בשרת דרך service role; אין גישה ישירה מהלקוח ל־bucket.

## How to use

1. ודא ש־bucket `regulatory-exports` קיים כ-private (ראה: `scripts/037-regulatory-exports-bucket-setup.md`).
2. ודא ש־`SUPABASE_SERVICE_ROLE_KEY` מוגדר בסביבה (שרת).
3. הפק קובץ:
   - `POST /api/regulatory/bkmv/export` עם:
     - `companyId` (uuid)
     - `from` (YYYY-MM-DD)
     - `to` (YYYY-MM-DD)
4. קבל `storageKey` בתגובה.
5. הורד:
   - `GET /api/regulatory/bkmv/download?companyId=...&key=...`
   - השרת יחזיר קובץ בשם `Income.zip`.

## Verification checklist (2 חברות + מניעת cross-access)

1. **Prepare**:
   - צור `companyA` ו־`companyB`.
   - צור משתמש `adminA` חבר ב־companyA עם role `admin`.
   - צור משתמש `adminB` חבר ב־companyB עם role `admin`.
   - צור מסמכי FINAL לשתי החברות בטווח תאריכים (לפחות `receipt` ו־`tax_invoice`).

2. **Generate**:
   - התחבר כ־`adminA` → הפק export ל־companyA → ודא שה־key מתחיל ב־`company_{companyA}/bkmv/...`.
   - התחבר כ־`adminB` → הפק export ל־companyB → ודא שה־key מתחיל ב־`company_{companyB}/bkmv/...`.

3. **No cross-access**:
   - התחבר כ־`adminA` ונסה לקרוא `download` עם key של companyB → מצופה **403**.

4. **Content checks**:
   - `Income.zip` מכיל **רק** `BKMVDATA.TXT`.
   - `BKMVDATA.TXT` הוא Windows-1255 + CRLF.
   - הרשומות בסדר: A100 → B100 → B110 → (מסמכים כרונולוגיים) → Z900.
   - D120 מופיע רק למסמכי `receipt`.

## Spec (Single Source of Truth)

המפרט המחייב נמצא ב:
- `docs/regulatory/bkmv/spec.md`


# Auditor — Google PSI + Suggest Setup

> **תאריך:** 2026-05-10
> **מה זה:** הוראות הפעלה ל-2 התוספים החינמיים החדשים: Google PageSpeed Insights + Google Suggest.

---

## מה הוספנו

### 1. Google PageSpeed Insights (PSI)
- **מה זה:** Google מריץ Lighthouse על האתר ומחזיר ציוני Performance / Accessibility / Best Practices / SEO + Core Web Vitals אמיתיים (LCP, CLS, INP, FCP, TBT)
- **עלות:** **חינמי לחלוטין**. 25,000 בקשות/יום עם מפתח חינמי. אצלך זה כמו אינסוף.
- **מתי רץ:** בתחילת שלב `rules` של ה-pipeline (לא ב-verification scans)
- **דורש:** `GOOGLE_PSI_API_KEY` ב-env (אם לא מוגדר, השלב מדלג בשקט)

### 2. Google Suggest
- **מה זה:** ה-API של Google שמייצר את ה-autocomplete. אנחנו לוקחים את ה-keywords העיקריים שזיהינו באתר ושואלים את Google "מה אנשים מחפשים מסביב לזה". מקבלים 5-10 הצעות אמיתיות לכל seed.
- **עלות:** **חינמי לחלוטין** ללא API key. רק rate-limited ב-IP.
- **מתי רץ:** בסוף שלב `keyword_analysis` (אחרי שזיהינו keywords עיקריים)
- **דורש:** ❌ כלום. עובד מיד.

---

## איך להפעיל את PSI

### צעד 1 — להפיק Google API Key חינמי

1. תיכנס ל: https://console.cloud.google.com
2. **Create or Select Project** — אם אין לך כבר project של Google Cloud, צור חדש (חינם, לא דורש כרטיס אשראי לAPIs חינמיים)
3. בעמוד הראשי של ה-project: **APIs & Services** → **Library**
4. חפש **"PageSpeed Insights API"** → לחץ → **Enable**
5. לאחר שה-API מופעל: **APIs & Services** → **Credentials** → **+ CREATE CREDENTIALS** → **API Key**
6. יווצר מפתח כמו: `AIzaSy...`
7. **חשוב:** לחץ על המפתח החדש שלך → **API Restrictions** → **Restrict key** → תבחר רק "PageSpeed Insights API" → **Save**
   (זה חוסם שימוש המפתח אם דולף — לא יוכל לחייב אותך על שירותים אחרים)

### צעד 2 — להוסיף ל-Vercel

1. Vercel Dashboard → הפרויקט → **Settings** → **Environment Variables**
2. **Add New:**
   - **Key:** `GOOGLE_PSI_API_KEY`
   - **Value:** המפתח שיצרת (`AIzaSy...`)
   - **Environments:** Production, Preview, Development (כולם)
3. **Save**

### צעד 3 — להוסיף לוקאלית (`.env.local`)

```env
GOOGLE_PSI_API_KEY=AIzaSy_your_key_here
```

### צעד 4 — בדיקה

הרץ סריקה אדמין על mioshy.com. ב-DB אחרי הסריקה:
```sql
SELECT artifacts->'pagespeed' AS psi_data
FROM auditor_scans
ORDER BY created_at DESC LIMIT 1;
```

צריך לראות `mobile` + `desktop` עם scores ו-cwv.

---

## על Google Suggest (אין מה להגדיר)

זה עובד מיד אחרי שתעלה את הקוד. אין API key, אין הגדרה. רק `restart pnpm dev` ותסרוק.

בדיקה ב-DB:
```sql
SELECT artifacts->'google_suggest' AS suggest_data
FROM auditor_scans
ORDER BY created_at DESC LIMIT 1;
```

תראה `entries` עם seed keywords והצעות אמיתיות.

---

## איך זה משתלב במידע שהאדמין רואה

ה-API של `/api/admin/auditor/scan/status` עכשיו מחזיר 2 שדות חדשים:
- `pagespeed` — אובייקט עם `mobile` + `desktop` (כל אחד עם `scores` ו-`cwv`)
- `google_suggest` — אובייקט עם `entries` (לכל seed יש רשימת suggestions)

ה-UI הנוכחי לא מציג אותם עדיין — נחבר ב-Tag 5 (UI redesign).

לעת עתה אפשר לראות אותם דרך API ידנית או ב-DB.

---

## עלויות צפויות

| שירות | סוג | עלות |
|---|---|---|
| **Google PSI** | API חינמי של Google | **$0** (25K queries/day rate limit, אצלך זה כמו אינסוף) |
| **Google Suggest** | Public endpoint, ללא key | **$0** (rate-limited ב-IP, אנחנו עושים רק 10 בקשות/scan) |
| **תוספת CPU ב-Vercel** | בגלל שלב PSI לוקח 5-15s | $0.001-0.003 פר scan נוסף — זניח |

**סה"כ עלות נוספת:** $0 (חוץ מהCPU הזניח של Vercel)

---

## אם אתה רוצה לבטל זמנית

- **PSI:** הסר את `GOOGLE_PSI_API_KEY` מ-env. השלב ידלג בשקט.
- **Google Suggest:** אין flag. אם תרצה אפשר להוסיף `AUDITOR_SUGGEST_ENABLED=false` בעתיד. כרגע תמיד פועל (זה חינמי).

---

## פתרון בעיות

### "PSI לא מחזיר נתונים"
1. וודא שה-`GOOGLE_PSI_API_KEY` מוגדר ב-Vercel ולוקאלית
2. וודא שה-API "PageSpeed Insights API" enabled ב-Google Cloud Console
3. בדוק לוגים: ב-DB `auditor_scan_logs` חפש `message='pagespeed:done'` או `'pagespeed:skipped'` או `'pagespeed:error'`
4. אם רואה `skipped` עם `reason: no_api_key_or_failed` — המפתח לא הגיע ל-runtime

### "Google Suggest לא מחזיר נתונים"
1. בדוק לוגים: `message='google_suggest:done'` יראה `seeds`, `suggestions`, `unique`
2. אם `unique=0`: הseeds שלך כנראה לא ביטויים נפוצים בעברית. נסה אתר אחר.
3. אם `error`: כנראה Google חסם זמנית את ה-IP שלך (rare, על rate limit). מחכים שעה ומנסים שוב.

# SECURITY-PROGRESS

מסמך מעקב לעבודת האבטחה. נגזר מ-`docs/SECURITY-WORK-ORDER.md` (v1, 6.8.2026, md5 `6692d77bc1745f565afc7c22ba2efe69`).

---

## Baseline — שלב 1

נמדד לפני שינוי קוד אחד, על ענף `security/stage-1` שנפתח מ-`feat/shaam-production-profile`.

**הערה על מיקום מסמך העבודה:** ההנחיה בצ'אט אמרה שהמסמך בשורש הריפו. בפועל הוא ב-`docs/SECURITY-WORK-ORDER.md`.
שני ערכי הבדיקה תואמים בדיוק (333 שורות, md5 `6692d77bc1745f565afc7c22ba2efe69`), ולכן זהו המסמך של הארכיטקט —
רק הנתיב שונה. המסמך עצמו אינו tracked ב-git.

### `git rev-parse HEAD`
```
542b1168db68021f9f8c4b4bf647ec75110cb476
```

### `git status --porcelain | wc -l`
```
      26
```

26 ולא 25. הפריט העשרים-ושישה הוא `docs/SECURITY-WORK-ORDER.md` עצמו, שנכלל בקבוצת `docs/*` המלוכלכת
לפי סעיף 0.2. **האינוריאנטה שנשמרת אחרי כל קומיט: 26 רשומות porcelain, ואף אחת מהן לא מקומיטת.**

רשימה מלאה:
```
 M .DS_Store
 M .gitignore
 M app/.DS_Store
 M app/api/auditor/continue/route.ts
 M app/auditor/(account)/dashboard/page.tsx
 M app/en/auditor/(account)/dashboard/page.tsx
 M lib/auditor/pipeline/continue.ts
 D public/brand/uxellent.svg
 M scripts/092-add-support-vow-system-admin.sql
?? design-mockups/
?? docs/BKMV_workplan.md
?? docs/OpenApiUserGuide.pdf
?? docs/SECURITY-WORK-ORDER.md
?? docs/SHAAM_completion_plan.md
?? docs/SHAAM_production_handoff.md
?? docs/auditor-scanflow-v3-light-FINAL.html
?? docs/cardcom-per-company-design.md
?? docs/regulatory/bkmv-section-2.6.pdf
?? docs/regulatory/bkmv-section-5.4.pdf
?? docs/regulatory/bkmv-simulator-example.pdf
?? docs/regulatory/bkmv-spec-1.31.pdf
?? docs/regulatory/hoz-24-2004-computerized-documents.pdf
?? public/brand/black.svg
?? public/brand/white-logo.svg
?? public/brand/white.svg
?? public/yitzhak.webp
```

### `npx tsc --noEmit 2>&1 | tail -40`
```
```
פלט ריק. קוד יציאה `0`. **נקי לחלוטין.**

### `npx eslint . 2>&1 | tail -40`
```
/Users/uxellent/app.ux/.claude/worktrees/youthful-elbakyan-6a8099/components/layout/DashboardChrome.tsx
  247:5  warning  Unused eslint-disable directive (no problems were reported from 'react-hooks/exhaustive-deps')

/Users/uxellent/app.ux/components/layout/DashboardChrome.tsx
  247:5  warning  Unused eslint-disable directive (no problems were reported from 'react-hooks/exhaustive-deps')

✖ 2 problems (0 errors, 2 warnings)
  0 errors and 2 warnings potentially fixable with the `--fix` option.
```
קוד יציאה `0`. שתי אזהרות, אפס שגיאות. **קיימות לפני שנגעתי — לא מתקן.**
שימו לב: אזהרה אחת מגיעה מ-`.claude/worktrees/youthful-elbakyan-6a8099/`, worktree זנוח ש-eslint סורק.
נרשם ב-`FOLLOWUPS.md`.

### `npx next build 2>&1 | tail -60`
קוד יציאה `0`. הבנייה **מצליחה**. 273 שורות פלט.

ראש הפלט:
```
  ▲ Next.js 14.2.24
  - Environments: .env.local

   Creating an optimized production build ...
Browserslist: caniuse-lite is outdated. Please run:
  npx update-browserslist-db@latest
 ⚠ Compiled with warnings

./node_modules/.pnpm/handlebars@4.7.8/node_modules/handlebars/lib/index.js
require.extensions is not supported by webpack. Use a loader instead.

Import trace for requested module:
./node_modules/.pnpm/handlebars@4.7.8/node_modules/handlebars/lib/index.js
./lib/template-engine.ts
./lib/pdf-service.ts
./lib/documents/actions.ts
```

זנב הפלט (60 שורות אחרונות) — טבלת המסלולים, מסתיים ב:
```
+ First Load JS shared by all                                  87.5 kB
  ├ chunks/31c55311-8226dedc17b3d378.js                        53.6 kB
  ├ chunks/4266-2898886cfd3a3c30.js                            31.8 kB
  └ other shared chunks (total)                                2.1 kB

○  (Static)   prerendered as static content
●  (SSG)      prerendered as static HTML (uses getStaticProps)
ƒ  (Dynamic)  server-rendered on demand
```

**אזהרות בנייה קיימות (לא מתקן):** `handlebars` `require.extensions` דרך `lib/template-engine.ts` →
`lib/pdf-service.ts`, ו-`caniuse-lite` מיושן. שתיהן קיימות ב-baseline.

### סיכום Baseline
| בדיקה | קוד יציאה | מצב |
|---|---|---|
| `tsc --noEmit` | 0 | נקי |
| `eslint .` | 0 | 2 אזהרות קיימות |
| `next build` | 0 | מצליח, עם אזהרות קיימות |

Baseline ירוק לחלוטין. **כל כשל חדש בסוף השלב הוא שלי, בלי אי-ודאות.**

---

## הערה על הענף ועל מספרי הקומיטים

העבודה נעשתה תחילה על `security/stage-1`, שנפתח מ-`feat/shaam-production-profile@542b116` לפי הוראת מסמך העבודה.
התברר ש-**`main` היה 95 קומיטים לפנינו**, ושמיזוג הענף היה גורר לפרודקשן גם את `a0889cc` (פרופיל הפרודקשן של שע"ם)
ושני תיקוני auditor שלא נסקרו כאן. לכן נפתח `security/stage-1-main` ישירות מ-`main`, ותשעת הקומיטים הועברו אליו
ב-cherry-pick (בלי אף קונפליקט).

**מספרי הקומיטים המצוטטים ברשומות שלהלן הם של הענף המקורי.** המקבילים על הענף הזה:

| משימה | ענף מקורי | הענף הזה |
|---|---|---|
| S1.1 | `508a8d9` | `07cdf47` |
| S1.2 | `f715f8b` | `6990fb6` |
| S1.3 | `c2bbe14` | `2dafa57` |
| S1.4 | `4328a34` | `876883b` |
| S1.5 | `3d95346` | `166a665` → **בוטל** ב-`3b71465`, הוחלף ב-`e46bb7e` |
| S1.6 | `2ea6c39` | `c641641` + תיקון מקורות ב-`b43ceac` |
| S1.7 | `4f2d659` | `cb54917` |

שני קומיטים נוספו רק על הענף הזה, ואינם קיימים על המקורי: `e46bb7e` (S1.5 מחדש) ו-`b43ceac` (תיקון מקורות ה-CSP).
שניהם נוצרו כי הענף המקורי היה מיושן — הפירוט ברשומות S1.5 ו-S1.6.

## S1.1 — חסימת IDOR במסלול ה-PDF
- **סטטוס:** **הושלם ואומת** (קומיט `508a8d9`). אומת ידנית ב-preview ע"י המשתמש, שלושת המקרים על **אותו בילד**.
- **קבצים:** `app/api/documents/[documentId]/pdf/route.ts` — שורות 43-52 (הערת הראש), 139-157 (השליפה)
- **מה נעשה:** השליפה של מטא-דאטת המסמך הועברה מ-`adminClient` (service role, עוקף RLS) ל-`userClient`. מדיניות `documents_select` היא עכשיו השער. `adminClient` נשאר לפעולות Storage בלבד.
- **איך אומת:** `npx tsc --noEmit` → קוד יציאה 0, פלט ריק. `grep -n adminClient` מאשר שכל שימוש שנותר הוא `.storage`. **אימות התנהגותי — דורש אימות ידני** (פירוט למטה).
- **שינוי בהתנהגות:** משתמש שמנסה מסמך של דייר אחר מקבל 404 במקום PDF. בעלים, וקוני חשבוניות חיוב, ללא שינוי.
- **הכרעה מהארכיטקט:** ההצעה המקורית שלי (בדיקת buyer-link בקוד) נדחתה לטובת מימוש נכון יותר — לתת ל-RLS להיות השער. אומת ש-`scripts/090` הוא ההגדרה האחרונה של `documents_select` ושהיא מכילה את שלושת הענפים.

### אימות ידני של S1.1 — התוצאות
בוצע ב-preview, שלושת המקרים על אותו בילד:

| מה נבדק | תוצאה | מסקנה |
|---|---|---|
| משתמש לא מחובר | **401** | התנהגות קיימת נשמרה, לא שונתה |
| משתמש של דייר אחר, אותו `documentId` | **`Document not found`** | **הדליפה חוצת-הדיירים סגורה.** זו התגובה מהענף `if (docError \|\| !doc)` — כלומר RLS לא החזירה שורה, כמתוכנן |
| הבעלים מוריד את המסמך שלו | **הצלחה, PDF ירד** | הנתיב המרכזי לא נשבר |

**מקרה שדולג במכוון:** חשבונית מנוי של לקוח auditor דרך `/auditor/invoices`. הסיבה שנתן המשתמש: **אין לקוחות משלמים, ומודול ה-auditor לא יחייב אונליין.** לכן ענף ב׳/ג׳ של `documents_select` (`billing_documents.buyer_company_id`, `auditor_subscription_charges.company_id`) **לא אומת בפועל**.
- **מה זה אומר:** אם וכאשר חיוב אונליין ל-auditor יופעל, או שתונפק חשבונית חיוב ראשונה בספרי `VOW_BILLING_COMPANY_ID` ללקוח, **יש לבדוק את ההורדה שלה לפני שמסתמכים עליה.** אם היא מחזירה 404 — הענפים הנוספים במדיניות אינם קיימים בפרודקשן, וזו רגרסיה בהורדת חשבוניות ולא באבטחה.
- נרשם ב-`FOLLOWUPS.md`.

**אזהרה שנשארת רלוונטית לכל בדיקה עתידית:** אין לבדוק עם `issue=original`. הורדת מקור מוצלחת כותבת `original_issued_at` (שורות 566-573) וזו פעולה חד-פעמית בלתי-הפיכה. לבדוק עם `issue=copy` בלבד.

## S1.2 — שערי אדמין ב-Server Actions של התבניות
- **סטטוס:** הושלם (קומיט `f715f8b`)
- **קבצים:** `app/admin/(app)/templates/actions.ts` — `getTemplateByIdAction` שורות 77-115, `updateTemplateAction` שורות 305-321 ו-346-356
- **מה נעשה:** שתי הפונקציות מחשבות `isAdmin` באותה שליפת `system_admins` שכבר קיימת ב-`deleteTemplateAction`/`duplicateTemplateAction`/`toggleTemplateActiveAction`, וחוסמות **רק** את מסלול `company_id IS NULL`.
- **איך אומת:** `npx tsc --noEmit` → 0, פלט ריק. `npx eslint <file>` → 0. `grep` מאשר ששני הקוראים היחידים הם `app/admin/(app)/templates/[id]/page.tsx:22` ו-`TemplateEditorClient.tsx:185` — שניהם בתוך אזור האדמין, כך שאין קורא דייר.
- **שינוי בהתנהגות:** משתמש רגיל שקורא ל-Action על תבנית גלובלית נדחה (`updateTemplateAction`: "לא ניתן לערוך תבניות גלובליות"; `getTemplateByIdAction`: "תבנית לא נמצאה", כדי לא לאשר קיום). עריכת תבנית של החברה עצמה — ללא שינוי. אדמין — ללא שינוי.
- **החלטה שדווחה:** בדיקת הבעלות ב-`updateTemplateAction` **לא** הורפתה לאדמינים, בשונה מ-delete/toggle, כי זו הרחבת הרשאה שלא נתבקשה. אי-העקביות מתועדת ב-`FOLLOWUPS.md`.

## S1.3 — ביטול עקיפת ה-cron
- **סטטוס:** הושלם (קומיט `c2bbe14`)
- **קבצים:** `app/api/auditor/admin/worker/run/route.ts` שורות 19-31 · `app/api/auditor/billing/process-pending/route.ts` שורות 20-33
- **מה נעשה:** נמחקו `isVercelCron` והענף שהסתמך עליו בשני הנתיבים. נשארה רק השוואת הסוד. ב-`worker/run` שני משתני הסביבה אוחדו ל-`expected` אחד (הצורה של `cron/tick`).
- **איך אומת:** 15/15 מקרי בדיקה עוברים; והרצת הלוגיקה שלפני התיקון מאשרת שהיא אישרה את אותן בקשות מזויפות. `npx tsc --noEmit` → 0.
- **שינוי בהתנהגות:** ⚠️ **ה-cron בפרודקשן מפסיק לעבוד ברגע הפריסה** עד שהסוד יוגדר. פירוט בסוף הקובץ.
- **תיקון נלווה מחויב:** הצורה הקודמת השוותה כותרת חסרה למשתנה לא-מוגדר (`"" === ""`) והייתה מאשרת בקשה בלי כותרות אם רק אחד משני המשתנים מוגדר. עקיפת ה-user-agent הסתירה זאת; אחרי הסרתה זה היה נעשה נתיב האימות החי.

## S1.4 — `create-document` לא מקבל זהות מגוף הבקשה
- **סטטוס:** הושלם (קומיט `4328a34`)
- **קבצים:** `app/api/billing/create-document/route.ts` שורות 75-83
- **מה נעשה:** בענף ה-session, `resolvedUserId`/`resolvedEmail` נגזרים מ-`auth.user` בלבד. ענף ה-API-key לא נגע.
- **איך אומת:** `npx tsc --noEmit` → 0. `git diff --stat` → קובץ אחד, 9 הוספות 2 מחיקות (בדיוק שתי השורות של ענף ה-session). מלאי קוראים: אין קורא בריפו שמשתמש בענף ה-session; `scripts/billing-smoke-test.sh:87,146` שולח `x-api-key` בלבד.
- **שינוי בהתנהגות:** משתמש מחובר לא יכול יותר להנפיק חשבונית-קבלה על שם אחר. מי שאין לו אימייל בסשן יקבל שגיאת ולידציה במקום להשלים מהגוף.
- **לא נגעתי:** `amount`/`currency` — מתועד ב-`FOLLOWUPS.md` מול הדפוס ב-`checkout/create/route.ts:45-58`.

## S1.5 — `x-auditor-scan-guest` — **נעשה מחדש מול `main`**
- **סטטוס:** הושלם בגרסה מתוקנת. הניסוח המקורי (`3d95346`, שהועבר כ-`166a665`) **בוטל** ב-`3b71465`, והתיקון הנכון הוא `e46bb7e`.
- **קבצים:** `lib/supabase/proxy.ts` — `forwardedHeaders()` חדשה, ושלושת אתרי ה-`NextResponse.next` (שורות 26-28, 44-46, 67-69). `app/en/auditor/(account)/layout.tsx` — **חזר למקור**, ממשיך לסמוך על הכותרת.
- **למה הניסוח הראשון היה שגוי:** הוא הסתמך על כך שאין כותב בתוך האפליקציה — `proxy.ts` בשם של Next 15.5+, ש-`next@14.2.24` לא אורז, ולכן `updateSession` לא רץ. זה היה נכון **רק** לענף `feat/shaam-production-profile`, שהיה 95 קומיטים מאחורי `main`. ב-`main` הקובץ הוא `middleware.ts` שמייצא `middleware` — שינוי שנעשה בדיוק כדי לתקן את הבאג הזה — וה-build מראה `ƒ Middleware 72.2 kB`. כלומר ה-middleware **כן** קובע את הכותרת, בעבור פיצ'ר אמיתי: תצוגת האורח ב-`/en/auditor/dashboard?scan_id=&token=`. הסרת האמון שברה אותו.
- **איפה החור באמת היה:** בדיקת האימות של ה-middleware מכסה רק את הנתיבים המדויקים `/en/auditor/dashboard` ו-`/en/auditor/checkout`, בעוד ה-layout של `(account)` שומר על **ארבעה**: `dashboard`, `invoices`, `settings`, `subscription`. לכן כותרת מזויפת הגיעה לשלושת האחרונים. ב-`dashboard` היא לא עזרה, כי ה-middleware מפנה ללוגין לפני שה-layout רץ.
- **מה נעשה בסוף:** להפוך את הכותרת ל**בלתי-ניתנת-לזיוף** במקום ל**לא-נאמנת**. `updateSession` מעביר כל בקשה דרך `forwardedHeaders()`, שמוחקת את הכותרת **ראשונה, בלי תנאי, ובכל נתיב** — לא רק תחת `/en/auditor`, כדי שהחור לא יחזור בנתיב הבא שיתווסף. ענף האורח בונה על אותה פונקציה, ולכן ה-`"1"` שלו הוא המקור היחיד האפשרי. שום התנהגות אחרת ב-`updateSession` לא נגעה.
- **למה per-call ולא פעם אחת בראש הפונקציה:** `request.cookies.set()` מעדכן את כותרת ה-cookie של הבקשה, ורענון הסשן של Supabase מסתמך על כך שהערך המעודכן הוא זה שמועבר. העתקה אחת בראש הפונקציה הייתה מקפיאה cookies ישנים.
- **איך אומת:** 8/8 מקרי זרימת-כותרת עוברים — כותרת מזויפת אינה שורדת באף אחד מארבעת הנתיבים השמורים ולא בנתיב אחר, ובמקביל קישור האורח האמיתי עדיין מקבל `"1"`. `tsc` → 0, `eslint` → 0, `next build` → 0 עם חבילת Middleware חיה ובלי אזהרות חדשות.
- **שינוי בהתנהגות:** מי ששלח את הכותרת בעצמו מקבל עכשיו redirect ללוגין ב-`invoices`/`settings`/`subscription`. תצוגת האורח דרך קישור סריקה — ללא שינוי.
- **מה דווח ולא תוקן:** ה-middleware קובע את הדגל לפי **נוכחות** `scan_id` ו-`token` בלבד, בלי לאמת את הטוקן. האימות האמיתי קיים במורד הזרם ב-`/api/auditor/status:49`, ולכן צמד מזויף אינו מקבל נתונים — אבל הדגל לבדו אינו מעיד על טוקן תקף. ב-`FOLLOWUPS.md`.

## S1.6 — כותרות אבטחה
- **סטטוס:** הושלם (קומיט `2ea6c39`)
- **קבצים:** `next.config.mjs` שורות 1-50 (חדש: `cspReportOnly`, `securityHeaders`, `headers()`)
- **מה נעשה:** נוספו חמש הכותרות שלא שוברות כלום, ו-CSP ב-**Report-Only בלבד**.
- **איך אומת:** ייבוא הקונפיג ב-node מאשר שכל שש הכותרות נפלטות על `/:path*`, שאין `Content-Security-Policy` אוכפת, ושה-`ignoreBuildErrors: false` נשמר. `npx next build` → 0, בלי אזהרות חדשות מול baseline. `tsconfig strict: true` ללא שינוי.
- **שינוי בהתנהגות:** כל תגובה נושאת את הכותרות. הדפדפן ידווח על הפרות CSP **לקונסולה בלבד**.
- **מקורות חיצוניים שנמצאו בקוד (מעודכן מול `main` בקומיט `b43ceac`):** googletagmanager — **רק** `gtag.js` של `G-VRWRQ29QBW`, אין מכולת GTM (בוטלה ב-`7568b98`) · **פיקסל Meta** — `connect.facebook.net` לסקריפט ו-`www.facebook.com` לאירועים, מ-`lib/analytics/meta-pixel.ts` · PostHog (`NEXT_PUBLIC_POSTHOG_HOST`, ברירת מחדל `us.i.posthog.com`) · Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) · `*.supabase.co` · `va.vercel-scripts.com` (`@vercel/analytics`).
- **תיקון:** רשימת המקורות הראשונה נגזרה מ-`app/layout.tsx` בענף שהיה 95 קומיטים מאחורי `main`, ולכן החסירה את הפיקסל והכילה `frame-src` ל-GTM שאין לו iframe. תוקן ב-`b43ceac`. מכיוון שהמדיניות היא Report-Only, אף אחת מהשתיים לא יכלה לשבור עמוד.
- **מה במכוון לא ב-CSP:** `PDF_RENDER_URL` (`lib/pdf-service.ts:2847`) ו-`api.ipify.org` — קריאות צד-שרת ש-CSP לא חל עליהן. `secure.cardcom.solutions` נשמר ב-`form-action`/`frame-src` בלבד, כי כל השימושים בו הם server-to-server מ-`app/api/**`.
- **על `X-Frame-Options: SAMEORIGIN`:** נבדק. כל ה-iframes של תצוגת מסמך טוענים נתיב יחסי `/api/documents/**/pdf` (same-origin), וב-`main` אין ב-layout שום iframe של צד-שלישי. הכותרת מגבילה מי מטמיע **אותנו**, לא את מי שאנחנו מטמיעים. לא נמצא שימוש שמצריך הטמעה חוצה-מקורות.
- **מגבלה שחייבת להיאמר:** אין `report-to`/`report-uri`, ולכן ההפרות אינן נאספות לשום מקום. **עד שיחובר endpoint איסוף, אין כאן מקור נתונים** — יש רק היעדר סיכון.

## S1.7 — זיהוי IP אמיתי בהגבלת הקצב
- **סטטוס:** הושלם (קומיט `4f2d659`)
- **קבצים:** `lib/security/rate-limit.ts` שורות 15-54
- **מה נעשה:** סדר העדיפות הוא `x-vercel-forwarded-for` → `x-real-ip` → הערך ה**אחרון** ב-`x-forwarded-for` (ולא הראשון).
- **איך אומת:** 6/6 מקרי עדיפות עוברים; הרצה משווה מראה שהקוד הקודם החזיר דלי חדש לכל סבב כותרת מזויפת בעוד החדש נצמד ל-hop האמיתי. `npx tsc --noEmit` → 0. חתימת הפונקציה לא שונתה, ולכן אף אחד מ-24 מקומות הקריאה לא נגע.
- **מה בחרתי ולמה:** לפי התיעוד של Vercel, `x-vercel-forwarded-for` זהה ל-`x-forwarded-for` אבל הוא זה ש**נשאר תקף אם פרוקסי מעל Vercel דורס** את `x-forwarded-for`. לכן הוא ראשון.
- **תיקון להנחה שבמשימה:** לפי אותו תיעוד, Vercel **דורס** את `x-forwarded-for` ואינו מעביר IP חיצוניים, במפורש כדי למנוע spoofing. לכן החשיפה בפועל בפרודקשן הייתה קטנה ממה שהמשימה מתארת. השינוי הוא הגנה לעומק, ותקף מקומית או מאחורי פרוקסי אחר.
- **מגבלה שתועדה ולא תוקנה:** המונה נשאר `Map` per-instance. **הגבלת הקצב אינה הגנה אמיתית גם אחרי התיקון.** ב-`FOLLOWUPS.md`.

---

## ⚠️ נדרש ממך ב-Vercel לפני/עם הפריסה — S1.3

**ברגע שהשינוי נפרס, ה-cron `*/2 * * * *` ב-`vercel.json` יפסיק לעבוד עד שהסוד יוגדר.**
אני לא נגעתי ב-`vercel.json` ולא במשתני סביבה.

| מה | ערך |
|---|---|
| הכותרת שהקוד מצפה לה | `Authorization: Bearer <secret>` (זו שקרון של Vercel שולח), או `x-auditor-worker-secret: <secret>` |
| משתנה שהפלטפורמה צריכה | `CRON_SECRET` — כשהוא מוגדר, Vercel Cron מוסיף אוטומטית `Authorization: Bearer <CRON_SECRET>` |
| משתנה שהקוד משווה אליו | `AUDITOR_WORKER_SECRET` **או** `AUDITOR_CRON_SECRET` |
| פורמט הערך | מחרוזת אטומה אחת, בלי רווחים ובלי הקידומת `Bearer`. מומלץ ≥32 תווים random hex/base64url |
| **הדבר הקריטי** | `CRON_SECRET` ו-`AUDITOR_CRON_SECRET` חייבים להיות **אותו ערך בדיוק**. הקוד לא קורא את `CRON_SECRET`; הוא משווה מול ה-`AUDITOR_*` |
| מה צריך להשתנות ב-`vercel.json` | **כלום.** `crons` לא תומך בכותרות מותאמות, ולכן מסלול ה-Bearer הוא המסלול. ה-`path` וה-`schedule` נשארים |
| כשהסוד חסר | `checkSecret` מחזיר `false` ומחזיר 401 — נכשל-סגור, מכוון |
| `process-pending` | לא מתוזמן ב-`vercel.json` בכלל. הסוד שלו נפרד: `AUDITOR_BILLING_CRON_SECRET` (או `BILLING_CRON_SECRET` מחוץ לפרודקשן), נקרא דרך `getAuditorBillingConfig().cronSecret`, ומושווה מול `x-cron-secret` או Bearer |

**שינוי משתני סביבה מחייב פריסה מחדש** — deployment שרץ שומר את תצלום משתני הסביבה מזמן הבנייה.

---

## Baseline סופי — השוואה

| בדיקה | Baseline | סוף השלב | מצב |
|---|---|---|---|
| `git rev-parse HEAD` | `542b116` | `4f2d659` | 7 קומיטים (S1.1 עדיין לא מאומת התנהגותית) |
| `git status --porcelain \| wc -l` | 26 | 28 | 26 המקוריים + `SECURITY-PROGRESS.md` + `FOLLOWUPS.md` |
| `npx tsc --noEmit` | 0, ריק | 0, ריק | זהה |
| `npx eslint .` | 0, 2 אזהרות | 0, 2 אזהרות | `diff` → זהה לחלוטין |
| `npx next build` | 0, 273 שורות | 0, 273 שורות | `diff` על אזהרות/שגיאות → אין חדשות. 184 מסלולים בשניהם |

**אין אף כשל חדש.** 26 הקבצים המלוכלכים לא נגעו — נאמת אחרי כל אחד משבעת הקומיטים.


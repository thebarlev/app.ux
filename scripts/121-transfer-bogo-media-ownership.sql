-- ═══════════════════════════════════════════════════════════════════════════
--  121 — העברת הבעלות על "בוגו מדיה בע״מ"  ·  שלב 1.5ג׳
--  שלוש עסקאות. אין מחיקה של אף חברה. כל עסקה הפיכה במלואה.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  היעד: itzikbab יהיה הבעלים היחיד של 4ae68334; support יישאר אדמין בלבד
--  וללא אף חברה; itzikbab יישאר עם חברה אחת בדיוק.
--
--  4ae68334-15a0-4fa3-a9ba-fd77deccc95d  "בוגו מדיה בע״מ" · 145 מסמכים · היעד
--  be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed  כפילות ריקה · **מנותקת, לא נמחקת**
--  d9186573-a7d5-46f9-90da-a05c4b762b47  itzikbab@gmail.com · הבעלים החדש
--
--  ⚠️⚠️  אזהרה תפעולית — עד שחסימת ה-auditor נכנסת:  ⚠️⚠️
--  ⚠️⚠️  support אינו נוגע ב-/auditor בכלל.                ⚠️⚠️
--
--  הסיבה: אחרי עסקה 3 ל-support אין אף חברה, ואימייל 4ae68334 נשאר
--  support@uxellent.com. שליחת טופס ההרשמה של ה-auditor
--  (app/auditor/register/AuditorRegisterClient.tsx:132 → bootstrap-company)
--  תריץ resolveCanonicalAuditorCompany עם האימייל שלו, ההתאמה לפי מזהה
--  משתמש תחזיר ריק, הפתרון ייפול להתאמה לפי companies.email, וימצא את
--  4ae68334 — ואז bootstrap-company/route.ts:119 יריץ
--  `update companies set auth_user_id = user.id` ויוסיף שורת חברוּת בתפקיד
--  owner. **ההעברה תתבטל מעצמה, בשקט, בלי שגיאה.** אין בדיקת system_admins
--  בכל הנתיב הזה.
--  מיטיגציה חלקית שקיימת כבר: דפי הדשבורד של ה-auditor מפנים אדמין מערכת
--  ל-/admin/auditor/scans (app/auditor/(account)/dashboard/page.tsx:50 ו-en:85),
--  ולכן ביקור פסיבי בדשבורד אינו מפעיל את המסלול. מה שכן מפעיל אותו הוא
--  **שליחת טופס ההרשמה** ב-/auditor/register.
--  אם זה קרה — בדיקת מצב-היעד שבתחתית הקובץ תתפוס זאת, ועסקאות 2 ו-3
--  צריכות לרוץ שוב.
--
--  ⚠️  121-PREFLIGHT.sql חייב לרוץ קודם, והפלט שלו שמור.  ⚠️
--
--  הביטולים ב-121-ROLLBACK.sql, אחד לכל עסקה בנפרד.
--
-- ── מנתקים ולא מוחקים ────────────────────────────────────────────────────────
--  הדרישה היא ש-itzikbab לא יחזיק שתי חברות. ניתוק משיג זאת במלואו.
--  DELETE עם CASCADE על 30 טבלאות היה הפעולה היחידה בכל הפרויקט שאינה הפיכה,
--  והשחזור שלה הוא יצירה מחדש עם created_at חדש ומנוי ניסיון חדש — כלומר לא
--  שחזור. אין סיבה לקחת את הסיכון הזה כדי להשיג משהו ששתי שורות הפיכות משיגות.
--  החברה הריקה נשארת כזבל, לצד חברות test אחרות שכבר קיימות. ניקוי הזבל הוא
--  משימה נפרדת בסיכון נמוך, ואין לערבב אותה עם העברת בעלות על 145 מסמכים.
--
-- ── auth_user_id = null הוא מצב חוקי — נבדק, לא הונח ──────────────────────────
--  1. הסכימה מגדירה אותו כך במפורש: scripts/001:16 הוא
--     `auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL` — כלומר
--     המסד עצמו מאפס אותו כשמשתמש נמחק. להשוואה, scripts/001:49 הוא
--     `NOT NULL` על system_admins, שם זה כן נדרש.
--  2. האפליקציה כותבת null בעצמה: lib/auditor/billing/process-indicator-event.ts:293
--     מבצע INSERT של חברה חדשה עם `auth_user_id: null`. זה מסלול חי בזרימת
--     החיוב של ה-auditor, ולכן חברות חסרות בעלים כבר קיימות בפרודקשן.
--  3. כל 60+ הקריאות הן `.eq("auth_user_id", <uuid>)`, ו-NULL אינו שווה ל-uuid
--     בשום השוואה — כולל user_company_ids() (scripts/006:218). שורה חסרת בעלים
--     פשוט לא נכללת בתוצאות. אין קריסה.
--  4. שני המקומות היחידים שקוראים את הערך עצמו מטפלים ב-null במפורש:
--     app/admin/(app)/auditor/clients/page.tsx:18 מטפס אותו `string | null`,
--     :159 מסנן `.filter((v): v is string => !!v)`, :179 עושה `|| ""`,
--     ו-clients/actions.ts:54,99,106 בודקים `typeof === "string"`.
--     lib/types/admin.ts:13 מגדיר אותו `string | null`.
--
-- ── מה במפורש לא נעשה כאן ────────────────────────────────────────────────────
--  * companies.email של 4ae68334 לא נוגע. הוא מרונדר ל-PDF כ-company_email
--    (lib/pdf-service.ts:1739,1876) והעתקים נאמנים נבנים מנתונים חיים, ולכן
--    שינוי היה משנה את האימייל שעל העתקים של 145 המסמכים שהונפקו.
--  * מזהה החברה אינו משתנה, ולכן כל המקומות שמקבעים את 4ae68334
--    (app/api/auditor/billing/subscription/status/route.ts:10,
--     lib/subscription-unlimited.ts:12, lib/auditor/billing/env.ts:22,
--     scripts/064:37, 075:483, 091:31, 093:18) ממשיכים להצביע על אותה חברה.
--    נרשם כאן כדי שלא ייחשב חוב בעתיד: אין שם חוב.
--  * מדיניות ה-RLS של האדמין על documents אינה נוגעת. זה שלב 1.5ד׳.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- עסקה 1 — ניתוק מ-be2ed4f5 והצמדה ל-4ae68334, באותה עסקה
-- ═══════════════════════════════════════════════════════════════════════════
-- שלוש הפקודות חייבות לרוץ יחד. הסיבה: אם הניתוק וההצמדה יופרדו, נפתח חלון
-- שבו ל-itzikbab יש אפס חברות או שתיים, ושני המצבים רעים:
--
--   * אפס חברות — app/dashboard/layout.tsx:21-24 הוא
--     `try { await getCompanyIdForUser() } catch { redirect("/register") }`,
--     כלומר סשן פתוח שנכנס לדשבורד נזרק לטופס ההרשמה ועלול לייצר חברה
--     שלישית עם אותו ח.פ.
--   * שתי חברות — getCompanyIdForUser() ב-lib/document-helpers.ts:73 מחזיר
--     Array.from(companyIds)[0] מ-Set שנבנה משתי שאילתות בלי ORDER BY, כלומר
--     או-זו-או-זו ואפילו לא עקבי בין קריאות. מסמך שיונפק בחלון כזה עלול
--     להיכתב על החברה הריקה ולפתוח בה רצף מספור חדש, ובגלל טריגרי האי-שינוי
--     זה לא משהו שמתקנים אחר כך.
--
-- בתוך עסקה אחת אין חלון כזה כלל: מכל סשן אחר המעבר אטומי.
-- ה-INSERT אידמפוטנטי. אין status ב-INSERT — העמודה אינה בסכימה שבקבצים
-- (scripts/006:11-23). אם בדיקה 7 הראתה שהיא קיימת NOT NULL בלי default —
-- עצור, ה-INSERT ייכשל.

begin;

-- 1א. הסרת החברוּת של itzikbab בחברה הריקה
delete from public.company_members
where company_id = 'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid
  and user_id = 'd9186573-a7d5-46f9-90da-a05c4b762b47'::uuid;

-- 1ב. ניתוק הבעלוּת על החברה הריקה
update public.companies
set auth_user_id = null
where id = 'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid;

-- 1ג. הצמדת itzikbab לחברה האמיתית
insert into public.company_members (company_id, user_id, role)
values (
  '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid,
  'd9186573-a7d5-46f9-90da-a05c4b762b47'::uuid,
  'owner'
)
on conflict (company_id, user_id) do update set role = 'owner';

commit;

-- אימות עסקה 1 — מצופה: שורה אחת בדיוק, 4ae68334, source = member.
-- אם מופיעה גם be2ed4f5 — הניתוק לא תפס. אם אין אף שורה — ההצמדה לא תפסה.
select c.id, c.company_name,
       case when c.auth_user_id = 'd9186573-a7d5-46f9-90da-a05c4b762b47'::uuid
            then 'owner' else 'member' end as how
from public.companies c
where c.id in (
  select company_id from public.company_members
  where user_id = 'd9186573-a7d5-46f9-90da-a05c4b762b47'::uuid
)
or c.auth_user_id = 'd9186573-a7d5-46f9-90da-a05c4b762b47'::uuid;

-- ואימות שהחברה הריקה נותרה קיימת וחסרת בעלים — מצופה: auth_user_id ריק, 0 חברים.
select id, company_name, email, auth_user_id,
       (select count(*) from public.company_members m where m.company_id = c.id) as members
from public.companies c
where id = 'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid;


-- ═══════════════════════════════════════════════════════════════════════════
-- עסקה 2 — companies.auth_user_id של 4ae68334 עובר ל-itzikbab
-- ═══════════════════════════════════════════════════════════════════════════
-- זה ה-UPDATE שמפעיל את trigger_enforce_company_registration_number_checksum
-- (scripts/050:82, רץ BEFORE INSERT OR UPDATE). בדיקה 3 ב-PREFLIGHT הוכיחה
-- שהוא עובר. אם היא לא רצה — אל תריץ את זה.
--
-- מכאן: ל-itzikbab החברה גם דרך בעלוּת וגם דרך חברוּת. ל-support נשארת
-- חברוּת בלבד. לכל אחד חברה אחת. מצב תקין.

begin;

update public.companies
set auth_user_id = 'd9186573-a7d5-46f9-90da-a05c4b762b47'::uuid
where id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid;

commit;

-- אימות עסקה 2 — מצופה: owner_login_email = itzikbab@gmail.com,
-- ו-company_email נשאר support@uxellent.com, כמתוכנן.
select c.id, c.email as company_email, c.auth_user_id, u.email as owner_login_email
from public.companies c
left join auth.users u on u.id = c.auth_user_id
where c.id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid;


-- ═══════════════════════════════════════════════════════════════════════════
-- עסקה 3 — הסרת שורת company_members של support מ-4ae68334
-- ═══════════════════════════════════════════════════════════════════════════
-- אחרי זה ל-support לא תישאר אף חברה, והוא אדמין מערכת בלבד — זה היעד.
-- המחיקה לפי תת-שאילתה על האימייל ולא לפי UUID מקובע; בדיקה 5 ב-PREFLIGHT
-- חייבת להראות בדיוק שורה אחת, אחרת המחיקה עלולה לא לתפוס כלום.
--
-- ⚠️ מיד אחרי זה: support אינו יכול להיכנס דרך /login, ופתיחת /dashboard
--    תזרוק אותו ל-/register. הוא משתמש ב-/admin/login בלבד. ראה את הדוח.

begin;

delete from public.company_members
where company_id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid
  and user_id in (
    select id from auth.users where lower(email) = 'support@uxellent.com'
  );

commit;

-- אימות עסקה 3 — מצופה: שורה אחת בלבד, itzikbab, owner.
select m.user_id, u.email, m.role
from public.company_members m
join auth.users u on u.id = m.user_id
where m.company_id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid;

-- ול-support — מצופה: 0, 0, true.
select
  (select count(*) from public.company_members m where m.user_id = u.id) as support_memberships_must_be_zero,
  (select count(*) from public.companies c where c.auth_user_id = u.id)  as support_owned_must_be_zero,
  exists (select 1 from public.system_admins sa where sa.auth_user_id = u.id) as is_system_admin_must_be_true
from auth.users u
where lower(u.email) = 'support@uxellent.com';


-- ═══════════════════════════════════════════════════════════════════════════
-- אימות מצב היעד
-- ═══════════════════════════════════════════════════════════════════════════
-- מצופה: שורה אחת בלבד — 4ae68334, 145 מסמכים, בעלים itzikbab, חבר אחד,
-- ואימייל החברה עדיין support@uxellent.com.
select
  c.id, c.company_name, c.email as company_email,
  u.email as owner_login_email,
  (select count(*) from public.documents d where d.company_id = c.id) as documents,
  (select count(*) from public.company_members m where m.company_id = c.id) as members
from public.companies c
left join auth.users u on u.id = c.auth_user_id
where c.auth_user_id = 'd9186573-a7d5-46f9-90da-a05c4b762b47'::uuid
   or c.id in (
     select company_id from public.company_members
     where user_id = 'd9186573-a7d5-46f9-90da-a05c4b762b47'::uuid
   );

-- ⚠️ support חייב להיות לא-בעלים ולא-חבר של 4ae68334. שתי העמודות = false.
-- הרץ את זה שוב בכל פעם שיש חשד ש-support נגע ב-/auditor: אם אחת מהן חזרה
-- ל-true, מסלול ההצמדה לפי אימייל (בדיקה 7א) ביטל את ההעברה, ויש להריץ
-- מחדש את עסקאות 2 ו-3.
select
  u.email,
  exists (select 1 from public.companies c
          where c.id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid
            and c.auth_user_id = u.id) as support_is_owner_must_be_false,
  exists (select 1 from public.company_members m
          where m.company_id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid
            and m.user_id = u.id) as support_is_member_must_be_false
from auth.users u
where lower(u.email) = 'support@uxellent.com';

-- והחברה הריקה — קיימת, חסרת בעלים, ללא חברים. זבל מנוטרל, לא נמחק.
select id, company_name, email, auth_user_id,
       (select count(*) from public.company_members m where m.company_id = c.id) as members
from public.companies c
where id = 'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid;

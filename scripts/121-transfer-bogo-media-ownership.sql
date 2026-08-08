-- ═══════════════════════════════════════════════════════════════════════════
--  121 — העברת הבעלות על "בוגו מדיה בע״מ"  ·  שלב 1.5ג׳
-- ═══════════════════════════════════════════════════════════════════════════
--
--  היעד: itzikbab יהיה הבעלים היחיד של 4ae68334; support יישאר אדמין בלבד
--  וללא אף חברה; itzikbab יישאר עם חברה אחת בדיוק.
--
--  4ae68334-15a0-4fa3-a9ba-fd77deccc95d  "בוגו מדיה בע״מ" · 145 מסמכים · נשארת
--  be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed  כפילות ריקה · נמחקת
--  d9186573-a7d5-46f9-90da-a05c4b762b47  itzikbab@gmail.com · הבעלים החדש
--
--  ⚠️  121-PREFLIGHT.sql חייב לרוץ קודם, והפלט שלו שמור.  ⚠️
--  בלי צילום be2ed4f5 מבדיקה 2 אין דרך לשחזר את צעד א׳.
--
--  הביטולים נמצאים ב-121-ROLLBACK.sql, אחד לכל צעד בנפרד.
--
-- ── מה במפורש לא נעשה כאן ────────────────────────────────────────────────────
--  * companies.email של 4ae68334 לא נוגע. הוא מרונדר לתוך ה-PDF כמשתנה
--    company_email (lib/pdf-service.ts:1739,1876), והעתקים נאמנים נבנים
--    מנתונים חיים — שינוי שלו היה משנה את האימייל שמופיע על העתקים של
--    145 המסמכים שכבר הונפקו. הבעלות נשענת על auth_user_id ועל
--    company_members, לא על האימייל, ולכן שינוי שלו אינו נדרש כלל.
--  * מזהה החברה אינו משתנה. ולכן — נרשם כאן כדי שלא ייחשב חוב בעתיד —
--    כל המקומות שמקבעים את 4ae68334 בקוד
--    (app/api/auditor/billing/subscription/status/route.ts:10,
--     lib/subscription-unlimited.ts:12, lib/auditor/billing/env.ts:22,
--     scripts/064:37, 075:483, 091:31, 093:18) ממשיכים להצביע על אותה חברה
--    ואינם דורשים שינוי. אין כאן חוב טכני. הקיבוע נוגע למזהה החברה, ואנחנו
--    משנים רק מי רשום כבעליה.
--  * מדיניות ה-RLS של האדמין על documents אינה נוגעת. זה שלב 1.5ד׳.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- צעד א׳ — מחיקת החברה הריקה be2ed4f5
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ הצעד היחיד בתוכנית שאינו הפיך. ה-ROLLBACK שלו הוא יצירה מחדש מהצילום,
--    לא שחזור: created_at יהיה חדש, והטריגר trigger_create_trial_subscription
--    ייצור מנוי ניסיון חדש עם תאריכים חדשים.
--
-- מה נמחק בשרשרת (ON DELETE CASCADE): המנוי שנוצר אוטומטית, usage_monthly,
-- שורת company_members של itzikbab, ועוד 27 טבלאות — כולן ריקות עבור החברה
-- הזאת לפי בדיקה 2.
-- מה יחסום: רק billing_documents (RESTRICT ×2). בדיקה 2 חייבת להראות 0.
--
-- מדוע דווקא ראשון: כל עוד be2ed4f5 קיימת, ברגע שנוסיף את itzikbab ל-4ae68334
-- (צעד ב׳) יהיו לו שתי חברות, ואז getCompanyIdForUser() ב-
-- lib/document-helpers.ts:73 מחזיר Array.from(companyIds)[0] מ-Set שנבנה
-- משתי שאילתות בלי ORDER BY — כלומר או-זו-או-זו, ואפילו לא עקבי בין קריאות.
-- מסמך שיונפק בחלון הזה עלול להיכתב על החברה הריקה ולפתוח בה רצף מספור חדש,
-- ובגלל טריגרי האי-שינוי זה לא משהו שמתקנים אחר כך.

begin;

delete from public.companies
where id = 'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid;

commit;

-- אימות צעד א׳ — מצופה: אפס שורות.
select id, company_name, email
from public.companies
where id = 'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid;

-- ואימות של-itzikbab אין כרגע אף חברה — מצופה: 0.
-- זה החלון שבו הוא בלי חברה. ראה את האזהרה התפעולית בדוח.
select count(*) as itzikbab_companies_now_zero
from public.company_members
where user_id = 'd9186573-a7d5-46f9-90da-a05c4b762b47'::uuid;


-- ═══════════════════════════════════════════════════════════════════════════
-- צעד ב׳ — itzikbab נכנס ל-company_members של 4ae68334 בתפקיד owner
-- ═══════════════════════════════════════════════════════════════════════════
-- אידמפוטנטי: אם השורה קיימת, התפקיד מתעדכן ל-owner ולא נזרקת שגיאה.
-- אין status ב-INSERT — העמודה אינה קיימת בסכימה שבקבצים (scripts/006:11-23).
-- אם בדיקה 7 הראתה שהיא קיימת, NOT NULL ובלי ברירת מחדל — עצור, ה-INSERT ייכשל.
--
-- מכאן ועד סוף צעד ד׳ שני המשתמשים חברים ב-4ae68334. זה תקין: לכל אחד מהם
-- עדיין חברה אחת בלבד, ולכן אין את אי-הדטרמיניזם של getCompanyIdForUser.

begin;

insert into public.company_members (company_id, user_id, role)
values (
  '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid,
  'd9186573-a7d5-46f9-90da-a05c4b762b47'::uuid,
  'owner'
)
on conflict (company_id, user_id) do update set role = 'owner';

commit;

-- אימות צעד ב׳ — מצופה: שתי שורות, itzikbab ו-support, שניהם owner.
select m.user_id, u.email, m.role
from public.company_members m
join auth.users u on u.id = m.user_id
where m.company_id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid
order by u.email;


-- ═══════════════════════════════════════════════════════════════════════════
-- צעד ג׳ — companies.auth_user_id של 4ae68334 עובר ל-itzikbab
-- ═══════════════════════════════════════════════════════════════════════════
-- זה ה-UPDATE שמפעיל את trigger_enforce_company_registration_number_checksum.
-- בדיקה 3 ב-PREFLIGHT הוכיחה שהוא עובר. אם היא לא רצה — אל תריץ את זה.
--
-- auth_user_id הוא מה ש-user_company_ids() קורא בענף הבעלות (scripts/006:218),
-- ולכן מכאן והלאה 4ae68334 נחשבת לחברה של itzikbab גם ללא שורת החברות.

begin;

update public.companies
set auth_user_id = 'd9186573-a7d5-46f9-90da-a05c4b762b47'::uuid
where id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid;

commit;

-- אימות צעד ג׳ — מצופה: owner_login_email = itzikbab@gmail.com,
-- ו-email של החברה נשאר support@uxellent.com, כמתוכנן.
select c.id, c.email as company_email, c.auth_user_id, u.email as owner_login_email
from public.companies c
left join auth.users u on u.id = c.auth_user_id
where c.id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid;


-- ═══════════════════════════════════════════════════════════════════════════
-- צעד ד׳ — הסרת שורת company_members של support מ-4ae68334
-- ═══════════════════════════════════════════════════════════════════════════
-- אחרי הצעד הזה ל-support לא תישאר אף חברה, והוא אדמין מערכת בלבד — זה היעד.
-- המחיקה לפי תת-שאילתה על האימייל, ולא לפי UUID מקובע. בדיקה 5 ב-PREFLIGHT
-- חייבת להראות בדיוק שורה אחת, אחרת המחיקה עלולה לא לתפוס כלום.
--
-- ⚠️ מיד אחרי הצעד הזה — קרא את "אחרי צעד ד׳" בדוח. support לא יוכל להיכנס
--    דרך /login, ו-/dashboard מפנה אותו ל-/register. הוא חייב להשתמש
--    ב-/admin/login מכאן והלאה.

begin;

delete from public.company_members
where company_id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid
  and user_id in (
    select id from auth.users where lower(email) = 'support@uxellent.com'
  );

commit;

-- אימות צעד ד׳ — מצופה: שורה אחת בלבד, itzikbab, owner.
select m.user_id, u.email, m.role
from public.company_members m
join auth.users u on u.id = m.user_id
where m.company_id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid;

-- אימות ל-support — מצופה: אפס חברות, ו-is_system_admin = true.
select
  (select count(*) from public.company_members m
     where m.user_id = u.id) as support_memberships_must_be_zero,
  (select count(*) from public.companies c
     where c.auth_user_id = u.id) as support_owned_companies_must_be_zero,
  exists (select 1 from public.system_admins sa where sa.auth_user_id = u.id) as is_system_admin_must_be_true
from auth.users u
where lower(u.email) = 'support@uxellent.com';


-- ═══════════════════════════════════════════════════════════════════════════
-- אימות סופי — מצב היעד
-- ═══════════════════════════════════════════════════════════════════════════
-- מצופה: שורה אחת בלבד. חברה אחת, 145 מסמכים, בעלים itzikbab, חבר אחד.
select
  c.id,
  c.company_name,
  c.email as company_email,
  u.email as owner_login_email,
  (select count(*) from public.documents d where d.company_id = c.id) as documents,
  (select count(*) from public.company_members m where m.company_id = c.id) as members
from public.companies c
left join auth.users u on u.id = c.auth_user_id
where c.auth_user_id = 'd9186573-a7d5-46f9-90da-a05c4b762b47'::uuid
   or c.id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid;

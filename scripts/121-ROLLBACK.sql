-- ═══════════════════════════════════════════════════════════════════════════
--  121 ROLLBACK — ביטול לכל צעד בנפרד  ·  שלב 1.5ג׳
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ארבעה ביטולים עצמאיים. הרץ **רק** את זה שמתאים לצעד שנכשל.
--  אם צריך לבטל כמה צעדים, הרץ אותם בסדר הפוך: ד׳ ← ג׳ ← ב׳ ← א׳.
--
--  ⚠️  ביטול צעד א׳ אינו שחזור.  ⚠️
--  מחיקת חברה עם CASCADE אינה הפיכה. הביטול שלמטה יוצר חברה חדשה עם אותו
--  מזהה מהצילום שנשמר, אבל created_at יהיה חדש, והטריגר
--  trigger_create_trial_subscription_for_company ייצור מנוי ניסיון חדש עם
--  תאריכים חדשים. אין דרך להחזיר את השורות שנמחקו בשרשרת.
--  אם צילום be2ed4f5 מבדיקה 2 ב-PREFLIGHT לא נשמר — אין ביטול לצעד א׳ בכלל.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- ביטול צעד ד׳ — החזרת support ל-company_members של 4ae68334
-- ═══════════════════════════════════════════════════════════════════════════
-- הפיך לחלוטין. מחזיר את המצב שבו שני המשתמשים חברים בחברה.

begin;

insert into public.company_members (company_id, user_id, role)
select
  '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid,
  u.id,
  'owner'
from auth.users u
where lower(u.email) = 'support@uxellent.com'
on conflict (company_id, user_id) do update set role = 'owner';

commit;

select m.user_id, u.email, m.role
from public.company_members m
join auth.users u on u.id = m.user_id
where m.company_id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid
order by u.email;


-- ═══════════════════════════════════════════════════════════════════════════
-- ביטול צעד ג׳ — companies.auth_user_id חוזר ל-support
-- ═══════════════════════════════════════════════════════════════════════════
-- הפיך לחלוטין. מפעיל שוב את טריגר ה-checksum, שכבר הוכח כעובר.

begin;

update public.companies
set auth_user_id = (
  select id from auth.users where lower(email) = 'support@uxellent.com'
)
where id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid;

commit;

select c.id, c.email as company_email, c.auth_user_id, u.email as owner_login_email
from public.companies c
left join auth.users u on u.id = c.auth_user_id
where c.id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid;


-- ═══════════════════════════════════════════════════════════════════════════
-- ביטול צעד ב׳ — הסרת itzikbab מ-company_members של 4ae68334
-- ═══════════════════════════════════════════════════════════════════════════
-- הפיך לחלוטין.
-- ⚠️ אל תריץ את זה לפני שביטלת את צעד ג׳. אם auth_user_id עדיין מצביע על
--    itzikbab והסרת גם את שורת החברות שלו, הוא נשאר בעלים דרך auth_user_id
--    בלי שורת company_members — מצב לא עקבי שקשה לאתר.

begin;

delete from public.company_members
where company_id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid
  and user_id = 'd9186573-a7d5-46f9-90da-a05c4b762b47'::uuid;

commit;

select m.user_id, u.email, m.role
from public.company_members m
join auth.users u on u.id = m.user_id
where m.company_id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid;


-- ═══════════════════════════════════════════════════════════════════════════
-- ביטול צעד א׳ — יצירה מחדש של be2ed4f5  ·  אינו שחזור
-- ═══════════════════════════════════════════════════════════════════════════
-- מלא את הערכים מפלט בדיקה 2 ב-PREFLIGHT. ה-INSERT מושאר עם מציין מקום
-- במכוון: השדות NOT NULL בטבלה הם company_name, contact_first_name,
-- contact_full_name ו-email, ואין לי אותם בלי הצילום.
--
-- אל תמציא ערכים. אם הצילום חסר — אל תריץ את הבלוק הזה, ודווח. יצירת חברה
-- עם נתונים שגויים גרועה מהיעדרה: היא תיראה אמיתית ותישא את אותו ח.פ.
--
-- הטריגר trigger_create_trial_subscription_for_company ייצור מנוי חדש
-- אוטומטית. שורת company_members של itzikbab לא תחזור מעצמה — הוסף אותה
-- בנפרד אם היא נדרשת.

-- begin;
--
-- insert into public.companies (
--   id,
--   company_name,
--   business_type,
--   tax_id,
--   registration_number,
--   contact_first_name,
--   contact_full_name,
--   email,
--   mobile_phone,
--   status,
--   auth_user_id
-- ) values (
--   'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid,
--   '<company_name מהצילום>',
--   '<business_type מהצילום>',
--   '<tax_id מהצילום>',
--   '<registration_number מהצילום>',
--   '<contact_first_name מהצילום>',
--   '<contact_full_name מהצילום>',
--   '<email מהצילום — itzikbab@gmail.com>',
--   '<mobile_phone מהצילום>',
--   '<status מהצילום — active>',
--   'd9186573-a7d5-46f9-90da-a05c4b762b47'::uuid
-- );
--
-- commit;
--
-- ⚠️ companies.email הוא UNIQUE. אם בינתיים מישהו תפס את itzikbab@gmail.com,
--    ה-INSERT ייכשל — וזו התנהגות נכונה, לא תקלה שצריך לעקוף.

-- אימות אחרי יצירה מחדש:
-- select * from public.companies where id = 'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid;
-- select count(*) from public.subscriptions where company_id = 'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid;

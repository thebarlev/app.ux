-- ═══════════════════════════════════════════════════════════════════════════
--  121 ROLLBACK — ביטול לכל עסקה בנפרד  ·  שלב 1.5ג׳
-- ═══════════════════════════════════════════════════════════════════════════
--
--  שלושה ביטולים עצמאיים. הרץ **רק** את זה שמתאים לעסקה שנכשלה.
--  אם צריך לבטל יותר מאחת — בסדר הפוך: 3 ← 2 ← 1.
--
--  ⚠️  אל תבטל את עסקה 1 לפני שביטלת את עסקה 2.  ⚠️
--  אם auth_user_id של 4ae68334 עדיין מצביע על itzikbab ותסיר את שורת
--  ה-company_members שלו, הוא יישאר בעלים דרך auth_user_id בלי שורת חברוּת —
--  מצב לא עקבי שלא מייצר שגיאה ולכן קשה לאתר.
--
--  כל שלושת הביטולים הפיכים במלואם. אין כאן מחיקת חברה, ולכן — בשונה
--  מהגרסה הקודמת של התוכנית — אין אף פעולה שאינה ניתנת לשחזור.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- ביטול עסקה 3 — החזרת support ל-company_members של 4ae68334
-- ═══════════════════════════════════════════════════════════════════════════

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

-- אימות — מצופה: שתי שורות, itzikbab ו-support.
select m.user_id, u.email, m.role
from public.company_members m
join auth.users u on u.id = m.user_id
where m.company_id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid
order by u.email;


-- ═══════════════════════════════════════════════════════════════════════════
-- ביטול עסקה 2 — companies.auth_user_id של 4ae68334 חוזר ל-support
-- ═══════════════════════════════════════════════════════════════════════════
-- מפעיל שוב את טריגר ה-checksum, שכבר הוכח כעובר.

begin;

update public.companies
set auth_user_id = (
  select id from auth.users where lower(email) = 'support@uxellent.com'
)
where id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid;

commit;

-- אימות — מצופה: owner_login_email = support@uxellent.com.
select c.id, c.email as company_email, c.auth_user_id, u.email as owner_login_email
from public.companies c
left join auth.users u on u.id = c.auth_user_id
where c.id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid;


-- ═══════════════════════════════════════════════════════════════════════════
-- ביטול עסקה 1 — itzikbab חוזר ל-be2ed4f5, ומנותק מ-4ae68334
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ רק אחרי ביטול עסקה 2. ראה האזהרה בראש הקובץ.
--
-- שלוש פקודות בעסקה אחת, מאותה סיבה שבמקור: לא לפתוח חלון שבו ל-itzikbab
-- אפס חברות או שתיים.

begin;

-- החזרת הבעלוּת על החברה הריקה
update public.companies
set auth_user_id = 'd9186573-a7d5-46f9-90da-a05c4b762b47'::uuid
where id = 'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid;

-- החזרת החברוּת בחברה הריקה
insert into public.company_members (company_id, user_id, role)
values (
  'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid,
  'd9186573-a7d5-46f9-90da-a05c4b762b47'::uuid,
  'owner'
)
on conflict (company_id, user_id) do update set role = 'owner';

-- הסרת ההצמדה לחברה האמיתית
delete from public.company_members
where company_id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid
  and user_id = 'd9186573-a7d5-46f9-90da-a05c4b762b47'::uuid;

commit;

-- אימות — מצופה: שורה אחת, be2ed4f5, ושל 4ae68334 אין קשר ל-itzikbab.
select c.id, c.company_name, c.auth_user_id
from public.companies c
where c.id in (
  select company_id from public.company_members
  where user_id = 'd9186573-a7d5-46f9-90da-a05c4b762b47'::uuid
)
or c.auth_user_id = 'd9186573-a7d5-46f9-90da-a05c4b762b47'::uuid;

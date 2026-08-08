-- ═══════════════════════════════════════════════════════════════════════════
--  121 PREFLIGHT — הרץ ראשון, שמור את כל הפלט. אל תריץ שום צעד לפני זה.
--  העברת הבעלות על "בוגו מדיה בע״מ" · שלב 1.5ג׳
-- ═══════════════════════════════════════════════════════════════════════════
--
--  שבע בדיקות. אם אחת מהן מחזירה משהו אחר ממה שכתוב מתחתיה — עצור ודווח.
--  בדיקה 3 היא היחידה שכותבת, והיא עטופה ב-begin/rollback ולכן לא נשמרת.
--  התוכנית שאחריה: שלוש עסקאות, בלי מחיקת חברה.
--
--  שים לב: התוכנית **אינה מוחקת** אף חברה. be2ed4f5 מנותקת ונשארת קיימת,
--  ולכן אין בתוכנית אף פעולה שאינה הפיכה. בדיקה 2 נשמרת בכל זאת — היא
--  התמונה של המצב לפני, והיא מה שיאפשר לזהות בעתיד מה השתנה ומה לא.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. שתי החברות ומי רשום כבעליהן כרגע ──────────────────────────────────────
-- מצופה: שתי שורות. 4ae68334 עם email של support, be2ed4f5 עם itzikbab@gmail.com.
select
  c.id,
  c.company_name,
  c.email,
  c.registration_number,
  c.auth_user_id,
  u.email as owner_login_email,
  (select count(*) from public.documents d where d.company_id = c.id) as documents,
  (select count(*) from public.company_members m where m.company_id = c.id) as members
from public.companies c
left join auth.users u on u.id = c.auth_user_id
where c.id in (
  '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid,
  'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid
)
order by documents desc;


-- ── 2. צילום מלא של be2ed4f5 — שמור את הפלט ─────────────────────────────────
-- מצופה: שורה אחת, עם auth_user_id = d9186573 ו-email = itzikbab@gmail.com.
-- החברה לא נמחקת, אבל התמונה הזאת היא מה שמאפשר לוודא אחר כך ששני השדות
-- האלה — ורק הם — הם מה שהשתנה.
select * from public.companies
where id = 'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid;

-- וכל מה שתלוי בה, לפי טבלה. מצופה: subscriptions=1 (מהטריגר),
-- company_members=1 (itzikbab), documents=0. אחרי עסקה 1 מצופה
-- company_members=0 ושאר המספרים ללא שינוי — שום דבר לא נמחק בשרשרת.
select 'subscriptions'      as t, count(*) from public.subscriptions      where company_id = 'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid
union all select 'usage_monthly',       count(*) from public.usage_monthly       where company_id = 'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid
union all select 'company_members',     count(*) from public.company_members     where company_id = 'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid
union all select 'documents',           count(*) from public.documents           where company_id = 'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid
union all select 'document_sequences',  count(*) from public.document_sequences  where company_id = 'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid
union all select 'customers',           count(*) from public.customers           where company_id = 'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid
union all select 'templates',           count(*) from public.templates           where company_id = 'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid
order by t;

-- billing_documents הוא ON DELETE RESTRICT בשתי העמודות. **אינו חוסם את
-- התוכנית הזאת**, שכן איננו מוחקים דבר. נבדק לתיעוד בלבד, כי הוא כן יחסום
-- את משימת ניקוי הזבל העתידית — ואז המספר הזה הוא מה שיקבע אם היא אפשרית.
-- מצופה: 0.
select count(*) as billing_documents_rows_must_be_zero
from public.billing_documents
where issuer_company_id = 'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid
   or buyer_company_id  = 'be2ed4f5-53bc-464f-bd1b-b8f14f0fb4ed'::uuid;


-- ── 3. הטריגר של ה-checksum — האם UPDATE על 4ae68334 עובר בכלל? ─────────────
-- רלוונטי לעסקה 2, וגם לעסקה 1 שמריצה UPDATE על be2ed4f5.
-- trigger_enforce_company_registration_number_checksum רץ BEFORE INSERT OR UPDATE
-- (scripts/050:82), ולכן הוא מאמת מחדש את ח.פ. בכל עדכון — כולל צעד ג׳.
-- זהו UPDATE ריק (company_name = company_name) שמפעיל את הטריגר בלי לשנות דבר,
-- והוא מבוטל ב-rollback.
--
-- מצופה: UPDATE 1 ואז ROLLBACK, בלי שגיאה.
-- אם מופיעה שגיאה על ח.פ. לא תקין — צעד ג׳ ייכשל. עצור ודווח.
begin;
update public.companies
set company_name = company_name
where id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid;
rollback;


-- ── 4. מכסת המסמכים — האם הפטור צמוד לחברה ולא רק לאימייל? ──────────────────
-- מצופה: שורה אחת. אם ריק — אחרי ההעברה itzikbab ייתקל במכסת מסמכים,
-- כי הפטור לפי אימייל צמוד ל-support ולא לו. עצור ודווח לפני שממשיכים.
select company_id
from public.unlimited_document_companies
where company_id = '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid;


-- ── 5. מזהה המשתמש של support — נדרש לצעד ד׳ ────────────────────────────────
-- מצופה: שורה אחת, ו-is_system_admin = true.
-- עסקה 3 מוחקת לפי תת-שאילתה על האימייל הזה, ולכן חייבת להיות בדיוק שורה אחת.
select
  u.id as support_auth_user_id,
  u.email,
  exists (select 1 from public.system_admins sa where sa.auth_user_id = u.id) as is_system_admin
from auth.users u
where lower(u.email) = 'support@uxellent.com';


-- ── 6. מזהה המשתמש של itzikbab — אימות שהוא אכן d9186573 ────────────────────
-- מצופה: שורה אחת, id = d9186573-a7d5-46f9-90da-a05c4b762b47,
-- ו-is_system_admin = false (הוא לקוח, לא אדמין).
select
  u.id as itzikbab_auth_user_id,
  u.email,
  exists (select 1 from public.system_admins sa where sa.auth_user_id = u.id) as is_system_admin
from auth.users u
where lower(u.email) = 'itzikbab@gmail.com';


-- ── 7. עמודות company_members — האם קיימת עמודת status? ─────────────────────
-- ה-INSERT בעסקה 1ג׳ אינו כולל status, כי היא אינה קיימת בסכימה שבקבצים
-- (scripts/006:11-23). הקוד באפליקציה מנסה לכתוב status ונופל חזרה בלעדיה,
-- מה שמרמז שאולי היא נוספה במסד ידנית.
-- מצופה: אם status קיימת ו-is_nullable='NO' ואין לה column_default —
-- עצור ודווח, כי אז ה-INSERT בעסקה 1ג׳ ייכשל וצריך להוסיף לו את העמודה.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'company_members'
order by ordinal_position;

-- =====================================================
-- 140 · שאילתות נלוות — ⛔ לא הורץ · NOT RUN
-- =====================================================
-- ⛔ אף אחת מהשאילתות בקובץ הזה לא הורצה. נוסחו בלבד.
-- ⛔ THIS FILE HAS NOT BEEN RUN. Composed, never executed.
--
-- זה אינו קובץ מיגרציה ואינו חלק ברצף. אין להריץ אותו כמיגרציה.
-- סדר ההרצה: 0 -> 1 -> (scripts/140) -> 2א -> 2ב -> 1 שוב -> 3.
--
-- ⛔ self_credit_note אינו מטופל, לא בפונקציה ולא בבאקפיל. הוא נמדד בבלוק 1
--    כדי שיישאר גלוי, ומסומן במפורש כמה שנשאר פתוח. הנימוק המלא בכותרת
--    scripts/140-credit-documents-always-settled.sql.
-- =====================================================


-- =====================================================
-- 0 · PRE-FLIGHT — חובה לפני scripts/140
-- =====================================================
-- ⚠️ כלל העצירה התהפך ב-16.8.2026, אחרי מדידה בפועל.
--
-- מה שנמדד: ההגדרה החיה של public.recompute_document_accounting(uuid) היא גוף
-- scripts/111 — היא מכילה total_converted, has_conversion, ואת ענף ה-partially_paid
-- עם outstanding_balance = doc_total - total_converted.
--
-- הקומיטים 3310b44 ו-c8c8d22 טענו ש-111 "NOT applied". הם שגויים.
-- scripts/117-lock-security-definer-functions.sql:10 ("latest: scripts/111:54") צדק.
-- ⛔ הריפו אינו הבסיס. הפלט של השאילתה הזאת הוא הבסיס.
--
-- הכלל, בניסוחו הנוכחי:
--   הפלט מכיל `total_converted`     -> תקין. 111 חי, כצפוי. המשך.
--   הפלט אינו מכיל `total_converted` -> ⛔ עצור. משהו החזיר את המסד אחורה ל-110
--                                        (או ל-043). אל תריץ את scripts/140 — היא
--                                        בנויה על הגוף החי ותתנגש עם מה שיש שם.
--                                        דווח לפני כל פעולה.
--
-- ⚠️ ובכל מקרה, גם כשהפלט תקין: השווה אותו מילה במילה לגוף שבתוך scripts/140.
--    חייבים להיות זהים פרט לשורת ה-document_type אחת. אם לא — 140 לא נבנתה על
--    הגוף שרץ עכשיו, ואסור להריץ אותה.
--
-- ✅ מצב נכון ל-16.8.2026: הפלט נשמר ב-scripts/live-recompute-definition.sql, והושווה
--    בייט-בבייט לגוף scripts/111-conversion-amount-aware.sql — 116 שורות, diff ריק.
--    scripts/140 נבנתה על הטקסט הזה, ו-scripts/140-ROLLBACK.sql הוא הטקסט הזה כפי שהוא.
--    השאילתה כאן קיימת כדי לוודא שדבר לא זז מאז.

select pg_get_functiondef('public.recompute_document_accounting(uuid)'::regprocedure);

-- אימות ההרשאות שנקבעו ב-scripts/117:65-66 (CREATE OR REPLACE אמור לשמר אותן).
-- הרץ לפני ואחרי 140 והשווה — הפלט חייב להיות זהה.
select
  p.proname,
  p.prosecdef                     as security_definer,
  pg_get_userbyid(p.proowner)     as owner,
  coalesce(array_to_string(p.proacl, E'\n'), '(default: EXECUTE to PUBLIC)') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'recompute_document_accounting';


-- =====================================================
-- 1 · BEFORE — ספירה לפי סטטוס
-- =====================================================
-- הרץ פעם אחת לפני 140 ופעם אחת אחרי הבאקפיל.
-- הציפייה: credit_note עובר מ-open ל-paid. self_credit_note לא זז — במכוון.

select
  document_type,
  document_status,
  coalesce(accounting_status, '(null)')                    as accounting_status,
  count(*)                                                 as docs,
  round(sum(coalesce(total_amount, 0))::numeric, 2)        as sum_total,
  round(sum(coalesce(paid_amount, 0))::numeric, 2)         as sum_paid,
  round(sum(coalesce(credited_amount, 0))::numeric, 2)     as sum_credited,
  round(sum(coalesce(outstanding_balance, 0))::numeric, 2) as sum_outstanding
from public.documents
where document_type in ('credit_note', 'self_credit_note')
group by 1, 2, 3
order by document_type, document_status, accounting_status;

-- פירוט לשורה, כדי לראות אילו זיכויים בכלל נושאים קישור.
-- ⚠️ outgoing_links = 0 מסמן מסמך שהטריגר מעולם לא ירה עליו: הוא נשאר במה שה-TS
--    כתב לו. זו הבדיקה שמפרידה בין שני המנגנונים, והיא שאישרה את ההחלטה להוציא
--    את self_credit_note מהמיגרציה.
select
  d.id,
  d.document_type,
  d.document_number,
  d.document_status,
  d.accounting_status,
  d.total_amount,
  d.paid_amount,
  d.credited_amount,
  d.outstanding_balance,
  (select count(*) from public.document_links l where l.source_document_id = d.id) as outgoing_links,
  (select count(*) from public.document_links l where l.target_document_id = d.id) as incoming_links
from public.documents d
where d.document_type in ('credit_note', 'self_credit_note')
order by d.document_type, d.document_number;


-- =====================================================
-- 2 · BACKFILL — ⛔ אחרי scripts/140 בלבד
-- =====================================================
-- ⛔ אם תריץ את זה לפני 140, הפונקציה הישנה תרוץ ותשאיר את הכל 'open'. חסר תועלת,
--    ולא מזיק — אבל לא עושה דבר.
-- ⛔ credit_note בלבד. self_credit_note אינו כאן, ולא בטעות.
--
-- 2א · יבש. סופר על מה הבאקפיל יעבוד, בלי לגעת. הרץ קודם.
select
  count(*)                                                 as will_recompute,
  round(sum(coalesce(outstanding_balance, 0))::numeric, 2) as outstanding_to_clear
from public.documents
where document_type = 'credit_note'
  and document_status = 'final'
  and coalesce(accounting_status, '') <> 'paid';

-- 2ב · הבאקפיל עצמו.
-- ⚠️ scripts/117:65-66 השאיר EXECUTE ל-service_role בלבד. הרץ מ-SQL Editor של
--    Supabase (postgres) או כ-service_role; session של authenticated ייכשל.
-- ⚠️ מבצע UPDATE על מסמכים final. הטריגר enforce_document_immutability (scripts/044:21-73)
--    מתיר זאת: accounting_status / paid_amount / credited_amount / outstanding_balance
--    אינם ברשימת השדות הנדחים (scripts/044:26-37), ו-scripts/044:44-46 מחזיר new כש-
--    document_status לא משתנה. נמדד בקוד, לא במסד.
-- ⚠️ אין transaction מפורש כאן בכוונה — Supabase SQL Editor עוטף אוטומטית.
--    אם אתה מריץ מ-psql, עטוף ב-begin/commit והרץ את 1 שוב לפני ה-commit.
select
  d.id,
  d.document_number,
  public.recompute_document_accounting(d.id) as recomputed
from public.documents d
where d.document_type = 'credit_note'
  and d.document_status = 'final'
  and coalesce(d.accounting_status, '') <> 'paid'
order by d.document_number;

-- 2ג · אחרי הבאקפיל: הרץ שוב את בלוק 1. הציפייה —
--      credit_note       final paid  80   outstanding 0
--      self_credit_note  final open   5   outstanding 2,503.96   ← ללא שינוי, במכוון
--      אפס credit_note שנותרו ב-open.


-- =====================================================
-- 3 · בקרת נזק — מה שאסור שיזוז
-- =====================================================
-- הרץ לפני ואחרי. הפלט חייב להיות זהה בשתי הפעמים.
-- self_credit_note נכלל כאן דווקא כי הוא אמור להישאר בדיוק כפי שהיה.
-- אם משהו כאן זז — 140 נגע במה שלא היה אמור, וצריך rollback.

select
  document_type,
  coalesce(accounting_status, '(null)')                    as accounting_status,
  count(*)                                                 as docs,
  round(sum(coalesce(outstanding_balance, 0))::numeric, 2) as sum_outstanding
from public.documents
where document_type <> 'credit_note'
group by 1, 2
order by document_type, accounting_status;


-- =====================================================
-- ⛔ לא הורץ · NOT RUN — scripts/140-QUERIES-NOT-RUN.sql
-- =====================================================

# ⚠️ תיקון: `scripts/111-conversion-amount-aware.sql` **הוחל**

**נמדד 16.8.2026.** הקובץ הזה מתקן טענה שגויה. **הוא אינו נוגע ב-`scripts/111` עצמו** — 111 נשאר כפי שהוא, לכל אורכו.

---

## מה שנמדד

הרצה של

```sql
select pg_get_functiondef('public.recompute_document_accounting(uuid)'::regprocedure);
```

מול מסד הנתונים החי החזירה גוף שמכיל:

- `total_converted`
- `has_conversion` עם סכימת `sum(amount)` על קישורי `conversion`
- ענף `partially_paid` עם `outstanding_balance = doc_total - total_converted`

שלושת אלה קיימים **אך ורק** ב-`scripts/111-conversion-amount-aware.sql`. הם אינם ב-`scripts/110-receipt-always-paid.sql` ואינם ב-`scripts/043-fix-conversion-logic.sql`.

**מסקנה: ההגדרה החיה של `public.recompute_document_accounting(uuid)` היא גוף `scripts/111`.**

---

## מה שהיה כתוב, ואינו נכון

| מקור | הטענה | הערכה |
|---|---|---|
| קומיט `3310b44` — *"fix(chaining): a superseded חשבון עסקה closes only when fully invoiced"* | *"The other half is scripts/111-conversion-amount-aware.sql, **NOT applied**"* | ⛔ **שגוי** |
| קומיט `c8c8d22` — *"Merge amount-aware conversion links to production"* | *"This is the application half only. scripts/111 makes the trigger sum those amounts; it is applied separately. Deployed alone this changes nothing, because the trigger still ignores amount."* | ⛔ **שגוי** |
| `scripts/111-conversion-amount-aware.sql:41-43` (הערת הכותרת) | *"Recomputation is not automatic… affected documents must be recomputed explicitly"* | ✔ עדיין נכון — זו הערה על הבאקפיל, לא על ההחלה |
| `scripts/117-lock-security-definer-functions.sql:10` | *"public.recompute_document_accounting(uuid) **(latest: scripts/111:54)**"* | ✔ **צדק** |

הודעות הקומיט תיארו את **הכוונה בזמן הכתיבה**, לא את מצב המסד. 111 הוחל אחר כך, ואף אחד לא חזר לתקן אותן. `117` נכתב מאוחר יותר וכבר שיקף את המציאות.

⛔ **לא מדדתי מתי 111 הוחל, על ידי מי, ובאיזה נתיב.** אין לכך עקבות בגיט.

---

## מה זה משנה בפועל

הענף שחי הוא **מודע-סכום**: חשבונית מס של ₪100 מול חשבון עסקה של ₪700 **אינה** סוגרת אותו. הוא נשאר `partially_paid` עם `outstanding_balance = 600`.

זה הפוך מכל מה שנמסר בסבבי המדידה שקדמו ל-16.8.2026, ובכלל זה הקביעה שהופיעה בטבלאות אי-ההתאמה תחת "הפער המרכזי — הקוד כותב `amount` שאיש אינו קורא". **הקוד כותב `amount`, והפונקציה החיה כן קוראת אותו.** אותו ממצא בטל.

## ✅ החשש על `proforma#1001` / `#1002` — נסגר במדידה

בסבב קודם העליתי חשש ששתי שורות הפרודקשן שתועדו ב-`scripts/111:21-22` נשארו סגורות
בטעות ולא עברו את הבאקפיל שהקובץ מורה עליו בשורות 178-183.

**נמדד 16.8.2026 — החשש לא רלוונטי, ומסיבה שלא צפיתי:**

| מה שנמדד | |
|---|---|
| סה"כ חשבונות עסקה במסד | **חמישה**, ממוספרים 1 עד 5 |
| `#3` | `converted`, יתרה 0 — **הומר במלואו**, סגירה נכונה |
| ארבעת האחרים | `open`, יתרה מלאה — **לא הומרו כלל** |
| נסגרו בטעות | **אפס** |

⛔ **`proforma#1001` ו-`#1002` אינם קיימים.** המספרים בהערת הכותרת של `111` אינם
מספרי מסמך של חשבונות עסקה קיימים. הענף החי מודע-סכום ומתנהג נכון על כל חמשת
המסמכים: מי שהומר במלואו סגור, מי שלא הומר פתוח עם יתרה מלאה, ואין מצב ביניים שגוי.

⛔ **לא מדדתי** למה מספרי המסמך בהערת `111:21-22` אינם תואמים דבר במסד — ייתכן שהם
מזהים פנימיים, ייתכן ששונו, וייתכן שהם פשוט שגויים. לא חקרתי.

---

## מה מתוקן היכן

| קובץ | פעולה |
|---|---|
| `scripts/111-conversion-amount-aware.sql` | ⛔ **לא נגעתי.** ללא שינוי |
| `scripts/110-receipt-always-paid.sql` · `scripts/043-fix-conversion-logic.sql` | ⛔ **לא נגעתי** |
| `scripts/140-credit-documents-always-settled.sql` | חסום בבאנר — נבנה על גוף 110, ולכן רגרסיה. ממתין לבנייה מחדש על הגוף החי |
| `scripts/140-ROLLBACK.sql` | חסום בבאנר — מאותה סיבה |
| `scripts/140-QUERIES-NOT-RUN.sql` | בלוק 0 עודכן: כלל העצירה התהפך |
| `docs/regulatory/status-logic-baseline.md` | הערת ההפניה עודכנה: החי הוא 111, לא 110 |

---

## ⚠️ פריט פתוח — שני חורים ברצף המיגרציות

נמדד 16.8.2026 על `main` @ `cecf1a1`. ברצף `scripts/NNN-` חסרים **`134` ו-`135`**:

- ⛔ **מעולם לא חויבו ולא נמחקו** — `git log --all --diff-filter=AD -- "scripts/134*" "scripts/135*"` מחזיר ריק על כל ההיסטוריה ובכל הענפים.
- ⛔ **לא קיימים על הדיסק** באף אחד מ-12 ה-worktrees.

⛔ **חור ברצף אינו הוכחה ליתום.** ייתכן שהמספרים דולגו, וייתכן שמיגרציות רצו בפרודקשן ואבדו. **אי אפשר להבחין בין השניים מהריפו** — אין עקבה שתעיד לכיוון זה או אחר.

זו אותה מחלקת כשל ש-`scripts/139-finalize-period-guard-security-definer.sql` היה דוגמה שלה: מיגרציה שרצה בפרודקשן ולא הייתה tracked. 139 נמצא ונסגר; `134`/`135` נשארים פתוחים כי אין מה לחפש.

**רשום כפריט פתוח, לא כממצא.** מי שיודע מה רץ הוא היחיד שיכול לסגור אותו.

---

## הכלל שנלמד

⛔ **הודעת קומיט אינה עדות למצב מסד.** שלושה סבבי מדידה נשענו על `3310b44`, וכל אחד מהם סימן זאת כ"לא מדדתי — מגיע מהצהרת קומיט". הסימון היה נכון; המסקנה שנבנתה עליו לא. הבסיס היחיד הוא `pg_get_functiondef`.

---

*תיעוד בלבד. לא מיגרציה, לא להריץ. — `scripts/111-CORRECTION-applied-status.md`*

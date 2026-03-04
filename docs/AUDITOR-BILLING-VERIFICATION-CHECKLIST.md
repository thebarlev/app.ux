# רשימת בדיקות – Auditor Billing & חשבוניות

## מטרה
לוודא שמשתמש חדש שמשלים תשלום:
1. מקבל חשבון פעיל (חברה + membership)
2. יכול להוריד את החשבוניות בעמוד חשבוניות

---

## שלב 1: בדיקות לפני תשלום

### 1.1 Setup – יצירת חברה
- [ ] המשתמש מזין **שם חברה** (חובה) בעמוד Setup
- [ ] לחיצה על "המשך לתשלום" מצליחה
- [ ] ב-DB: `auditor_leads.company_id` מתעדכן
- [ ] ב-DB: `companies` – שורה חדשה עם `company_name` + `auth_user_id`
- [ ] ב-DB: `company_members` – שורה עם `company_id`, `user_id`, `role='owner'`

**סיבה אפשרית לבעיה:** Setup לא רץ, או רץ לפני עדכון הקוד (ללא שדה שם חברה).

---

## שלב 2: בדיקות אחרי תשלום

### 2.1 Indicator (קבלת אישור מתשלום)
- [ ] Cardcom קורא ל־`/api/auditor/billing/cardcom/indicator`
- [ ] לוג: `[AUDITOR_INDICATOR] start` → `after insert`
- [ ] ב-DB: `auditor_billing_events` – שורה עם `status='received'`

**סיבה אפשרית:** Timeout, בעיית רשת, או שה-indicator לא מגיע.

---

### 2.2 Process-pending (עיבוד התשלום)
- [ ] Cron רץ כל דקה או הרצה ידנית
- [ ] ב-DB: `auditor_billing_events.status` → `'ok'`
- [ ] ב-DB: `auditor_checkout_sessions.status` → `'paid'`
- [ ] ב-DB: `auditor_subscription_charges` – שורה חדשה עם `status='succeeded'`
- [ ] ב-DB: `auditor_subscriptions` – שורה עם `company_id` נכון
- [ ] ב-DB: `auditor_customers` – שורה עם `company_id`, `user_id`
- [ ] ב-DB: `auditor_customer_payment_methods` – token נשמר

**סיבה אפשרית:** Timeout 300s, שגיאה ב־`ensureAuditorCustomerCompanyForUser`, או `listUsers`/`inviteUserByEmail` איטיים.

---

### 2.3 קישור משתמש לחברה
- [ ] `companies.auth_user_id` = `user.id`
- [ ] `company_members` – שורה עם `user_id` ו־`company_id`
- [ ] `user_company_ids()` מחזיר לפחות חברה אחת עבור המשתמש

**סיבה אפשרית:** `checkout.user_id` היה null, `inviteUserByEmail` נכשל למשתמש קיים, או `listUsers` timeout.

**תיקון:** הרצת Repair API או סקריפט 095.

---

### 2.4 יצירת חשבונית
- [ ] `auditor_subscription_charges.issued_invoice_id` לא null
- [ ] `documents` – שורה עם `document_type='invoice_receipt'`
- [ ] `documents.company_id` = `auditor_subscription_charges.company_id` (חברת הלקוח)
- [ ] PDF נשמר ב-Storage bucket

**סיבה אפשרית:** שגיאת `INSERT has more target columns than expressions` – הרצת מיגרציה 094. RPC נכשל (timeout, sequence_missing) – הרצת Repair API `repair-missing-invoices`.

---

## שלב 3: בדיקות UI

### 3.1 דשבורד – "אין חברה פעילה"
- [ ] המשתמש **לא** רואה "אין חברה פעילה"
- [ ] רואה היסטוריית סריקות (אם יש)

**סיבה אפשרית:** `user_company_ids()` ריק – אין `company_members` או `companies.auth_user_id`.

---

### 3.2 עמוד חשבוניות
- [ ] `/auditor/invoices` מציג רשימת חשבוניות
- [ ] כפתור הורדה עובד
- [ ] PDF נפתח/מורד בהצלחה

### 3.3 PDF – בלוקים שמאל/ימין (issuer vs customer)
- [ ] **בלוק שמאל (מנפיק):** מציג את חברת המנפיק (בוגו מדיה בע״מ / VOW) – `issuer_company_id`
- [ ] **בלוק ימין (לקוח):** מציג את חברת הלקוח (מנוי) – `charge.company_id`  
- [ ] בדיקה: charge `7f58cab5-d111-47c3-b5cf-a18b1008b467` → שמאל: `4ae68334-15a0-4fa3-a9ba-fd77deccc95d`, ימין: `a981a6e6-dd24-4db2-9cf9-8262bf49881f`

**סיבה אפשרית:**
- `user_company_ids()` ריק → API מחזיר 400 "No company"
- `documents.company_id` שונה מחברת הלקוח → RLS חוסם
- חשבונית לא נוצרה → `issued_invoice_id` null

---

## סיכום: סיבות לבעיות ופתרונות

| בעיה | סיבה | פתרון |
|------|------|--------|
| אין חברה פעילה | אין `company_members` / `auth_user_id` | Repair API או סקריפט 095 |
| חשבונית לא נוצרת | שגיאת INSERT ב־document_line_items | הרצת מיגרציה 094 |
| Charge ללא issued_invoice_id | RPC נכשל (timeout, sequence) | Repair API: POST /api/admin/auditor/repair-missing-invoices |
| חשבונית לא נראית | `documents.company_id` של המנפיק | הרצת מיגרציה 091 |
| PDF_NOT_AVAILABLE | חשבוניות ישנות ללא PDF | Repair API: POST /api/admin/auditor/repair-invoice-pdfs |
| Timeout 300s | `listUsers`/`inviteUserByEmail` איטיים | כבר תוקן – timeouts |
| Checkout חסום | Setup ללא שם חברה | השלמת Setup עם שם חברה |

---

## פקודות בדיקה (טרמינל)

```bash
# הרצת process-pending ידנית
curl -X GET "https://YOUR-APP/api/auditor/billing/process-pending" \
  -H "x-cron-secret: YOUR_CRON_SECRET"

# Repair משתמש (admin)
curl -X POST "https://YOUR-APP/api/admin/auditor/repair-user-company" \
  -H "Content-Type: application/json" \
  -H "Cookie: ..." \
  -d '{"email": "user@example.com"}'

# Repair charges ללא חשבונית – issued_invoice_id null (דורש x-admin-secret = AUDITOR_REPAIR_SECRET)
curl -X POST "https://YOUR-APP/api/admin/auditor/repair-missing-invoices" \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: YOUR_AUDITOR_REPAIR_SECRET" \
  -d '{}'
# או ל-charge ספציפי:
curl -X POST "https://YOUR-APP/api/admin/auditor/repair-missing-invoices" \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: YOUR_AUDITOR_REPAIR_SECRET" \
  -d '{"chargeId": "CHARGE_UUID"}'

# Repair חשבוניות ישנות ללא PDF (admin) – תיקון PDF_NOT_AVAILABLE
curl -X POST "https://YOUR-APP/api/admin/auditor/repair-invoice-pdfs" \
  -H "Content-Type: application/json" \
  -H "Cookie: ..." \
  -d '{}'
# או למסמך ספציפי:
curl -X POST "https://YOUR-APP/api/admin/auditor/repair-invoice-pdfs" \
  -H "Content-Type: application/json" \
  -H "Cookie: ..." \
  -d '{"documentId": "UUID"}'
```

---

## פקודות SQL לבדיקה

```sql
-- 1. user_company_ids עבור משתמש (הרץ כ-service_role או החלף auth.uid())
SELECT * FROM company_members WHERE user_id = 'USER_UUID';
SELECT id, auth_user_id FROM companies WHERE auth_user_id = 'USER_UUID';

-- 2. Charges ו-invoices
SELECT c.id, c.company_id, c.status, c.issued_invoice_id
FROM auditor_subscription_charges c
WHERE c.company_id IN (SELECT id FROM companies WHERE auth_user_id = 'USER_UUID')
ORDER BY c.subscription_period_start DESC;

-- 3. מסמכים
SELECT id, company_id, document_number, document_type
FROM documents
WHERE id IN (SELECT issued_invoice_id FROM auditor_subscription_charges WHERE issued_invoice_id IS NOT NULL);
```

---

## סדר הרצת מיגרציות

1. **091** – תיקון `documents.company_id` (חברת לקוח)
2. **094** – תיקון INSERT ל־document_line_items
3. **095** – סקריפט repair ידני (רק למשתמשים קיימים)
4. **096** – טבלת `auditor_invoice_documents` + RLS (מנפיק רואה חשבוניות)
5. **097** – RPC מכניס ל־auditor_invoice_documents בעת יצירה
6. **099** – טבלאות `auditor_project_notes` + `auditor_project_tasks` (CRM)
7. **100** – תיקון "INSERT has more target columns than expressions" – שימוש ב־INSERT...SELECT

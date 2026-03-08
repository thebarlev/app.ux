# Auditor Post-Payment Flow – Root Cause Analysis & Fix

## 1. Root Cause Analysis

### Exact Failing Step

**Lead flow (checkout/create)**: When a user who **already has an account** pays via the scan flow (no prior auth):

1. `checkout/create` creates a session with `company_id=null`, `user_id=null`, `lead_id` set.
2. After payment, `process-indicator-event.ts` creates a company from the lead.
3. It calls `inviteUserByEmail(leadEmail)`.
4. **inviteUserByEmail fails** when the user already exists (Supabase returns duplicate/23505).
5. The catch block sets `invitedUserId = null` and **no fallback** is used.
6. `companies.auth_user_id` stays null, `company_members` is never populated.
7. `getCompanyIdForUser()` / `user_company_ids()` return no company for the user.
8. Dashboard shows "אין חברה פעילה", invoices API returns 400, subscription status returns no subscription.

### Exact Files

| File | Role |
|------|------|
| `lib/auditor/billing/process-indicator-event.ts` | Lines 224–231: inviteUserByEmail catch, no fallback for existing user |
| `app/auditor/(account)/dashboard/page.tsx` | Line 10: `user_company_ids` result parsing (assumed object shape; `setof uuid` can return raw strings) |

### Exact Tables / Fields

| Table | Field | Issue |
|-------|-------|-------|
| `companies` | `auth_user_id` | Never set when invite fails |
| `company_members` | No row | Never inserted when invite fails |
| `auditor_checkout_sessions` | `user_id` | Stays null |

### Why Payment Succeeds but Account Remains Inactive

- Cardcom charge succeeds.
- Subscription and charge are created for the new company.
- The user is not linked to that company because `inviteUserByEmail` fails (user exists) and there is no fallback to link the existing user.

### Why Invoice / Receipt Is Missing or Not Visible

- **Invoice is created** in `process-indicator-event.ts` via `issue_auditor_charge_invoice_receipt_service`.
- Invoice is created under the billing company and linked to the charge.
- Charge has `company_id` = the customer’s company.
- Invoices API uses `getCompanyIdForUser()` to get `company_id`.
- If the user has no company (company not linked), `getCompanyIdForUser()` throws → 400 "No company".
- Invoice exists in DB but is not shown because the user is not linked to the company.

### Shared Root Cause

Both “no active company” and “invoice not visible” come from the same root cause: **no user–company link when invite fails for existing users**.

---

## 2. User Journey Map

### Expected Flow (After Fix)

```
checkout/create (lead flow)
  → lead_id set, company_id=null, user_id=null
  → payment in Cardcom
  → indicator
  → process-pending cron
  → process-indicator-event:
      - create company
      - inviteUserByEmail OR (if fails) get_user_id_by_email + link
      - companies.auth_user_id, company_members, checkout.user_id set
      - subscription, charge, invoice created
  → user logs in
  → dashboard: user_company_ids returns company → active
  → invoices: getCompanyIdForUser returns company → charges visible
```

### Broken Flow (Before Fix)

```
checkout/create (lead flow)
  → lead_id set, company_id=null, user_id=null
  → payment in Cardcom
  → indicator
  → process-pending cron
  → process-indicator-event:
      - create company
      - inviteUserByEmail FAILS (user exists)
      - invitedUserId = null
      - companies.auth_user_id NOT set
      - company_members NOT inserted
  → user logs in
  → dashboard: user_company_ids returns [] → "אין חברה פעילה"
  → invoices: getCompanyIdForUser throws → 400
```

---

## 3. Minimal Fix Plan (Implemented)

| # | File | Purpose | Type | Risk |
|---|------|---------|------|------|
| 1 | `scripts/086-auditor-link-existing-user-by-email.sql` | Add `get_user_id_by_email` RPC | DB migration | Low |
| 2 | `lib/auditor/billing/process-indicator-event.ts` | Fallback when invite fails: find user by email + link | Code | Low |
| 3 | `app/auditor/(account)/dashboard/page.tsx` | Parse `user_company_ids` for both object and string formats | Code | Low |
| 4 | `lib/auditor/billing/process-indicator-event.ts` | Add targeted logs | Code | None |
| 5 | `scripts/087-auditor-repair-paid-users-no-company-link.sql` | Repair script for already-paid users | SQL | Low |

---

## 4. Implementation Summary

### Changes

1. **086 script**: `get_user_id_by_email(p_email text)` returns `auth.users.id` by email (service_role only).
2. **process-indicator-event.ts**:
   - On `inviteUserByEmail` failure, if error looks like “user already exists”, call `get_user_id_by_email`.
   - If found, set `companies.auth_user_id`, insert `company_members`, update `auditor_checkout_sessions.user_id`.
   - Logs for invite success/failure, company/user resolution, subscription, invoice.
3. **dashboard/page.tsx**: `user_company_ids` result parsing supports both `string` and `{ company_id }` formats.
4. **087 script**: Repair script for companies with succeeded charges but no company–user link.

---

## 5. Repair Path for Already-Paid Users

### Steps

1. Deploy `086-auditor-link-existing-user-by-email.sql`.
2. Run the repair script:

```sql
-- 1. Dry run (see affected rows)
SELECT
  c.id AS company_id,
  c.company_name,
  c.email AS lead_email,
  public.get_user_id_by_email(c.email) AS existing_user_id
FROM public.companies c
JOIN public.auditor_subscription_charges ch ON ch.company_id = c.id AND ch.status = 'succeeded'
LEFT JOIN public.company_members cm ON cm.company_id = c.id
WHERE c.auth_user_id IS NULL
  AND cm.company_id IS NULL
  AND public.get_user_id_by_email(c.email) IS NOT NULL;

-- 2. Apply repair (from scripts/087)
-- Run the DO block in 087-auditor-repair-paid-users-no-company-link.sql
```

### Identifying Affected Users

- Companies with `auth_user_id IS NULL` and no `company_members` rows.
- With at least one `auditor_subscription_charges` row where `status = 'succeeded'`.
- Company `email` matches an existing `auth.users` row.

---

## 6. Verification Checklist

### HE/ILS First Purchase

- [ ] User registers via /auditor/register.
- [ ] User goes to checkout (link_id).
- [ ] Pays in Cardcom (ILS).
- [ ] Redirected to success.
- [ ] Dashboard shows active company and scans.
- [ ] Invoice visible and downloadable.
- [ ] First scan allowed.

### EN/USD First Purchase

- [ ] Same flow with /en/auditor.
- [ ] Pays in Cardcom (USD).
- [ ] Dashboard shows active company.
- [ ] Invoice visible and downloadable.
- [ ] Document language/labels/currency correct for EN.

### Lead Flow (Scan → Checkout Without Prior Auth)

- [ ] User does scan without login.
- [ ] User pays via checkout/create.
- [ ] If user already exists: after payment, user is linked.
- [ ] User logs in → dashboard active.
- [ ] Invoice visible and downloadable.

### Login After Payment

- [ ] User logs in → dashboard active.
- [ ] Invoice visible and downloadable.
- [ ] First scan allowed.

### Next Renewal

- [ ] Saved token used for renewal.
- [ ] New charge created.
- [ ] New invoice issued.

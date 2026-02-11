## Cardcom billing (VOW-only)

This project integrates Cardcom **LowProfile** (Operation=2: charge + create token) using a **single VOW Cardcom terminal**.

### Guarantees

- **No DB row stores Cardcom password** (or any Cardcom credential).
- **No UI** for customers to configure payment providers.
- All payments are processed via **VOW’s Cardcom terminal** configured via server-only env vars.

---

## Environment variables (server-only)

Required:

- `CARDCOM_TERMINAL_NUMBER`
- `CARDCOM_API_USERNAME`
- `CARDCOM_API_PASSWORD` (not stored in DB; only used server-side validation)
- `CARDCOM_MODE` = `test|prod`
- `VOW_BILLING_COMPANY_ID=4ae68334-15a0-4fa3-a9ba-fd77deccc95d`

Optional:

- `PUBLIC_BASE_URL` (recommended in production): public site origin, e.g. `https://app.vow.co.il`
  - If omitted, the server derives the origin from the incoming request.

Supabase required (already used elsewhere in the repo):

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- (and your usual anon key vars for the app)

---

## Endpoints

### 1) Create checkout session (buyer-authenticated)

`POST /api/billing/checkout/create`

Input JSON:

- `plan_id` (required)
- `billing_interval` = `month|year` (optional, default `month`)
- `success_url` (optional)
- `error_url` (optional)

Behavior:

- Creates `checkout_sessions` row in Supabase.
- Calls Cardcom LowProfile open page:
  - `https://secure.cardcom.solutions/Interface/LowProfile.aspx` (POST urlencoded)
  - Sends `ReturnValue = checkout_session_id` for correlation.
- Stores `LowProfileCode` and returns `redirect_url`.

Response JSON:

- `redirect_url` (send the browser there)
- `checkout_session_id`

### 2) Indicator callback (Cardcom → VOW server-to-server)

`GET /api/billing/cardcom/indicator`

This is the **IndicatorUrl** you must configure at Cardcom.

Behavior:

- Idempotency key: `lowprofile:<LowProfileCode>` stored in `billing_webhook_events`.
- Always pulls the authoritative status from Cardcom:
  - `https://secure.cardcom.solutions/Interface/BillGoldGetLowProfileIndicator.aspx?terminalnumber=...&username=...&lowprofilecode=...`
  - Success is only when `OperationResponse==0`.
- Updates:
  - `checkout_sessions` → `paid|failed`
  - `subscriptions` for the buyer company (`status=active`, period dates)
  - Issues a **VOW invoice/receipt (`invoice_receipt`)** under `VOW_BILLING_COMPANY_ID` via a privileged Postgres RPC.

---

## Privileged issuance RPC (service role only)

SQL migration: `scripts/055-issue-paid-checkout-document-service.sql`

Function:

- `public.issue_paid_checkout_document_service(p_checkout_session_id uuid, p_issuer_company_id uuid)`
- `SECURITY DEFINER`
- Enforced to be callable only by `service_role` (JWT role check + explicit `GRANT EXECUTE ... TO service_role`)

### Idempotency

- Uses an advisory transaction lock per checkout session.
- Uses `billing_documents.unique(checkout_session_id)` to prevent duplicates.
- If the linkage already exists, the function returns the existing `document_id` + `document_number` without consuming a new number.

### Numbering fallback (MVP)

If `document_sequences` is missing for the issuer (VOW) company:

- Auto-creates sequences for:
  - `invoice_receipt`
- Starts at **1000** (sets `starting_number=1000`, `current_number=999`) and then increments sequentially.

---

## Required in production
- `PUBLIC_BASE_URL` – **Must be set** (e.g. `https://app.vow.co.il`). Cardcom calls IndicatorUrl from their servers; localhost is not reachable.
- If missing in production, checkout creation returns 500.

## Debugging stuck checkout_sessions
See `scripts/063-debug-stuck-checkout.sql` for queries to:
- Find sessions stuck at `redirected`
- Verify `billing_webhook_events` has the idempotency event
- Check `indicator_url` points to production (not localhost)
- Inspect `billing_failures` for post-payment issues

## Supabase migrations to run (order)

Run in Supabase SQL editor (in this order):

1. `scripts/051-billing-checkout-sessions.sql`
2. `scripts/052-billing-documents.sql`
3. `scripts/053-line-items-item-date-currency.sql`
4. `scripts/054-billing-rls.sql`
5. `scripts/055-issue-paid-checkout-document-service.sql`
6. `scripts/061-issue-paid-checkout-invoice-receipt.sql` (replaces RPC to issue invoice_receipt)
7. `scripts/062-billing-failures.sql` (failure logging for post-payment issues)

---

## Cardcom configuration checklist

In Cardcom terminal/config:

- **IndicatorUrl**: `https://<your-domain>/api/billing/cardcom/indicator`
- **SuccessRedirectUrl** / **ErrorRedirectUrl**:
  - Provided dynamically per checkout (or defaults to `/dashboard?checkout=success|error`)

Important notes (Cardcom behavior):

- Cardcom may retry IndicatorUrl up to ~7 times if it does not receive `HTTP 200`.
- Do not rely on the success redirect for payment confirmation; always verify via pull-indicator.


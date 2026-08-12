/**
 * The two billing notices to the operator.
 *
 * ── WHY THIS IS NOT sendAdminNotification ───────────────────────────────────
 * That helper hardcodes support@uxellent.com and, more importantly, discards
 * sendBrevoEmail's return value — so a rejected send is already invisible there. These
 * notices exist to make failures visible, and a notifier that swallows its own failure
 * is the defect it was built to fix.
 *
 * The recipient is a parameter with a default, and it is deliberately NOT read from
 * AUDITOR_REPORT_EMAIL_ENABLED. Whether the operator is told a subscription was sold is
 * a different decision from whatever that flag governs, and coupling them means one gets
 * turned off by someone reasoning about the other.
 *
 * ── ⛔ NOTICE B IS NOT OPTIONAL ─────────────────────────────────────────────
 * An event that reaches status='error' has: money taken, a subscription active, and no
 * tax document. If nobody is told, 'error' is a swallow with a different name — the
 * terminal state nobody queries. The whole three-attempt limit is only meaningful
 * because giving up reaches a person.
 *
 * ── ⛔ FIELDS ARE INCLUDED, NEVER PASSED THROUGH ────────────────────────────
 * Same rule as the Cardcom keep list, for the same reason. Neither function takes an
 * object to render; each takes named scalar fields, so there is no code path by which a
 * token, a card number or an identity number can reach an email — not because it is
 * filtered, but because there is nowhere to put it. A future field has to be added by
 * hand, which is the point.
 *
 * The one exception is notice B's error text, which is required verbatim and is not ours
 * to shape. It is scrubbed rather than trusted — see redactFreeText.
 *
 * ── ⚠️ A TEST NOTICE MUST LOOK LIKE ONE ────────────────────────────────────
 * The subject carries [בדיקה] when is_test is true. During a test round the operator
 * receives real emails from test charges, and a test notice that reads as a sale is
 * exactly the confusion that costs money — someone acts on a customer who does not
 * exist. It is in the SUBJECT, not the body, because that is what an inbox shows.
 *
 * ── AND IT CANNOT BREAK A CHARGE ───────────────────────────────────────────
 * Neither function throws, ever. sendBrevoEmail already returns {sent, reason} instead
 * of throwing, and both functions additionally wrap everything in try/catch so a bug in
 * the HTML builder cannot take down an issuance. A failed send is logged under a fixed
 * greppable prefix with enough to identify what was lost.
 */

import { sendBrevoEmail } from "@/lib/email/brevo"

/** Default operator inbox. Overridable per call; never read from an env flag. */
export const AUDITOR_BILLING_NOTICE_TO = "itzikbab@gmail.com"

const FAIL_PREFIX = "[AUDITOR_NOTICE_FAILED]"

export type NoticeResult = { sent: boolean; reason?: string }

function esc(v: unknown): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

/** Subject marker. In the subject and not the body, because an inbox shows subjects. */
export function subjectFor(isTest: boolean, subject: string): string {
  return isTest ? `[בדיקה] ${subject}` : subject
}

/**
 * The one free-text field, scrubbed before it is sent.
 *
 * ⚠️ This is a mitigation, not a proof. Notice B must carry the original error text, and
 * a database error can echo values from the row that caused it — a unique-violation on
 * auditor_customer_payment_methods, for instance, prints token_hash in its detail. A
 * hash is not the token, but it is not something to mail either.
 *
 * So long hex/base64 runs, card-length digit runs and nine-digit identity numbers are
 * replaced. What survives is the sentence, the SQLSTATE and the table and column names,
 * which is what makes an error diagnosable.
 *
 * It cannot catch a secret that does not match one of these shapes. That is why the
 * structural protection is the named-parameter rule above, and this only guards the
 * single field that could not be constrained that way.
 */
export function redactFreeText(text: string): string {
  return String(text ?? "")
    // 24+ character hex or base64-ish runs: tokens, hashes, keys.
    .replace(/\b[A-Za-z0-9+/=_-]{24,}\b/g, "[redacted]")
    // 13–19 consecutive digits: a card number, with or without grouping.
    .replace(/\b\d[\d ]{11,21}\d\b/g, (m) => (m.replace(/\D/g, "").length >= 13 ? "[redacted]" : m))
    // Exactly nine digits standing alone: an Israeli identity number.
    .replace(/(?<!\d)\d{9}(?!\d)/g, "[redacted]")
    .slice(0, 4000)
}

/**
 * A · a subscription was sold.
 *
 * Every field is named. There is no spread, no object argument and no "extra" bag.
 */
export type SubscriptionNoticeFields = {
  isTest: boolean
  fullName: string | null
  companyName: string | null
  email: string | null
  mobile: string | null
  planName: string | null
  amount: number | null
  currency: string | null
  invoiceNumber: string | null
}

/** Exported so the no-secrets and [בדיקה] rules can be observed, not assumed. */
export function buildSubscriptionHtml(params: SubscriptionNoticeFields): string {
  const money =
    params.amount === null || params.amount === undefined
      ? "—"
      : `${params.amount} ${params.currency || "ILS"}`

  const rows: Array<[string, string]> = [
    ["שם מלא", esc(params.fullName) || "—"],
    ["שם חברה", esc(params.companyName) || "—"],
    ["מייל", esc(params.email) || "—"],
    ["נייד", esc(params.mobile) || "—"],
    ["מסלול", esc(params.planName) || "—"],
    ["סכום", esc(money)],
    ["מספר חשבונית", esc(params.invoiceNumber) || "—"],
  ]

  return (
    `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7">` +
    (params.isTest
      ? `<p style="background:#fff4d6;border:1px solid #e0b64a;padding:10px;margin:0 0 14px">` +
        `<strong>זו הודעת בדיקה.</strong> החברה מסומנת <code>is_test = true</code>. ` +
        `אין כאן לקוח אמיתי ואין כאן הכנסה.</p>`
      : "") +
    `<h2 style="margin:0 0 12px">מנוי חדש</h2>` +
    `<table cellpadding="6" cellspacing="0" border="0">` +
    rows.map(([k, v]) => `<tr><td><strong>${k}</strong></td><td>${v}</td></tr>`).join("") +
    `</table></div>`
  )
}

export type IssuanceErrorNoticeFields = {
  isTest: boolean
  chargeId: string | null
  attempts: number
  errorText: string | null
}

export function buildIssuanceErrorHtml(params: IssuanceErrorNoticeFields): string {
  const safeError = redactFreeText(params.errorText || "")
  return (
    `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7">` +
    (params.isTest
      ? `<p style="background:#fff4d6;border:1px solid #e0b64a;padding:10px;margin:0 0 14px">` +
        `<strong>זו הודעת בדיקה.</strong> החברה מסומנת <code>is_test = true</code>.</p>`
      : "") +
    `<h2 style="margin:0 0 12px">הנפקת חשבונית נכשלה סופית</h2>` +
    `<p style="background:#fdecec;border:1px solid #d98b8b;padding:10px;margin:0 0 14px">` +
    `הכסף נגבה, המנוי פעיל, <strong>ואין מסמך מס</strong>. האירוע סומן ` +
    `<code>error</code> ולא ינוסה שוב אוטומטית.</p>` +
    `<table cellpadding="6" cellspacing="0" border="0">` +
    `<tr><td><strong>מזהה חיוב</strong></td><td><code>${esc(params.chargeId) || "—"}</code></td></tr>` +
    `<tr><td><strong>מספר ניסיונות</strong></td><td>${esc(params.attempts)}</td></tr>` +
    `</table>` +
    `<p style="margin:14px 0 4px"><strong>שגיאה מקורית</strong></p>` +
    `<pre dir="ltr" style="background:#f4f4f6;padding:10px;white-space:pre-wrap;` +
    `word-break:break-word;margin:0">${esc(safeError) || "—"}</pre></div>`
  )
}

export async function sendAuditorSubscriptionNotice(params: {
  to?: string
  isTest: boolean
  fullName: string | null
  companyName: string | null
  email: string | null
  mobile: string | null
  planName: string | null
  amount: number | null
  currency: string | null
  invoiceNumber: string | null
}): Promise<NoticeResult> {
  const to = params.to || AUDITOR_BILLING_NOTICE_TO
  try {
    const html = buildSubscriptionHtml(params)

    const res = await sendBrevoEmail({
      to: [to],
      subject: subjectFor(params.isTest, `מנוי חדש — ${params.companyName || params.email || "לא ידוע"}`),
      html,
      senderName: "UXellent",
      label: "auditor subscription notice",
    })

    if (!res?.sent) {
      // Not swallowed. Enough here to reconstruct what the operator never saw.
      console.error(`${FAIL_PREFIX} subscription`, {
        reason: res?.reason || "unknown",
        to,
        isTest: params.isTest,
        companyName: params.companyName,
        invoiceNumber: params.invoiceNumber,
      })
      return { sent: false, reason: res?.reason || "unknown" }
    }
    return { sent: true }
  } catch (e: any) {
    // A bug in the builder above must not reach the caller. An issuance does not fail
    // because an email could not be composed.
    console.error(`${FAIL_PREFIX} subscription threw`, {
      error: String(e?.message || e),
      to,
      isTest: params.isTest,
      invoiceNumber: params.invoiceNumber,
    })
    return { sent: false, reason: "threw" }
  }
}

/**
 * B · an event gave up.
 *
 * ⛔ This is what makes status='error' something other than a silent terminal state.
 */
export async function sendAuditorIssuanceErrorNotice(params: {
  to?: string
  isTest: boolean
  chargeId: string | null
  attempts: number
  errorText: string | null
}): Promise<NoticeResult> {
  const to = params.to || AUDITOR_BILLING_NOTICE_TO
  try {
    // One copy of the markup, in the exported builder, so what the tests observe is what
    // is actually sent. Two copies of the same HTML is how the assertion and the email
    // drift apart without either looking wrong.
    const safeError = redactFreeText(params.errorText || "")
    const html = buildIssuanceErrorHtml(params)

    const res = await sendBrevoEmail({
      to: [to],
      subject: subjectFor(params.isTest, `⛔ הנפקת חשבונית נכשלה — חיוב ${params.chargeId || "לא ידוע"}`),
      html,
      senderName: "UXellent",
      label: "auditor issuance error notice",
    })

    if (!res?.sent) {
      // ⚠️ The worst case in this file: the notice about a failure itself failed. Both
      // facts go to the log, because at this point the log is the only thing left.
      console.error(`${FAIL_PREFIX} issuance_error`, {
        reason: res?.reason || "unknown",
        to,
        isTest: params.isTest,
        chargeId: params.chargeId,
        attempts: params.attempts,
        errorText: safeError.slice(0, 500),
      })
      return { sent: false, reason: res?.reason || "unknown" }
    }
    return { sent: true }
  } catch (e: any) {
    console.error(`${FAIL_PREFIX} issuance_error threw`, {
      error: String(e?.message || e),
      to,
      chargeId: params.chargeId,
      attempts: params.attempts,
    })
    return { sent: false, reason: "threw" }
  }
}

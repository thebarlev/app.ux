/**
 * The invoice email to the CUSTOMER.
 *
 * ── WHY IT EXISTS ───────────────────────────────────────────────────────────
 * It did not. A customer paid, the tax document was created correctly in `documents`,
 * and there was no code anywhere that sent it to them — while the thank-you page told
 * them "החשבונית נשלחה לאימייל שהזנתם". The only route to the PDF is auth-gated, behind
 * an account area the same page says will open "בקרוב".
 *
 * So: money taken, a document that exists, no way for the buyer to reach it, and a
 * sentence claiming it was already sent. The checkout page's own comment describes the
 * intended flow as "plan -> this form -> Cardcom -> invoice by email -> thank-you", and
 * the `invoice by email` link was never built.
 *
 * ── ⛔ IT FIRES AFTER THE DOCUMENT EXISTS, NEVER BEFORE ─────────────────────
 * The caller invokes this only once the issuance RPC has returned ok with a document
 * number. Emailing "here is your invoice" before the document is committed is the same
 * class of lie in a different direction.
 *
 * ── ⛔ FIELDS ARE NAMED, NOT PASSED THROUGH ─────────────────────────────────
 * Same rule as the operator notices and the Cardcom keep list. There is no object
 * argument, so a token, a card number or an identity number has nowhere to enter. The
 * PDF is the document the tax authority defines; nothing else is attached.
 *
 * ── ⚠️ [בדיקה] IN THE SUBJECT, DEFAULT TRUE ────────────────────────────────
 * Identical to the operator notices. And it matters MORE here, because this one reaches
 * a real inbox that is not ours: during a test round an unmarked invoice email is
 * indistinguishable from a real tax document, and it is one forward away from an
 * accountant's books. The caller defaults is_test to true when the company row cannot
 * be read, for the same asymmetry — a real invoice marked [בדיקה] is confusing, a test
 * invoice that looks real is a problem in someone else's ledger.
 *
 * ── AND IT CANNOT BREAK AN ISSUANCE ────────────────────────────────────────
 * Never throws. sendBrevoEmail returns {sent, reason} rather than throwing, and
 * everything here is additionally wrapped. A failure is logged under the same
 * [AUDITOR_NOTICE_FAILED] prefix as the operator notices, with the invoice number, so a
 * document that was issued but not delivered is recoverable from the log alone.
 */

import { sendBrevoEmail } from "@/lib/email/brevo"

const FAIL_PREFIX = "[AUDITOR_NOTICE_FAILED]"

export type InvoiceEmailResult = { sent: boolean; reason?: string }

function esc(v: unknown): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

export type InvoiceEmailFields = {
  isTest: boolean
  invoiceNumber: string
  planName: string | null
  amount: number | null
  currency: string | null
}

/** Exported so the copy and the [בדיקה] rule can be observed rather than assumed. */
export function buildInvoiceEmailHtml(params: InvoiceEmailFields): string {
  const money =
    params.amount === null || params.amount === undefined
      ? "—"
      : `${params.amount} ${params.currency === "USD" ? "$" : "₪"}`

  return (
    `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.8">` +
    (params.isTest
      ? `<p style="background:#fff4d6;border:1px solid #e0b64a;padding:12px;margin:0 0 16px">` +
        `<strong>זו הודעת בדיקה.</strong> המסמך המצורף הופק בסביבת בדיקות ` +
        `<strong>ואינו מסמך מס</strong>. אין להזין אותו בספרים.</p>`
      : "") +
    `<h2 style="margin:0 0 12px">החשבונית שלכם</h2>` +
    `<p style="margin:0 0 16px">תודה. המנוי פעיל, וחשבונית מס/קבלה מצורפת להודעה הזאת.</p>` +
    `<table cellpadding="6" cellspacing="0" border="0" style="margin:0 0 16px">` +
    `<tr><td><strong>מספר חשבונית</strong></td><td dir="ltr">${esc(params.invoiceNumber)}</td></tr>` +
    `<tr><td><strong>מסלול</strong></td><td>${esc(params.planName) || "—"}</td></tr>` +
    `<tr><td><strong>סכום</strong></td><td>${esc(money)} כולל מע״מ</td></tr>` +
    `</table>` +
    `<p style="margin:0;color:#555">שמרו את הקובץ המצורף. אם צריך עוד עותק — השיבו להודעה הזאת.</p>` +
    `</div>`
  )
}

/** Subject marker. In the subject, because that is what an inbox shows. */
export function invoiceSubject(isTest: boolean, invoiceNumber: string): string {
  const base = `חשבונית מס/קבלה ${invoiceNumber}`
  return isTest ? `[בדיקה] ${base}` : base
}

export async function sendAuditorInvoiceToCustomer(params: {
  to: string
  isTest: boolean
  invoiceNumber: string
  planName: string | null
  amount: number | null
  currency: string | null
  /** The document PDF, base64. Omitted only when generation failed — see the caller. */
  pdfBase64: string | null
}): Promise<InvoiceEmailResult> {
  const to = String(params.to || "").trim()
  try {
    if (!to) {
      console.error(`${FAIL_PREFIX} invoice, no recipient address`, {
        invoiceNumber: params.invoiceNumber,
        isTest: params.isTest,
      })
      return { sent: false, reason: "no_recipient" }
    }

    /*
     * ⛔ No PDF, no email.
     *
     * An email saying "your invoice is attached" with nothing attached is worse than no
     * email: the customer now believes they have the document and stops looking. The
     * success page's fallback sentence ("תישלח תוך מספר דקות") is the honest state, and
     * the log line is what gets a person to the missing PDF.
     */
    if (!params.pdfBase64) {
      console.error(`${FAIL_PREFIX} invoice, PDF missing so nothing was sent`, {
        invoiceNumber: params.invoiceNumber,
        to,
        isTest: params.isTest,
      })
      return { sent: false, reason: "pdf_missing" }
    }

    const res = await sendBrevoEmail({
      to: [to],
      subject: invoiceSubject(params.isTest, params.invoiceNumber),
      html: buildInvoiceEmailHtml(params),
      senderName: "VOW Auditor",
      label: "auditor customer invoice",
      attachment: { name: `${params.invoiceNumber}.pdf`, contentBase64: params.pdfBase64 },
    })

    if (!res?.sent) {
      console.error(`${FAIL_PREFIX} invoice`, {
        reason: res?.reason || "unknown",
        to,
        isTest: params.isTest,
        invoiceNumber: params.invoiceNumber,
      })
      return { sent: false, reason: res?.reason || "unknown" }
    }
    return { sent: true }
  } catch (e: any) {
    console.error(`${FAIL_PREFIX} invoice threw`, {
      error: String(e?.message || e),
      to,
      invoiceNumber: params.invoiceNumber,
    })
    return { sent: false, reason: "threw" }
  }
}

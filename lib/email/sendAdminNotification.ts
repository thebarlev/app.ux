import { sendBrevoEmail } from "@/lib/email/brevo"

const ADMIN_TO = "support@uxellent.com"

/**
 * Operational notices to the support inbox. Lead email is a separate concern — see
 * sendAuditorLead, which is recipient-configurable and fires on every signup.
 *
 * ⛔ IT RETURNS THE RESULT NOW. IT USED TO DISCARD IT.
 *
 * sendBrevoEmail does not throw; it returns {sent, reason}. This function awaited it and
 * returned void, so both callers wrapped it in try/catch — a catch that could never fire
 * — and a rejected send was invisible at every call site. The same swallow the auditor
 * billing notices were written to fix, one file over.
 *
 * The result is handed back so callers can log a non-delivery. It still cannot throw, so
 * nothing downstream changes for a caller that ignores it — but now ignoring it is a
 * visible choice rather than the only option.
 */
export async function sendAdminNotification({ subject, html }: { subject: string; html: string }) {
  return await sendBrevoEmail({
    to: [ADMIN_TO],
    subject,
    html,
    senderName: "UXellent",
    label: "admin notification",
  })
}

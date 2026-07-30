import { sendBrevoEmail } from "@/lib/email/brevo"

const ADMIN_TO = "support@uxellent.com"

/**
 * Operational notices to the support inbox. Behaviour is unchanged; only the
 * Brevo call moved to the shared transport. Lead email is a separate concern —
 * see sendAuditorLead, which is recipient-configurable and fires on every signup.
 */
export async function sendAdminNotification({ subject, html }: { subject: string; html: string }) {
  await sendBrevoEmail({
    to: [ADMIN_TO],
    subject,
    html,
    senderName: "VOW Auditor",
    label: "admin notification",
  })
}

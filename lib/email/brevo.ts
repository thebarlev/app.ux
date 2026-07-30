/**
 * The one place a transactional email leaves this app.
 *
 * Extracted from sendAdminNotification so the lead email can reuse the transport
 * without a second copy of the Brevo call. Every send is fire-and-forget by
 * contract: callers sit on signup paths, and a mail outage must never be the
 * reason a registration fails. Failures are logged and swallowed here rather
 * than in each caller.
 */

export async function sendBrevoEmail(params: {
  to: string[]
  subject: string
  html: string
  senderName: string
  /** Logged on failure so it is obvious which send dropped. */
  label: string
}): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    console.warn(`[EMAIL] BREVO_API_KEY missing — ${params.label} not sent`)
    return { sent: false, reason: "missing_api_key" }
  }

  const recipients = params.to.map((a) => a.trim()).filter(Boolean)
  if (recipients.length === 0) {
    console.warn(`[EMAIL] no recipients — ${params.label} not sent`)
    return { sent: false, reason: "no_recipients" }
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: { name: params.senderName, email: "noreply@uxellent.com" },
        to: recipients.map((email) => ({ email })),
        subject: params.subject,
        htmlContent: params.html,
      }),
    })

    if (!res.ok) {
      // Brevo answers 4xx with a JSON body naming the problem — worth keeping,
      // since a silent non-delivery here looks identical to no registrations.
      const body = await res.text().catch(() => "")
      console.error(`[EMAIL] ${params.label} rejected`, { status: res.status, body: body.slice(0, 300) })
      return { sent: false, reason: `http_${res.status}` }
    }

    return { sent: true }
  } catch (err) {
    console.error(`[EMAIL] ${params.label} failed`, err)
    return { sent: false, reason: "request_failed" }
  }
}

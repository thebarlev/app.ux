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
  /**
   * Optional file to attach, already base64-encoded.
   *
   * Added for the customer invoice email, which is the first thing here that has to
   * carry a document rather than describe one. Brevo takes attachments as
   * `attachment: [{ name, content }]` where content is base64 — no multipart, no
   * upload step.
   *
   * ⚠️ Kept optional and unset by default: every existing caller sends HTML only, and
   * an attachment is the kind of thing that should never appear on an email by
   * accident.
   */
  attachment?: { name: string; contentBase64: string }
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
        ...(params.attachment
          ? { attachment: [{ name: params.attachment.name, content: params.attachment.contentBase64 }] }
          : {}),
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

/**
 * Is this address on Brevo's blocked list?
 *
 * ⛔ WHY THIS IS ASKED BEFORE SENDING, NOT INFERRED AFTER.
 *
 * sendBrevoEmail reports the HTTP status faithfully, so a 4xx becomes {sent:false}. The
 * uncertainty was the other branch: if Brevo accepts a blocked contact with a 201 and
 * suppresses delivery silently, we would record sent:true for an email nobody received —
 * and for an invoice, that writes an 'emailed' event, removes the document from the
 * completion sweep's queue permanently, and tells the customer on the thank-you page that
 * their invoice was sent. A false positive here is the worst failure in the whole chain.
 *
 * Rather than guess which Brevo does, the list is queried first. GET
 * /v3/smtp/blockedContacts/{email} answers 200 when the address is blocked and 404 when it
 * is not, so the question has a direct answer and no inference is involved.
 *
 * ⚠️ Fails OPEN, on purpose, and this is the one place in this codebase that does. If the
 * check itself errors we do not know the address is blocked — and refusing to send an
 * invoice because a diagnostic call timed out would withhold a tax document from someone
 * who paid. The sweep would retry, but the customer waits. Being unable to check is not
 * evidence of a block; every other guard here refuses on uncertainty because the harm runs
 * the other way.
 */
export async function isBrevoBlocked(email: string): Promise<{ blocked: boolean; checked: boolean }> {
  const key = process.env.BREVO_API_KEY
  const addr = String(email || "").trim()
  if (!key || !addr) return { blocked: false, checked: false }
  try {
    const res = await fetch(`https://api.brevo.com/v3/smtp/blockedContacts/${encodeURIComponent(addr)}`, {
      method: "GET",
      headers: { accept: "application/json", "api-key": key },
    })
    if (res.status === 200) return { blocked: true, checked: true }
    if (res.status === 404) return { blocked: false, checked: true }
    console.warn("[EMAIL] blocked-contact check returned an unexpected status", { status: res.status })
    return { blocked: false, checked: false }
  } catch (err) {
    console.warn("[EMAIL] blocked-contact check failed", { error: String((err as any)?.message || err) })
    return { blocked: false, checked: false }
  }
}

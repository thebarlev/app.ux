const ADMIN_TO = "support@uxellent.com"

export async function sendAdminNotification({
  subject,
  html,
}: {
  subject: string
  html: string
}) {
  const apiKey = process.env.BREVO_API_KEY

  if (!apiKey) {
    console.warn("[EMAIL] BREVO_API_KEY missing")
    return
  }

  try {
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: {
          name: "VOW Auditor",
          email: "noreply@uxellent.com",
        },
        to: [
          {
            email: ADMIN_TO,
          },
        ],
        subject,
        htmlContent: html,
      }),
    })
  } catch (err) {
    console.error("[EMAIL] sendAdminNotification failed", err)
  }
}

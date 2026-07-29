import { sendBrevoEmail } from "@/lib/email/brevo"

/**
 * A lead email for every Auditor signup.
 *
 * Distinct from sendAdminNotification in two ways that matter. It fires on every
 * signup rather than only the ones that create a new company — a returning
 * visitor who signs up against an existing company is still a lead, and the old
 * notification never saw them because those paths return early. And its
 * recipient comes from AUDITOR_LEAD_EMAIL_TO, so who receives leads is a config
 * change rather than a deploy.
 */

const DEFAULT_TO = "itzikbab@gmail.com"

function recipients(): string[] {
  const raw = String(process.env.AUDITOR_LEAD_EMAIL_TO || "").trim()
  const list = (raw || DEFAULT_TO)
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
  return list.length > 0 ? list : [DEFAULT_TO]
}

/** Keeps a stray angle bracket in a submitted name from breaking the markup. */
function esc(value: unknown): string {
  const s = value === null || value === undefined || String(value).trim() === "" ? "—" : String(value)
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export type AuditorLead = {
  email: string
  contactName?: string | null
  companyName?: string | null
  website?: string | null
  phone?: string | null
  companyId: string
  /** False when the signup created the company, true when it adopted one. */
  reused: boolean
  /** What attachScanToCompany reported, when it ran. */
  scan?: { linkedScanId: string | null; fullScanId: string | null; normalizedHost: string | null; reason: string } | null
}

export async function sendAuditorLead(lead: AuditorLead): Promise<{ sent: boolean; reason?: string }> {
  const kind = lead.reused ? "חברה קיימת" : "חברה חדשה"
  const site = String(lead.website || "").trim()
  const siteCell = site
    ? `<a href="${esc(site.startsWith("http") ? site : `https://${site}`)}">${esc(site)}</a>`
    : "—"

  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 14px 6px 0;color:#64748b;white-space:nowrap">${label}</td><td style="padding:6px 0"><strong>${value}</strong></td></tr>`

  const html = `
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;direction:rtl;text-align:right;color:#0f172a">
  <h2 style="margin:0 0 4px">ליד חדש · אודיטור</h2>
  <p style="margin:0 0 16px;color:#64748b">${esc(kind)}</p>
  <table style="border-collapse:collapse;font-size:15px">
    ${row("שם", esc(lead.contactName))}
    ${row("אימייל", `<a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a>`)}
    ${row("טלפון", esc(lead.phone))}
    ${row("חברה", esc(lead.companyName))}
    ${row("אתר", siteCell)}
    ${row("מזהה חברה", esc(lead.companyId))}
    ${row("נרשם בשעה", esc(new Date().toISOString()))}
  </table>
  ${
    lead.scan
      ? `<p style="margin:16px 0 0;font-size:13px;color:#64748b">
           סריקה: ${esc(lead.scan.reason)}${lead.scan.normalizedHost ? ` · ${esc(lead.scan.normalizedHost)}` : ""}
         </p>`
      : ""
  }
</div>`.trim()

  return sendBrevoEmail({
    to: recipients(),
    subject: `ליד חדש באודיטור · ${lead.companyName || lead.contactName || lead.email}`,
    html,
    senderName: "Uxellent Auditor",
    label: "auditor lead",
  })
}

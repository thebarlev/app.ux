import { sendBrevoEmail } from "@/lib/email/brevo"

/**
 * A lead email for every Auditor lead, at either of the two points one exists.
 *
 * Distinct from sendAdminNotification in two ways that matter. It fires on every
 * signup rather than only the ones that create a new company — a returning
 * visitor who signs up against an existing company is still a lead, and the old
 * notification never saw them because those paths return early. And its
 * recipient comes from AUDITOR_LEAD_EMAIL_TO, so who receives leads is a config
 * change rather than a deploy.
 *
 * It now also covers the gate: the form between the scan and the report writes a
 * row to auditor_leads and, until this, told nobody. Those are the leads with
 * the shortest shelf life — a name, a phone number and a site that was just
 * scanned, from somebody who has not opened an account and might not — and they
 * were the ones going unseen. See the stage field.
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
  /**
   * Null for a gate lead. Somebody who fills the form in front of the report has
   * no company yet, and may never make one — which is exactly the lead worth
   * hearing about soonest.
   */
  companyId: string | null
  /** False when the signup created the company, true when it adopted one. */
  reused?: boolean
  /** What attachScanToCompany reported, when it ran. */
  scan?: { linkedScanId: string | null; fullScanId: string | null; normalizedHost: string | null; reason: string } | null
  /**
   * Which step produced the lead. "gate" is the form between the scan and the
   * report; "signup" is account creation, and stays the default so the existing
   * caller reads unchanged.
   */
  stage?: "gate" | "signup"
}

export async function sendAuditorLead(lead: AuditorLead): Promise<{ sent: boolean; reason?: string }> {
  const kind =
    lead.stage === "gate" ? "השאיר פרטים בשער הדוח · טרם נרשם" : lead.reused ? "חברה קיימת" : "חברה חדשה"
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
    ${lead.companyName ? row("חברה", esc(lead.companyName)) : ""}
    ${row("אתר", siteCell)}
    ${lead.companyId ? row("מזהה חברה", esc(lead.companyId)) : ""}
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

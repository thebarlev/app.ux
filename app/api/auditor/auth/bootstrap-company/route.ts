export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getAuditorConfig } from "@/lib/auditor/env"
import { resolveCanonicalAuditorCompany } from "@/lib/auditor/company-resolution"
import { createRegistrationLog } from "@/lib/auditor/leads/createRegistrationLog"
import { attachScanToCompany } from "@/lib/auditor/leads/attachScanToCompany"
import { sendAdminNotification } from "@/lib/email/sendAdminNotification"
import { sendAuditorLead } from "@/lib/email/sendAuditorLead"

// ── AUDITOR BLOCKED ───────────────────────────────────────────────────────────
// Hard-coded, not configurable. An env-var gate that is unset fails open, which
// is exactly the failure mode fixed in S1.3, so the value is a literal here.
// Annotated `: boolean` on purpose — without the annotation TypeScript narrows the
// code below to unreachable and re-reports the whole body, which fails the build
// (next.config.mjs ignoreBuildErrors:false). To restore auditor access, revert the
// security/auditor-block commits.
const AUDITOR_BLOCKED: boolean = true


const bodySchema = z.object({
  full_name: z.string().min(1).max(200),
  phone: z.string().min(5).max(50),
  company_name: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  website: z.string().max(200).optional(),
  contact_name: z.string().max(200).optional(),
  /** The scan the visitor watched on the landing page, when it survived the trip. */
  scan_id: z.string().uuid().optional(),
})

function firstNameFromFullName(fullName: string): string {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return parts[0] || "לקוח"
}

export async function POST(req: Request) {
  // AUDITOR BLOCKED — first statement executed in this handler.
  if (AUDITOR_BLOCKED) return new NextResponse(null, { status: 404 })

  const cfg = getAuditorConfig()
  if (!cfg.enabled) return new NextResponse(null, { status: 404 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 })

  const email = String(user.email || "").trim().toLowerCase()
  if (!email) return NextResponse.json({ ok: false, error: "Missing user email" }, { status: 400 })

  const admin = createServiceRoleClient()

  /**
   * Claim the pre-signup scan and queue the full one. Runs on every path that
   * returns a company — a returning user reusing an existing company has just as
   * likely scanned again before signing in. Never allowed to break signup, so
   * failures are logged and swallowed like the notification below.
   */
  const attachScans = async (targetCompanyId: string) => {
    try {
      const result = await attachScanToCompany({
        admin,
        companyId: targetCompanyId,
        userId: user.id,
        scanId: parsed.data.scan_id ?? null,
        website: parsed.data.website ?? null,
      })
      console.log("[AUDITOR_BOOTSTRAP] scan attach", { companyId: targetCompanyId, ...result })
      return result
    } catch (err) {
      console.error("[AUDITOR_BOOTSTRAP] scan attach failed", err)
      return null
    }
  }

  /**
   * One lead per signup, on every path that returns a company — including the
   * two that reuse one. Those return early, which is why the older support-inbox
   * notification below only ever saw brand-new companies.
   *
   * Swallowed like the notification: a mail failure must not fail a signup.
   */
  const emitLead = async (
    companyId: string,
    reused: boolean,
    scan: Awaited<ReturnType<typeof attachScans>>
  ) => {
    try {
      const result = await sendAuditorLead({
        email,
        contactName: parsed.data.contact_name || parsed.data.full_name || null,
        companyName: parsed.data.company_name || null,
        website: parsed.data.website || null,
        phone: parsed.data.phone || null,
        companyId,
        reused,
        scan,
      })
      console.log("[AUDITOR_BOOTSTRAP] lead email", { companyId, reused, ...result })
    } catch (err) {
      console.error("[AUDITOR_BOOTSTRAP] lead email failed", err)
    }
  }

  const canonical = await resolveCanonicalAuditorCompany(admin, { userId: user.id, email })
  if (canonical) {
    const companyId = canonical.companyId
    if (canonical.source === "auth_user_id") {
      console.log("[AUDITOR_BOOTSTRAP] existing company found by auth_user_id", { companyId })
    } else if (canonical.source === "company_members") {
      console.log("[AUDITOR_BOOTSTRAP] existing company found by company_members", { companyId })
    } else if (canonical.source === "email") {
      console.log("[AUDITOR_BOOTSTRAP] existing company found by email", { companyId })
    } else if (canonical.source === "paid_charges" || canonical.source === "paid_subscription") {
      console.log("[AUDITOR_BOOTSTRAP] canonical paid company reused", { companyId })
    } else {
      console.log("[AUDITOR_BOOTSTRAP] existing company reused", { companyId, source: canonical.source })
    }
    try {
      await admin.from("companies").update({ auth_user_id: user.id } as any).eq("id", companyId)
    } catch {
      /* ignore */
    }
    try {
      await admin.from("company_members").upsert(
        { company_id: companyId, user_id: user.id, role: "owner", accepted_at: new Date().toISOString() } as any,
        { onConflict: "company_id,user_id" }
      )
    } catch {
      /* ignore */
    }
    const scan = await attachScans(companyId)
    await emitLead(companyId, true, scan)
    return NextResponse.json({ ok: true, company_id: companyId, reused: true })
  }

  const fullName = String(parsed.data.full_name || "").trim()
  const phone = String(parsed.data.phone || "").trim()
  const firstName = firstNameFromFullName(fullName)
  const companyName = String(parsed.data.company_name || "").trim() || fullName || firstName
  const contactName = String(parsed.data.contact_name || "").trim() || fullName || firstName
  const address = String(parsed.data.address || "").trim() || null
  const website = String(parsed.data.website || "").trim() || null

  // Minimal company creation for Auditor (no business-profile step).
  // Keep to columns we already use in auditor billing indicator flow.
  const { data: insertedCompany, error: insErr } = await admin
    .from("companies")
    .insert({
      company_name: companyName,
      business_type: "other",
      tax_id: null,
      contact_first_name: firstName,
      contact_full_name: contactName,
      email,
      mobile_phone: phone || null,
      address: address || undefined,
      website: website || undefined,
      status: "active",
      auth_user_id: user.id,
    } as any)
    .select("id")
    .single()

  if (insErr || !insertedCompany?.id) {
    // Race: someone else created it by email (companies.email unique in this repo)
    const { data: again } = await admin.from("companies").select("id").eq("email", email).maybeSingle()
    if (!again?.id) return NextResponse.json({ ok: false, error: "Failed to create company" }, { status: 500 })
    const scan = await attachScans(String(again.id))
    await emitLead(String(again.id), true, scan)
    return NextResponse.json({ ok: true, company_id: String(again.id), reused: true })
  }

  const companyId = String(insertedCompany.id)
  console.log("[AUDITOR_BOOTSTRAP] new company created as final fallback", { companyId })

  // Track new registration (fire-and-forget — must not break signup)
  try {
    await createRegistrationLog({ email, name: contactName, companyName, website, source: "self_register" })
  } catch (err) {
    console.error("[AUDITOR_BOOTSTRAP] registration log failed", err)
  }

  // Must not break signup — but a non-delivery is logged, not swallowed. The try/catch
  // below could never fire on its own: sendBrevoEmail returns {sent, reason} instead of
  // throwing, so for as long as this only wrapped the call, a rejected registration
  // notice was invisible here.
  try {
    const notice = await sendAdminNotification({
      subject: "New Auditor Registration",
      html: `<p><strong>New Auditor user registered</strong></p>
<ul>
  <li><strong>Email:</strong> ${email}</li>
  <li><strong>Name:</strong> ${contactName || "—"}</li>
  <li><strong>Company:</strong> ${companyName || "—"}</li>
  <li><strong>Website:</strong> ${website || "—"}</li>
  <li><strong>Signup time:</strong> ${new Date().toISOString()}</li>
</ul>`,
    })
    if (!notice?.sent) {
      console.error("[AUDITOR_NOTICE_FAILED] auditor registration, nobody was told", {
        reason: notice?.reason || "unknown",
        email,
        companyName,
      })
    }
  } catch (err) {
    console.error("[AUDITOR_NOTICE_FAILED] auditor registration threw", err)
  }

  // Ensure membership exists (best-effort; schema may vary)
  const nowIso = new Date().toISOString()
  try {
    const { error: memberErr } = await admin.from("company_members").insert({
      company_id: companyId,
      user_id: user.id,
      role: "owner",
      accepted_at: nowIso,
    } as any)
    if (memberErr && String((memberErr as any)?.code || "") === "PGRST204") {
      await admin.from("company_members").insert({ company_id: companyId, user_id: user.id, role: "owner" } as any)
    }
  } catch {
    // ignore
  }

  const scan = await attachScans(companyId)
  await emitLead(companyId, false, scan)
  return NextResponse.json({ ok: true, company_id: companyId })
}


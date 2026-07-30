export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { auditorLeadSchema, normalizeEmail } from "@/lib/auditor/lead"
import { followRedirectsWithValidation, normalizeInputUrl } from "@/lib/auditor/ssrf"
import { sendAuditorLead } from "@/lib/email/sendAuditorLead"
import { auditorContactConsentSentence, auditorTermsConsentSentence } from "@/lib/auditor/consent-text"
import { z } from "zod"

function notFoundIfDisabled() {
  if (String(process.env.AUDITOR_ENABLED || "").trim() !== "true") {
    return new NextResponse(null, { status: 404 })
  }
  return null
}

function token(): string {
  return crypto.randomUUID()
}

/**
 * A single address out of x-forwarded-for, for consent_ip.
 *
 * Behind Vercel the header is a comma-separated chain and the client-supplied
 * end of it is not trustworthy; the left-most entry is the original client as
 * seen by the edge, which is the one worth recording. Falls back to
 * x-real-ip when the chain is absent.
 *
 * Returns null rather than a guess, and never throws. Migration 113 made the
 * column text and not inet for exactly this reason: a malformed header must not
 * be able to fail the insert and cost a lead. Capped so a hostile header cannot
 * push an unbounded string into the row.
 */
function clientIp(req: Request): string | null {
  const chain = String(req.headers.get("x-forwarded-for") || "").trim()
  const first = chain ? chain.split(",")[0].trim() : String(req.headers.get("x-real-ip") || "").trim()
  if (!first) return null
  return first.slice(0, 64)
}

export async function POST(req: Request) {
  const nf = notFoundIfDisabled()
  if (nf) return nf

  const body = await req.json().catch(() => ({}))
  const parsed = auditorLeadSchema
    .and(
      z.object({
        scanId: z.string().min(1).optional(),
        scanAccessToken: z.string().min(1).optional(),
      })
    )
    .safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 })
  }
  if (!parsed.data.consent_terms) {
    return NextResponse.json({ ok: false, error: "Missing required consents" }, { status: 400 })
  }
  // Marketing consent is deliberately NOT required here. It decides whether the
  // report is emailed, nothing more — the report itself opens for anyone who
  // left details. Enforcing it would bundle consent into the service.

  const emailNorm = normalizeEmail(parsed.data.email)
  const startUrl = normalizeInputUrl(parsed.data.url)
  const { finalUrl } = await followRedirectsWithValidation({ startUrl, maxRedirects: 5, timeoutMs: 1500 })
  const origin = finalUrl.origin.replace(/\/+$/, "")
  const normalizedHost = finalUrl.hostname.trim().toLowerCase()

  const admin = createServiceRoleClient()

  /**
   * Tell somebody a lead just came in.
   *
   * This route writes to auditor_leads and, until now, told nobody: the lead
   * email only ever fired from bootstrap-company, which is account creation. A
   * visitor who filled the gate and never opened an account produced a row and
   * no notification — and that is the lead with the shortest shelf life, since
   * their site was scanned a minute ago and they are still looking at the report.
   *
   * Awaited rather than fired and forgotten. sendBrevoEmail catches everything
   * and answers { sent, reason }, so it cannot throw and cannot fail this
   * request, and there is no waitUntil in this project to hand a loose promise
   * to — on a serverless invocation that promise would be racing the response.
   * The try/catch is belt and braces around the shape of the return value.
   *
   * Only where a lead row was actually created. The early return above, where an
   * initial scan already exists for this host and email, inserts nothing and is
   * a resubmission rather than a lead.
   */
  /**
   * What was on screen when they agreed, recorded alongside the two booleans.
   *
   * The booleans say what was agreed to and cannot say what was above the box,
   * which is the half that matters if a consent is ever challenged. Built once
   * and spread into both insert paths so the two can never disagree.
   *
   * The sentences come from lib/auditor/consent-text.ts, the same constant the
   * gate renders, rather than from the request body — a consent record the
   * submitter can author is not evidence. The client only says which locale it
   * rendered.
   *
   * consent_recorded_at is its own timestamp rather than a read of created_at:
   * per migration 113 the row-creation time is the same moment only by
   * coincidence, and a consent record should carry its own.
   *
   * The marketing sentence is stored whether or not the box was ticked. It was
   * rendered either way, and "declined this exact wording" is as much a fact
   * worth keeping as accepting it.
   */
  const consentEvidence = {
    consent_recorded_at: new Date().toISOString(),
    consent_terms_text: auditorTermsConsentSentence(parsed.data.locale),
    consent_contact_text: auditorContactConsentSentence(parsed.data.locale),
    consent_ip: clientIp(req),
  }

  const notifyLead = async () => {
    try {
      const result = await sendAuditorLead({
        email: parsed.data.email.trim(),
        contactName: parsed.data.full_name.trim(),
        phone: parsed.data.phone.trim(),
        website: parsed.data.url.trim(),
        companyId: null,
        stage: "gate",
      })
      console.log("[AUDITOR_LEAD_GATE] lead email", { host: normalizedHost, ...result })
    } catch (err) {
      console.error("[AUDITOR_LEAD_GATE] lead email failed", err)
    }
  }

  // One-time initial scan per (normalized_host, lead_email_normalized)
  const { data: existing } = await admin
    .from("auditor_scans")
    .select("id, scan_access_token")
    .eq("normalized_host", normalizedHost)
    .eq("lead_email_normalized", emailNorm)
    .eq("scan_kind", "initial")
    .eq("created_by_role", "customer")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id && existing?.scan_access_token) {
    return NextResponse.json({ ok: true, scanId: existing.id, scanAccessToken: existing.scan_access_token })
  }

  // If UI already created a pre-scan for screenshot preview, attach the lead to it.
  const maybeScanId = String(parsed.data.scanId || "").trim()
  const maybeScanToken = String(parsed.data.scanAccessToken || "").trim()

  if (maybeScanId && maybeScanToken) {
    const { data: scan } = await admin
      .from("auditor_scans")
      .select("id, scan_access_token, created_by_role, scan_kind, company_id")
      .eq("id", maybeScanId)
      .maybeSingle()

    if (!scan) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
    if (String(scan.scan_access_token || "") !== maybeScanToken) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
    }
    if (scan.company_id !== null || scan.created_by_role !== "customer") {
      return NextResponse.json({ ok: false, error: "Invalid scan" }, { status: 400 })
    }

    const { data: lead, error: leadErr } = await admin
      .from("auditor_leads")
      .insert({
        company_id: null,
        full_name: parsed.data.full_name.trim(),
        email: parsed.data.email.trim(),
        phone: parsed.data.phone.trim(),
        target_url: parsed.data.url.trim(),
        normalized_host: normalizedHost,
        consent_terms: parsed.data.consent_terms,
        consent_contact: parsed.data.consent_contact,
        ...consentEvidence,
      })
      .select("id")
      .single()

    if (leadErr || !lead?.id) {
      return NextResponse.json({ ok: false, error: "Failed to create lead" }, { status: 500 })
    }

    await notifyLead()

    const { data: updated, error: updErr } = await admin
      .from("auditor_scans")
      .update({
        lead_id: lead.id,
        lead_email_normalized: emailNorm,
        created_by_role: "customer",
        scan_kind: "initial",
        target_url: parsed.data.url.trim(),
        normalized_url: origin,
        hostname: finalUrl.hostname,
        normalized_host: normalizedHost,
        page_limit: 10,
      })
      .eq("id", maybeScanId)
      .select("id, scan_access_token")
      .single()

    if (updErr || !updated?.id) {
      // Handle race where partial unique index blocked us; return existing scan if present.
      const { data: again } = await admin
        .from("auditor_scans")
        .select("id, scan_access_token")
        .eq("normalized_host", normalizedHost)
        .eq("lead_email_normalized", emailNorm)
        .eq("scan_kind", "initial")
        .eq("created_by_role", "customer")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (again?.id && again?.scan_access_token) {
        return NextResponse.json({ ok: true, scanId: again.id, scanAccessToken: again.scan_access_token })
      }
      return NextResponse.json({ ok: false, error: "Failed to attach lead" }, { status: 500 })
    }

    return NextResponse.json({ ok: true, scanId: updated.id, scanAccessToken: updated.scan_access_token })
  }

  const { data: lead, error: leadErr } = await admin
    .from("auditor_leads")
    .insert({
      company_id: null,
      full_name: parsed.data.full_name.trim(),
      email: parsed.data.email.trim(),
      phone: parsed.data.phone.trim(),
      target_url: parsed.data.url.trim(),
      normalized_host: normalizedHost,
      consent_terms: parsed.data.consent_terms,
      consent_contact: parsed.data.consent_contact,
      ...consentEvidence,
    })
    .select("id")
    .single()

  if (leadErr || !lead?.id) {
    return NextResponse.json({ ok: false, error: "Failed to create lead" }, { status: 500 })
  }

  await notifyLead()

  const scanAccessToken = token()

  const { data: scan, error: scanErr } = await admin
    .from("auditor_scans")
    .insert({
      company_id: null,
      created_by_user_id: null,
      lead_id: lead.id,
      lead_email_normalized: emailNorm,
      created_by_role: "customer",
      scan_kind: "initial",
      scan_access_token: scanAccessToken,
      status: "queued",
      step: "normalize",
      target_url: parsed.data.url.trim(),
      normalized_url: origin,
      hostname: finalUrl.hostname,
      normalized_host: normalizedHost,
      page_limit: 10,
      artifacts: {},
      coverage: {},
      confidence: {},
      report_public: {},
      report_admin: {},
    })
    .select("id, scan_access_token")
    .single()

  if (scanErr || !scan?.id) {
    // Handle race where partial unique index blocked us; return existing scan if present.
    const { data: again } = await admin
      .from("auditor_scans")
      .select("id, scan_access_token")
      .eq("normalized_host", normalizedHost)
      .eq("lead_email_normalized", emailNorm)
      .eq("scan_kind", "initial")
      .eq("created_by_role", "customer")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (again?.id && again?.scan_access_token) {
      return NextResponse.json({ ok: true, scanId: again.id, scanAccessToken: again.scan_access_token })
    }
    return NextResponse.json({ ok: false, error: "Failed to create scan" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, scanId: scan.id, scanAccessToken: scan.scan_access_token })
}


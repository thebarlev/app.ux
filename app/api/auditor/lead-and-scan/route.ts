export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { auditorLeadSchema, normalizeEmail } from "@/lib/auditor/lead"
import { followRedirectsWithValidation, normalizeInputUrl } from "@/lib/auditor/ssrf"
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

  const emailNorm = normalizeEmail(parsed.data.email)
  const startUrl = normalizeInputUrl(parsed.data.url)
  const { finalUrl } = await followRedirectsWithValidation({ startUrl, maxRedirects: 5, timeoutMs: 1500 })
  const origin = finalUrl.origin.replace(/\/+$/, "")
  const normalizedHost = finalUrl.hostname.trim().toLowerCase()

  const admin = createServiceRoleClient()

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
      })
      .select("id")
      .single()

    if (leadErr || !lead?.id) {
      return NextResponse.json({ ok: false, error: "Failed to create lead" }, { status: 500 })
    }

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
    })
    .select("id")
    .single()

  if (leadErr || !lead?.id) {
    return NextResponse.json({ ok: false, error: "Failed to create lead" }, { status: 500 })
  }

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


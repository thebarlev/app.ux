export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSystemAdmin } from "@/lib/security/system-admin"
import { followRedirectsWithValidation, normalizeInputUrl } from "@/lib/auditor/ssrf"
import { getAdminAuditorCompanyId } from "@/lib/auditor/admin-env"

const bodySchema = z.object({
  url: z.string().min(1).max(2000),
})

function token(): string {
  return crypto.randomUUID()
}

export async function POST(req: Request) {
  try {
    await requireSystemAdmin()
  } catch {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }

  let companyId: string
  try {
    companyId = getAdminAuditorCompanyId()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 })
  }

  const targetUrl = parsed.data.url.trim()
  let startUrl: URL
  try {
    startUrl = normalizeInputUrl(targetUrl)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid URL"
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }

  try {
    const { finalUrl } = await followRedirectsWithValidation({ startUrl, maxRedirects: 5, timeoutMs: 1500 })
    const origin = finalUrl.origin.replace(/\/+$/, "")
    const normalizedHost = finalUrl.hostname.trim().toLowerCase()

    const admin = createServiceRoleClient()
    const scanAccessToken = token()

    const { data: scan, error } = await admin
      .from("auditor_scans")
      .insert({
        company_id: companyId,
        created_by_user_id: null,
        lead_id: null,
        lead_email_normalized: null,
        created_by_role: "system",
        // "manual" triggers the FULL pipeline (keywords, topics, clusters,
        // competitors, content gaps, recommendations, findings). The previous
        // value "verification" was the marketing teaser pipeline (1 page only,
        // no AI) — wrong for the admin tool, which is the concierge expert's
        // primary working surface and needs all data.
        scan_kind: "manual",
        // 10 pages is the same default as "initial" (lead-and-scan) full scans.
        // Increase if needed for sites with deep content; cron-driven scheduled
        // scans cap at 10 too. Higher values multiply Vercel cost roughly linearly.
        page_limit: 10,
        scan_access_token: scanAccessToken,
        status: "queued",
        step: "normalize",
        target_url: targetUrl,
        normalized_url: origin,
        hostname: finalUrl.hostname,
        normalized_host: normalizedHost,
        artifacts: {},
        coverage: {},
        confidence: {},
        report_public: {},
        report_admin: {},
      } as Record<string, unknown>)
      .select("id, scan_access_token")
      .single()

    if (error || !scan?.id) {
      return NextResponse.json({ ok: false, error: "Failed to create scan" }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      scanId: scan.id,
      scanAccessToken: scan.scan_access_token,
    })
  } catch (e: unknown) {
    const msg = String(e instanceof Error ? e.message : e)
    if (msg.includes("blocked") || msg.includes("SSRF") || msg.includes("no_public_ips")) {
      return NextResponse.json({ ok: false, error: "URL not allowed (SSRF protection)" }, { status: 400 })
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSystemAdmin } from "@/lib/security/system-admin"
import { followRedirectsWithValidation, normalizeInputUrl } from "@/lib/auditor/ssrf"
import { getAdminAuditorCompanyId } from "@/lib/auditor/admin-env"

const bodySchema = z.object({
  url: z.string().min(1).max(2000).optional(),
  projectId: z.string().uuid().optional(),
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

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 })
  }

  let targetUrl: string
  let companyId: string

  if (parsed.data.projectId) {
    const admin = createServiceRoleClient()
    const { data: project } = await admin
      .from("auditor_projects")
      .select("id, website_url, domain, customer_id")
      .eq("id", parsed.data.projectId)
      .single()
    const customerId = (project as any)?.customer_id
    if (!customerId) {
      return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 })
    }
    const { data: cust } = await admin
      .from("auditor_customers")
      .select("company_id")
      .eq("id", customerId)
      .single()
    const projCompanyId = (cust as any)?.company_id
    if (!projCompanyId) {
      return NextResponse.json({ ok: false, error: "Project has no company" }, { status: 400 })
    }
    companyId = projCompanyId
    const w = (project as any)?.website_url || ((project as any)?.domain ? `https://${(project as any).domain}` : null)
    if (!w) {
      return NextResponse.json({ ok: false, error: "Project has no website URL" }, { status: 400 })
    }
    targetUrl = w.trim()
  } else {
    try {
      companyId = getAdminAuditorCompanyId()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ ok: false, error: msg }, { status: 500 })
    }
    if (!parsed.data.url) {
      return NextResponse.json({ ok: false, error: "url required when projectId not provided" }, { status: 400 })
    }
    targetUrl = parsed.data.url.trim()
  }
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
        company_id: companyId as string,
        created_by_user_id: null,
        lead_id: null,
        lead_email_normalized: null,
        created_by_role: "system",
        scan_kind: "verification",
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

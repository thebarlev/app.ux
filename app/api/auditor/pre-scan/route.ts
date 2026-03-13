export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { followRedirectsWithValidation, normalizeInputUrl } from "@/lib/auditor/ssrf"

const bodySchema = z.object({
  url: z.string().min(1).max(2000),
})

function notFoundIfDisabled() {
  if (String(process.env.AUDITOR_ENABLED || "").trim() !== "true") {
    return new NextResponse(null, { status: 404 })
  }
  return null
}

function token(): string {
  return crypto.randomUUID()
}

// Public: create a lightweight scan row so we can render preview/screenshot in Step 2.
export async function POST(req: Request) {
  const nf = notFoundIfDisabled()
  if (nf) return nf

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 })

  const targetUrl = parsed.data.url.trim()
  const startUrl = normalizeInputUrl(targetUrl)
  const { finalUrl } = await followRedirectsWithValidation({ startUrl, maxRedirects: 5, timeoutMs: 1500 })
  const origin = finalUrl.origin.replace(/\/+$/, "")
  const normalizedHost = finalUrl.hostname.trim().toLowerCase()

  const admin = createServiceRoleClient()
  const scanAccessToken = token()

  const { data: scan, error } = await admin
    .from("auditor_scans")
    .insert({
      company_id: null,
      created_by_user_id: null,
      lead_id: null,
      lead_email_normalized: null,
      created_by_role: "customer",
      scan_kind: "verification",
      scan_access_token: scanAccessToken,
      status: "queued",
      step: "normalize",
      target_url: targetUrl,
      normalized_url: origin,
      hostname: finalUrl.hostname,
      normalized_host: normalizedHost,
      page_limit: 10,
      artifacts: {},
      coverage: {},
      confidence: {},
      report_public: {},
      report_admin: {},
    } as any)
    .select("id, scan_access_token")
    .single()

  if (error || !scan?.id) {
    return NextResponse.json({ ok: false, error: "Failed to create scan" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, scanId: scan.id, scanAccessToken: scan.scan_access_token })
}


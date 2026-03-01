export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

import { NextResponse } from "next/server"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"

const querySchema = z.object({
  scanId: z.string().min(1),
  token: z.string().min(1),
})

function notFoundIfDisabled() {
  if (String(process.env.AUDITOR_ENABLED || "").trim() !== "true") {
    return new NextResponse(null, { status: 404 })
  }
  return null
}

export async function GET(req: Request) {
  const nf = notFoundIfDisabled()
  if (nf) return nf

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    scanId: url.searchParams.get("scanId"),
    token: url.searchParams.get("token"),
  })
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid query" }, { status: 400 })

  const admin = createServiceRoleClient()
  const { data: scan } = await admin
    .from("auditor_scans")
    .select("id,status,step,score_total,report_public,confidence,updated_at,finished_at,scan_access_token,artifacts")
    .eq("id", parsed.data.scanId)
    .maybeSingle()

  if (!scan) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
  if (String(scan.scan_access_token || "") !== parsed.data.token) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }

  const publicReport = scan.report_public && typeof scan.report_public === "object" ? scan.report_public : {}
  const confidence = scan.confidence && typeof scan.confidence === "object" ? scan.confidence : {}
  const artifacts = scan.artifacts && typeof scan.artifacts === "object" ? scan.artifacts : {}

  const screenshotUrlRaw = typeof (artifacts as any).screenshot_url === "string" ? String((artifacts as any).screenshot_url) : null
  const screenshot_url = screenshotUrlRaw && screenshotUrlRaw.startsWith("/auditor-screenshots/") ? screenshotUrlRaw : null

  // Allowlist sanitizer to ensure report_public never leaks identifiers even if DB contains extra keys.
  const safeReportPublic = {
    score_total: typeof (publicReport as any).score_total === "number" ? (publicReport as any).score_total : null,
    score_search: typeof (publicReport as any).score_search === "number" ? (publicReport as any).score_search : null,
    score_ai: typeof (publicReport as any).score_ai === "number" ? (publicReport as any).score_ai : null,
    category_scores: (publicReport as any).category_scores && typeof (publicReport as any).category_scores === "object" ? (publicReport as any).category_scores : {},
    issues_overview: Array.isArray((publicReport as any).issues_overview) ? (publicReport as any).issues_overview.map((x: any) => String(x)).slice(0, 12) : [],
    confidence_level:
      (publicReport as any).confidence_level === "high" || (publicReport as any).confidence_level === "medium" || (publicReport as any).confidence_level === "low"
        ? (publicReport as any).confidence_level
        : null,
    warning: typeof (publicReport as any).warning === "string" ? String((publicReport as any).warning).slice(0, 140) : null,
  } as const

  // SECURITY: do not leak any technical identifiers; only return the public shape.
  return NextResponse.json(
    {
    ok: true,
    status: scan.status,
    step: scan.step,
    screenshot_url,
    score_total: safeReportPublic.score_total ?? scan.score_total ?? null,
    score_search: safeReportPublic.score_search,
    score_ai: safeReportPublic.score_ai,
    category_scores: safeReportPublic.category_scores,
    issues_overview: safeReportPublic.issues_overview,
    confidence_level: safeReportPublic.confidence_level ?? (confidence as any).level ?? null,
    warning: safeReportPublic.warning ?? (confidence as any).warning ?? null,
    done: scan.status === "done" || scan.status === "failed",
    report_public: scan.status === "done" ? safeReportPublic : null,
    updated_at: scan.updated_at,
    finished_at: scan.finished_at,
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    }
  )
}


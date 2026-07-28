export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { continueAuditorScan } from "@/lib/auditor/pipeline/continue"
import { computeProgress } from "@/lib/auditor/pipeline/progress"

const bodySchema = z.object({
  scanId: z.string().min(1),
  scanAccessToken: z.string().min(1),
})

function notFoundIfDisabled() {
  if (String(process.env.AUDITOR_ENABLED || "").trim() !== "true") {
    return new NextResponse(null, { status: 404 })
  }
  return null
}

export async function POST(req: Request) {
  const nf = notFoundIfDisabled()
  if (nf) return nf

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 })

  const admin = createServiceRoleClient()
  const { data: scan } = await admin
    .from("auditor_scans")
    .select("id,scan_access_token,status,step,scan_kind")
    .eq("id", parsed.data.scanId)
    .maybeSingle()

  if (!scan) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
  if (String(scan.scan_access_token || "") !== parsed.data.scanAccessToken) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }

  if (scan.status === "done") {
    return NextResponse.json({ ok: true, status: scan.status, step: scan.step, progress: 100, done: true })
  }
  if (scan.status === "failed") {
    return NextResponse.json(
      {
        ok: false,
        error: "scan_failed",
        message: "This scan has failed and cannot be continued. Please start a new scan.",
        status: scan.status,
        step: scan.step,
        done: true,
      },
      { status: 409 }
    )
  }

  const isVerification = String((scan as any).scan_kind || "") === "verification"

  if (isVerification) {
    const BUDGET_MS = 4_000
    const deadline = Date.now() + BUDGET_MS
    let lastScan: any = { status: scan.status, step: scan.step }

    while (Date.now() < deadline) {
      const res = await continueAuditorScan({ scanId: parsed.data.scanId, supabase: admin, maxPagesPerBatch: 1 })
      if (!res.ok && res.kind === "busy") {
        await new Promise((r) => setTimeout(r, 150))
        continue
      }
      if (!res.ok) break
      lastScan = res.scan || lastScan
      if (lastScan.status === "done" || lastScan.status === "failed") break
    }

    const done = lastScan.status === "done" || lastScan.status === "failed"
    return NextResponse.json({
      ok: true,
      status: lastScan.status,
      step: lastScan.step,
      progress: computeProgress(lastScan.step),
      done,
    })
  }

  // Regular ("initial") scans advance one step/batch per continueAuditorScan call.
  // Previously this route ran exactly one batch and relied on the browser to keep
  // re-polling /continue for every remaining batch — so when the browser stopped
  // (tab closed / navigated away), scans stalled and were force-finalized empty.
  // We now loop internally for most of the function budget (vercel maxDuration is
  // 60s) so a single request drives many batches, mirroring the verification branch.
  const BUDGET_MS = 50_000
  const deadline = Date.now() + BUDGET_MS
  let lastScan: any = { status: scan.status, step: scan.step }
  let lastErr: { kind: string; message?: string } | null = null

  while (Date.now() < deadline) {
    const res = await continueAuditorScan({ scanId: parsed.data.scanId, supabase: admin })
    if (!res.ok && res.kind === "busy") {
      await new Promise((r) => setTimeout(r, 200))
      continue
    }
    if (!res.ok) {
      lastErr = { kind: res.kind, message: "message" in res ? String((res as any).message) : undefined }
      break
    }
    lastScan = res.scan || lastScan
    if (lastScan.status === "done" || lastScan.status === "failed") break
  }

  if (lastErr) {
    const message = lastErr.message || lastErr.kind
    const status = lastErr.kind === "not_found" ? 404 : lastErr.kind === "forbidden" ? 403 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }

  const done = lastScan.status === "done" || lastScan.status === "failed"
  return NextResponse.json({
    ok: true,
    status: lastScan.status,
    step: lastScan.step,
    progress: computeProgress(lastScan.step),
    done,
  })
}


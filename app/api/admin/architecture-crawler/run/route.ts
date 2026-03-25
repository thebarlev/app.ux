export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { runArchitectureCrawler } from "@/lib/admin/architecture-crawler/crawler"
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit"
import { requireSystemAdmin } from "@/lib/security/system-admin"

const bodySchema = z.object({
  targetCount: z.number().int().min(1).max(1000).optional(),
})

export async function POST(req: Request) {
  let admin: Awaited<ReturnType<typeof requireSystemAdmin>>
  try {
    admin = await requireSystemAdmin()
  } catch {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }

  const ip = getClientIp(req)
  const rl = rateLimit({
    key: `admin-architecture-crawler:${admin.adminId}:${ip}`,
    limit: 2,
    windowMs: 60_000,
  })
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 })
  }

  const result = await runArchitectureCrawler({
    targetCount: parsed.data.targetCount,
  })

  return NextResponse.json({
    ok: true,
    leads: result.leads,
    summary: result.summary,
    warnings: result.warnings,
  })
}

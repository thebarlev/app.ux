export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { runSeoAudit } from "@/lib/admin/seo-audit/crawl"
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit"
import { requireSystemAdmin } from "@/lib/security/system-admin"

const bodySchema = z.object({
  url: z.string().min(1).max(2_000),
  maxPages: z.number().int().min(1).max(50).optional(),
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
    key: `admin-seo-audit:${admin.adminId}:${ip}`,
    limit: 3,
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

  const payload = parsed.data
  console.info(
    "[SEO_AUDIT_RUN]",
    JSON.stringify({
      adminId: admin.adminId,
      userId: admin.userId,
      url: payload.url,
      maxPages: payload.maxPages || 50,
    })
  )

  try {
    const report = await runSeoAudit({
      url: payload.url,
      options: {
        maxPages: payload.maxPages,
      },
    })
    return NextResponse.json({
      ok: true,
      ...report,
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: String(error instanceof Error ? error.message : error) },
      { status: 400 }
    )
  }
}

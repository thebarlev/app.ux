export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { buildIndexExtractorCsv } from "@/lib/admin/index-extractor/export-csv"
import { INDEX_EXTRACTOR_CSV_HEADERS } from "@/lib/admin/index-extractor/types"
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit"
import { requireSystemAdmin } from "@/lib/security/system-admin"

const rowSchema = z.object(
  Object.fromEntries(INDEX_EXTRACTOR_CSV_HEADERS.map((header) => [header, z.string()])) as Record<
    (typeof INDEX_EXTRACTOR_CSV_HEADERS)[number],
    z.ZodString
  >
)

const bodySchema = z.object({
  rows: z.array(rowSchema).max(10_000),
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
    key: `admin-index-extractor-export:${admin.adminId}:${ip}`,
    limit: 8,
    windowMs: 60_000,
  })
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid export payload" }, { status: 400 })
  }

  const csv = buildIndexExtractorCsv(parsed.data.rows)
  const fileName = `index-data-extractor-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  })
}

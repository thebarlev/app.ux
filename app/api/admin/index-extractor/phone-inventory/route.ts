export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { scanIndexExtractorPhoneInventory } from "@/lib/admin/index-extractor/phone-inventory"
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit"
import { requireSystemAdmin } from "@/lib/security/system-admin"

export async function POST(req: Request) {
  let admin: Awaited<ReturnType<typeof requireSystemAdmin>>
  try {
    admin = await requireSystemAdmin()
  } catch {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }

  const ip = getClientIp(req)
  const rl = rateLimit({
    key: `admin-index-extractor-phone-inventory:${admin.adminId}:${ip}`,
    limit: 8,
    windowMs: 60_000,
  })
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) })
  }

  const result = await scanIndexExtractorPhoneInventory()
  return NextResponse.json({ ok: true, ...result })
}

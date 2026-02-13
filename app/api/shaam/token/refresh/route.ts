export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveCurrentCompanyId } from "@/lib/shaam/company"
import { refreshShaamTokenManual } from "@/lib/shaam/tokens"

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })
  }

  const companyId = await resolveCurrentCompanyId()
  const r = await refreshShaamTokenManual({ companyId })

  if (r.ok) {
    return NextResponse.json({ ok: true, connected: r.connected, status: r.status, expires_at: r.expires_at })
  }

  // Cooldown is not an error (user can retry later)
  if (r.message === "cooldown") {
    return NextResponse.json({
      ok: false,
      connected: r.connected,
      status: r.status,
      expires_at: r.expires_at,
      cooldown_seconds_remaining: r.cooldown_seconds_remaining ?? null,
      message: "cooldown",
    })
  }

  if (r.status === "missing") {
    return NextResponse.json({ ok: false, connected: false, status: "missing", expires_at: null, message: "not_connected" }, { status: 404 })
  }

  const statusCode = r.status === "expired" ? 401 : 500
  return NextResponse.json(
    { ok: false, connected: false, status: r.status, expires_at: r.expires_at, message: r.message || "refresh_failed" },
    { status: statusCode }
  )
}


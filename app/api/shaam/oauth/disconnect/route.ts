export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveCurrentCompanyId } from "@/lib/shaam/company"
import { disconnectShaam } from "@/lib/shaam/tokens"

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })
  }

  const companyId = await resolveCurrentCompanyId()
  await disconnectShaam({ companyId })

  return NextResponse.json({ ok: true, connected: false, status: "revoked" })
}


import { NextResponse, type NextRequest } from "next/server"

import { createClient } from "@/lib/supabase/server"

function sanitizeNextPath(nextParam: string | null) {
  if (!nextParam) return "/reset-password"
  // Allow only relative, same-origin paths.
  // Reject protocol-relative URLs like `//evil.com`.
  if (!nextParam.startsWith("/") || nextParam.startsWith("//")) return "/reset-password"
  return nextParam
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const next = sanitizeNextPath(url.searchParams.get("next"))

  if (!code) {
    return NextResponse.redirect(new URL(`/login?e=missing_code`, url.origin))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(new URL(`/login?e=callback_failed`, url.origin))
  }

  return NextResponse.redirect(new URL(next, url.origin))
}


import { NextRequest, NextResponse } from "next/server";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";

// Force Node.js runtime
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request);
  const rl = rateLimit({ key: `legacy-receipt-pdf:${ip}`, limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const params = await context.params
  const receiptId = params.id

  // Legacy endpoint: never generate PDFs here.
  // Always redirect to the unified (signed-only) documents PDF route.
  const url = new URL(request.url)
  const redirectUrl = new URL(`/api/documents/${receiptId}/pdf`, url)
  redirectUrl.searchParams.set("issue", "copy")
  // Preserve lang if provided; default to Hebrew
  const lang = url.searchParams.get("lang")
  if (lang === "en" || lang === "he") redirectUrl.searchParams.set("lang", lang)
  return NextResponse.redirect(redirectUrl, { status: 302 })
}

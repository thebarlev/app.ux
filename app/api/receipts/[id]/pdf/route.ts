import { NextRequest, NextResponse } from "next/server";

// Force Node.js runtime
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

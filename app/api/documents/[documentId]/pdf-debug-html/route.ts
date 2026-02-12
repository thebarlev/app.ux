import { NextResponse } from "next/server"
import { getPdfDebugInfo } from "@/lib/pdf-service"

function isAllowed(req: Request) {
  if (process.env.NODE_ENV === "development") return true
  const expected = String(process.env.DEBUG_PDF_SECRET || "").trim()
  if (!expected) return false
  const got = String(req.headers.get("x-debug-secret") || "").trim()
  return got && expected && got === expected
}

export async function GET(req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  if (!isAllowed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { documentId } = await params
  const url = new URL(req.url)
  const lang = url.searchParams.get("lang") === "en" ? "en" : "he"
  const issue = url.searchParams.get("issue") === "original" ? "original" : "copy"

  const info = await getPdfDebugInfo({
    documentId,
    language: lang,
    issue,
  })

  return new NextResponse(info.final_html_for_renderer || "", {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}


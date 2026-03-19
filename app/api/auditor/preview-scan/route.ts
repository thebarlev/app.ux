export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { z } from "zod"
import { normalizeInputUrl, followRedirectsWithValidation } from "@/lib/auditor/ssrf"
import { fetchTextBounded } from "@/lib/auditor/fetch"
import { extractFromHtml } from "@/lib/auditor/extract"

const bodySchema = z.object({
  url: z.string().min(1).max(2000),
})

type Issue = { id: string; text: string; impact: "high" | "medium" | "low" }

function computePreviewScore(extracted: ReturnType<typeof extractFromHtml>, wordCount: number) {
  let score = 100
  const issues: Issue[] = []

  if (!extracted.title) {
    score -= 15
    issues.push({ id: "missing_title", text: "Missing page title", impact: "high" })
  }

  if (!extracted.metaDescription) {
    score -= 10
    issues.push({ id: "missing_meta_description", text: "Missing meta description", impact: "high" })
  }

  if (extracted.h1Count === 0) {
    score -= 10
    issues.push({ id: "missing_h1", text: "No H1 heading found", impact: "high" })
  } else if (extracted.h1Count > 1) {
    score -= 5
    issues.push({ id: "multiple_h1", text: `Multiple H1 headings (${extracted.h1Count})`, impact: "medium" })
  }

  if (!extracted.viewportPresent) {
    score -= 5
    issues.push({ id: "missing_viewport", text: "Missing viewport meta tag (mobile-unfriendly)", impact: "medium" })
  }

  if (wordCount < 300) {
    score -= 10
    issues.push({ id: "low_word_count", text: `Low content (${wordCount} words, recommended 300+)`, impact: "medium" })
  }

  if (!extracted.hasOg) {
    score -= 5
    issues.push({ id: "missing_og", text: "No Open Graph tags found", impact: "medium" })
  }

  if (extracted.jsonldTypes.length === 0) {
    score -= 5
    issues.push({ id: "missing_structured_data", text: "No structured data (JSON-LD) found", impact: "medium" })
  }

  if (!extracted.canonical) {
    score -= 5
    issues.push({ id: "missing_canonical", text: "No canonical URL defined", impact: "medium" })
  }

  if (extracted.imagesMissingAltCount > 3) {
    score -= 5
    issues.push({ id: "images_missing_alt", text: `${extracted.imagesMissingAltCount} images without alt text`, impact: "low" })
  }

  if (extracted.internalLinksCount === 0) {
    score -= 5
    issues.push({ id: "no_internal_links", text: "No internal links found", impact: "low" })
  }

  if (!extracted.tracking.hasGtm && !extracted.tracking.hasGa4) {
    score -= 5
    issues.push({ id: "no_analytics", text: "No analytics tracking detected (GTM / GA4)", impact: "low" })
  }

  return { score: Math.max(0, Math.min(100, score)), issues }
}

export async function POST(req: Request) {
  if (String(process.env.AUDITOR_ENABLED || "").trim() !== "true") {
    return new NextResponse(null, { status: 404 })
  }

  const started = Date.now()

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid URL" }, { status: 400 })
  }

  let finalOrigin: string
  try {
    const startUrl = normalizeInputUrl(parsed.data.url.trim())
    const { finalUrl } = await followRedirectsWithValidation({ startUrl, maxRedirects: 3, timeoutMs: 1000 })
    finalOrigin = finalUrl.origin.replace(/\/+$/, "")
  } catch (e: any) {
    const msg = String(e?.message || "")
    if (msg.includes("ssrf") || msg.includes("blocked")) {
      return NextResponse.json({ ok: false, error: "URL is not allowed" }, { status: 400 })
    }
    return NextResponse.json({
      ok: true,
      status: "preview",
      url: parsed.data.url,
      score: 0,
      issues: [{ id: "fetch_failed", text: "Could not reach the website", impact: "high" }],
      highlights: null,
      elapsed_ms: Date.now() - started,
    })
  }

  const fetchResult = await fetchTextBounded({
    url: finalOrigin,
    timeoutMs: 1000,
    maxBytes: 500_000,
    headers: { "user-agent": "VOW-Auditor-Preview/1.0" },
  })

  if (!fetchResult.ok || fetchResult.status < 200 || fetchResult.status >= 400) {
    return NextResponse.json({
      ok: true,
      status: "preview",
      url: finalOrigin,
      score: 0,
      issues: [{ id: "fetch_failed", text: "Could not reach the website", impact: "high" as const }],
      highlights: null,
      elapsed_ms: Date.now() - started,
    })
  }

  const extracted = extractFromHtml(fetchResult.text, finalOrigin)

  const bodyText = fetchResult.text.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")
  const textOnly = bodyText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  const wordCount = textOnly ? textOnly.split(/\s+/).filter(Boolean).length : 0

  const { score, issues } = computePreviewScore(extracted, wordCount)

  return NextResponse.json({
    ok: true,
    status: "preview",
    url: finalOrigin,
    score,
    issues,
    highlights: {
      title: extracted.title,
      description: extracted.metaDescription,
      h1: extracted.analysis.headings.h1[0] || null,
      h2Count: extracted.headingsOutline.h2,
      wordCount,
      hasStructuredData: extracted.jsonldTypes.length > 0,
      hasAnalytics: extracted.tracking.hasGtm || extracted.tracking.hasGa4,
      imageCount: extracted.analysis.images.length,
      internalLinksCount: extracted.internalLinksCount,
    },
    elapsed_ms: Date.now() - started,
  })
}

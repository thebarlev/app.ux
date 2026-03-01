import * as cheerio from "cheerio"

type Extracted = {
  title: string | null
  metaDescription: string | null
  canonical: string | null
  metaRobots: string | null
  viewportPresent: boolean
  lang: string | null
  dir: string | null
  hasOg: boolean
  hasTwitter: boolean
  jsonldTypes: string[]
  hasFAQPage: boolean
  hasArticle: boolean
  h1Count: number
  headingsOutline: { h1: number; h2: number; h3: number }
  imagesMissingAltCount: number
  internalLinksCount: number
  questionHeadingsCount: number
  tracking: {
    hasGtm: boolean
    hasGa4: boolean
    gtmIds: string[]
    ga4Ids: string[]
  }
}

function uniqStrings(xs: string[]): string[] {
  const out: string[] = []
  const s = new Set<string>()
  for (const x of xs) {
    const v = String(x || "").trim()
    if (!v || s.has(v)) continue
    s.add(v)
    out.push(v)
  }
  return out
}

function parseJsonldTypes(jsonText: string): string[] {
  const types: string[] = []
  const pushType = (t: any) => {
    if (!t) return
    if (Array.isArray(t)) t.forEach(pushType)
    else types.push(String(t))
  }

  const walk = (node: any) => {
    if (!node) return
    if (Array.isArray(node)) return node.forEach(walk)
    if (typeof node !== "object") return
    pushType(node["@type"])
    for (const v of Object.values(node)) walk(v)
  }

  try {
    const parsed = JSON.parse(jsonText)
    walk(parsed)
  } catch {
    // ignore invalid JSON-LD
  }

  return uniqStrings(types)
}

export function extractFromHtml(html: string): Extracted {
  const $ = cheerio.load(html || "")

  const title = $("title").first().text().trim() || null
  const metaDescription =
    $("meta[name='description']").attr("content")?.trim() ||
    $("meta[name='Description']").attr("content")?.trim() ||
    null

  const canonical = $("link[rel='canonical']").attr("href")?.trim() || null
  const metaRobots =
    $("meta[name='robots']").attr("content")?.trim() ||
    $("meta[name='ROBOTS']").attr("content")?.trim() ||
    null
  const viewportPresent = $("meta[name='viewport']").length > 0
  const lang = $("html").attr("lang")?.trim() || null
  const dir = $("html").attr("dir")?.trim() || null

  const hasOg = $("meta[property^='og:']").length > 0
  const hasTwitter = $("meta[name^='twitter:']").length > 0

  const jsonldTypes: string[] = []
  $("script[type='application/ld+json']").each((_, el) => {
    const text = $(el).text()
    if (!text) return
    parseJsonldTypes(text).forEach((t) => jsonldTypes.push(t))
  })
  const jsonldTypesUniq = uniqStrings(jsonldTypes)
  const hasFAQPage = jsonldTypesUniq.some((t) => t.toLowerCase() === "faqpage")
  const hasArticle = jsonldTypesUniq.some((t) => t.toLowerCase() === "article")

  const h1Count = $("h1").length
  const headingsOutline = { h1: h1Count, h2: $("h2").length, h3: $("h3").length }

  const imagesMissingAltCount = $("img").filter((_, el) => !String($(el).attr("alt") || "").trim()).length
  const internalLinksCount = $("a[href]")
    .map((_, el) => String($(el).attr("href") || "").trim())
    .toArray()
    .filter((href) => href.startsWith("/"))
    .length

  const questionHeadingsCount = $("h2, h3")
    .map((_, el) => String($(el).text() || "").trim())
    .toArray()
    .filter((t) => t.endsWith("?"))
    .length

  const bodyText = html || ""
  const gtmIds = uniqStrings(Array.from(bodyText.matchAll(/GTM-[0-9A-Z]+/g)).map((m) => m[0]))
  const ga4Ids = uniqStrings(Array.from(bodyText.matchAll(/\bG-[A-Z0-9]{6,}\b/g)).map((m) => m[0]))

  const hasGtm =
    gtmIds.length > 0 ||
    bodyText.includes("www.googletagmanager.com/gtm.js") ||
    bodyText.includes("googletagmanager.com/gtm.js")

  const hasGa4 =
    ga4Ids.length > 0 ||
    bodyText.includes("www.googletagmanager.com/gtag/js") ||
    bodyText.includes("gtag('config'") ||
    bodyText.includes('gtag(\"config\"') ||
    bodyText.includes("G-")

  return {
    title,
    metaDescription,
    canonical,
    metaRobots,
    viewportPresent,
    lang,
    dir,
    hasOg,
    hasTwitter,
    jsonldTypes: jsonldTypesUniq,
    hasFAQPage,
    hasArticle,
    h1Count,
    headingsOutline,
    imagesMissingAltCount,
    internalLinksCount,
    questionHeadingsCount,
    tracking: {
      hasGtm,
      hasGa4,
      gtmIds,
      ga4Ids,
    },
  }
}


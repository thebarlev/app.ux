import * as cheerio from "cheerio"

export type ExtractedHeading = {
  level: number
  text: string
}

export type ExtractedLink = {
  href: string
  text: string
  isInternal: boolean
}

export type PageContent = {
  title: string | null
  headings: ExtractedHeading[]
  paragraphs: string[]
  links: ExtractedLink[]
  entities: string[]
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function resolveHref(rawHref: string, pageUrl?: string | null): string | null {
  const href = normalizeWhitespace(String(rawHref || ""))
  if (!href) return null
  if (href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) return null
  if (href.startsWith("#")) return href

  try {
    return pageUrl ? new URL(href, pageUrl).toString() : href
  } catch {
    return href
  }
}

function isInternalHref(href: string, pageUrl?: string | null): boolean {
  if (!href) return false
  if (href.startsWith("/") || href.startsWith("#")) return true
  if (!pageUrl) return false

  try {
    return new URL(href, pageUrl).hostname.toLowerCase() === new URL(pageUrl).hostname.toLowerCase()
  } catch {
    return false
  }
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const normalized = normalizeWhitespace(String(value || ""))
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(normalized)
  }
  return out
}

function normalizeEntity(value: string): string {
  return normalizeWhitespace(value.replace(/[.,;:!?()"'`]+/g, " "))
}

function selectContentRoot($: cheerio.CheerioAPI): cheerio.Cheerio<any> {
  const candidates = [
    "main",
    "article",
    "[role='main']",
    ".main",
    "#main",
    ".content",
    "#content",
    ".post-content",
    ".entry-content",
    ".article-content",
  ]

  for (const selector of candidates) {
    const match = $(selector).first()
    if (match.length > 0) return match
  }

  return $("body").first().length > 0 ? $("body").first() : $.root()
}

function detectEntities(textBlocks: string[]): string[] {
  const phrases: string[] = []
  const titleCase = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g
  const acronyms = /\b[A-Z]{2,}(?:\s+[A-Z]{2,})?\b/g
  const hebrewOrMixed = /([\p{Script=Hebrew}\p{L}\p{N}][\p{Script=Hebrew}\p{L}\p{N}&/-]{2,}(?:\s+[\p{Script=Hebrew}\p{L}\p{N}&/-]{2,}){0,2})/gu

  for (const block of textBlocks.slice(0, 20)) {
    for (const match of block.matchAll(titleCase)) {
      phrases.push(match[0])
    }
    for (const match of block.matchAll(acronyms)) {
      phrases.push(match[0])
    }
    for (const match of block.matchAll(hebrewOrMixed)) {
      const candidate = normalizeEntity(match[0])
      if (!candidate) continue
      const words = candidate.split(/\s+/)
      if (words.length === 0 || words.length > 4) continue
      if (candidate.length < 3) continue
      phrases.push(candidate)
    }
  }

  return uniqueStrings(
    phrases.map(normalizeEntity).filter((value) => {
      const words = value.split(/\s+/)
      return value.length >= 3 && words.length <= 4
    })
  ).slice(0, 20)
}

export function extractPageContent(html: string, pageUrl?: string | null): PageContent {
  const sourceHtml = String(html || "")
  const $ = cheerio.load(sourceHtml)
  $("script, style, noscript, template, svg").remove()
  const root = selectContentRoot($)

  const headings = root.find("h1, h2, h3, h4, h5, h6")
    .map((_, el) => {
      const tagName = el.tagName?.toLowerCase() || "h2"
      const level = Number(tagName.replace("h", "")) || 2
      const text = normalizeWhitespace($(el).text())
      if (!text) return null
      return { level, text }
    })
    .toArray()
    .filter((item): item is ExtractedHeading => Boolean(item))

  const paragraphs = uniqueStrings(
    root
      .find("p, li, blockquote")
      .map((_, el) => normalizeWhitespace($(el).text()))
      .toArray()
      .filter((text) => text.length >= 25)
  ).slice(0, 30)

  const links = root
    .find("a[href]")
    .map((_, el) => {
      const href = resolveHref(String($(el).attr("href") || ""), pageUrl)
      const text = normalizeWhitespace($(el).text())
      if (!href) return null
      return {
        href,
        text: text || href,
        isInternal: isInternalHref(href, pageUrl),
      }
    })
    .toArray()
    .filter((item): item is ExtractedLink => Boolean(item))
    .slice(0, 50)

  const combinedText = [
    $("title").first().text() || "",
    ...headings.map((heading) => heading.text),
    ...paragraphs,
  ]

  return {
    title: normalizeWhitespace($("title").first().text() || root.find("h1").first().text() || "") || null,
    headings,
    paragraphs,
    links,
    entities: detectEntities(combinedText),
  }
}

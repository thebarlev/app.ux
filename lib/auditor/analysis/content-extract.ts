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

export type PageAnalysis = {
  headings: {
    h1: string[]
    h2: string[]
    h3: string[]
  }
  links: Array<{
    href: string
    anchor: string
  }>
  images: Array<{
    src: string
    alt: string
  }>
  accessibility: Array<{
    aria_label: string
    aria_labelledby: string
    role: string
  }>
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
  return $("main").first().length
    ? $("main").first()
    : $("article").first().length
      ? $("article").first()
      : $("[role='main']").first().length
        ? $("[role='main']").first()
        : $("body")
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

export function extractPageAnalysis(html: string): PageAnalysis {
  const sourceHtml = String(html || "")
  const $ = cheerio.load(sourceHtml)
  $("script, style, noscript, template, svg").remove()

  const root = selectContentRoot($)

  const headings = {
    h1: root.find("h1").map((_, el) => $(el).text().trim()).get().filter(Boolean),
    h2: root.find("h2").map((_, el) => $(el).text().trim()).get().filter(Boolean),
    h3: root.find("h3").map((_, el) => $(el).text().trim()).get().filter(Boolean),
  }

  const links = root
    .find("a[href]")
    .map((_, el) => ({
      href: $(el).attr("href") || "",
      anchor: $(el).text().trim(),
    }))
    .get()
    .filter((link) => link.href || link.anchor)

  const images = root
    .find("img")
    .map((_, el) => ({
      src: $(el).attr("src") || "",
      alt: $(el).attr("alt") || "",
    }))
    .get()
    .filter((image) => image.src || image.alt)

  const accessibility = root
    .find("[aria-label], [aria-labelledby], [role]")
    .map((_, el) => ({
      aria_label: $(el).attr("aria-label") || "",
      aria_labelledby: $(el).attr("aria-labelledby") || "",
      role: $(el).attr("role") || "",
    }))
    .get()
    .filter((item) => item.aria_label || item.aria_labelledby || item.role)

  return {
    headings,
    links,
    images,
    accessibility,
  }
}

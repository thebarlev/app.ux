import { XMLParser } from "fast-xml-parser"

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

export type SitemapParseResult = {
  urls: string[]
  childSitemaps: string[]
}

export function parseSitemapXml(xml: string): SitemapParseResult {
  const parser = new XMLParser({
    ignoreAttributes: true,
    allowBooleanAttributes: true,
    parseTagValue: true,
    trimValues: true,
  })

  let parsed: any
  try {
    parsed = parser.parse(xml)
  } catch {
    return { urls: [], childSitemaps: [] }
  }

  const urlset = parsed?.urlset
  const sitemapindex = parsed?.sitemapindex

  if (urlset) {
    const urlNodes = asArray<any>(urlset.url)
    const urls = urlNodes
      .map((u) => (u?.loc ? String(u.loc).trim() : ""))
      .filter(Boolean)
    return { urls, childSitemaps: [] }
  }

  if (sitemapindex) {
    const smNodes = asArray<any>(sitemapindex.sitemap)
    const childSitemaps = smNodes
      .map((s) => (s?.loc ? String(s.loc).trim() : ""))
      .filter(Boolean)
    return { urls: [], childSitemaps }
  }

  return { urls: [], childSitemaps: [] }
}


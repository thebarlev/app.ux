import { normalizeInputUrl, resolveAndValidateHost } from "@/lib/auditor/ssrf"

function splitDomains(value: string | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
}

function matchesDomain(hostname: string, domainRule: string): boolean {
  return hostname === domainRule || hostname.endsWith(`.${domainRule}`)
}

export type DomainPolicyDecision = {
  allowed: boolean
  reason?: string
}

export async function validatePublicHttpUrl(rawUrl: string): Promise<URL> {
  const url = normalizeInputUrl(rawUrl)
  await resolveAndValidateHost({ hostname: url.hostname })
  return url
}

export function evaluateDomainPolicy(hostname: string): DomainPolicyDecision {
  const h = hostname.toLowerCase()
  const allowlist = splitDomains(process.env.INDEX_EXTRACTOR_DOMAIN_ALLOWLIST)
  const blocklist = splitDomains(process.env.INDEX_EXTRACTOR_DOMAIN_BLOCKLIST)

  if (blocklist.some((rule) => matchesDomain(h, rule))) {
    return { allowed: false, reason: "domain_blocked" }
  }

  if (allowlist.length > 0 && !allowlist.some((rule) => matchesDomain(h, rule))) {
    return { allowed: false, reason: "domain_not_allowlisted" }
  }

  return { allowed: true }
}

export function canonicalizeUrl(input: string | URL): string {
  const url = typeof input === "string" ? new URL(input) : new URL(input.toString())
  url.hash = ""

  const sorted = new URLSearchParams()
  const entries = Array.from(url.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b))
  for (const [k, v] of entries) sorted.append(k, v)
  url.search = sorted.toString()

  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "")
  }

  return url.toString()
}

export function isLikelyBinaryPath(pathname: string): boolean {
  return /\.(pdf|jpg|jpeg|png|gif|webp|svg|ico|mp4|mov|avi|zip|rar|7z|tar|gz|tgz|css|js|map|woff2?|ttf|eot)(\?|#|$)/i.test(
    pathname
  )
}

import dns from "node:dns/promises"
import ipaddr from "ipaddr.js"

type ResolvedIp = { address: string; family: 4 | 6 }

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}_timeout`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase()
  if (h === "localhost") return true
  if (h.endsWith(".localhost")) return true
  return false
}

function isPublicIp(ip: string): boolean {
  try {
    const addr = ipaddr.parse(ip)
    const range = addr.range()
    if (range !== "unicast") return false
    // Explicit metadata IPs (already covered by linkLocal, but keep explicit).
    if (ip === "169.254.169.254") return false
    if (ip === "100.100.100.200") return false
    return true
  } catch {
    return false
  }
}

export async function resolveAndValidateHost(params: {
  hostname: string
  timeoutMs?: number
}): Promise<{ ips: ResolvedIp[] }> {
  const hostname = params.hostname.trim()
  if (!hostname) throw new Error("empty_hostname")
  if (isBlockedHostname(hostname)) throw new Error("blocked_hostname")

  // If hostname is already an IP literal, validate it directly.
  if (ipaddr.isValid(hostname)) {
    if (!isPublicIp(hostname)) throw new Error("blocked_ip")
    const parsed = ipaddr.parse(hostname)
    const family: 4 | 6 = parsed.kind() === "ipv6" ? 6 : 4
    return { ips: [{ address: hostname, family }] }
  }

  const timeoutMs = typeof params.timeoutMs === "number" ? params.timeoutMs : 1200
  const lookedUp = await withTimeout(
    dns.lookup(hostname, { all: true, verbatim: true }) as Promise<Array<{ address: string; family: number }>>,
    timeoutMs,
    "dns_lookup"
  )

  const ips: ResolvedIp[] = lookedUp
    .map((r) => ({ address: String(r.address), family: r.family === 6 ? (6 as const) : (4 as const) }))
    .filter((r) => isPublicIp(r.address))

  if (ips.length === 0) throw new Error("no_public_ips")
  return { ips }
}

export function normalizeInputUrl(input: string): URL {
  const raw = String(input || "").trim()
  if (!raw) throw new Error("missing_url")
  const withScheme = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`
  const url = new URL(withScheme)
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("invalid_protocol")
  if (url.username || url.password) throw new Error("credentials_not_allowed")
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("invalid_port")
  return url
}

export async function validateUrlAgainstSSRF(params: { url: URL }): Promise<{ url: URL; hostname: string }> {
  const hostname = params.url.hostname
  await resolveAndValidateHost({ hostname })
  return { url: params.url, hostname }
}

export async function followRedirectsWithValidation(params: {
  startUrl: URL
  maxRedirects?: number
  timeoutMs?: number
  hostLock?: string
}): Promise<{ finalUrl: URL; redirects: string[] }> {
  const maxRedirects = typeof params.maxRedirects === "number" ? params.maxRedirects : 5
  const timeoutMs = typeof params.timeoutMs === "number" ? params.timeoutMs : 1500
  const redirects: string[] = []

  let current = params.startUrl
  for (let i = 0; i <= maxRedirects; i++) {
    if (params.hostLock && current.hostname.toLowerCase() !== params.hostLock.toLowerCase()) {
      throw new Error("host_lock_violation")
    }
    await validateUrlAgainstSSRF({ url: current })

    const doRequest = async (method: "HEAD" | "GET") => {
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), timeoutMs)
      try {
        const res = await fetch(current.toString(), { method, redirect: "manual", signal: ac.signal })
        // Avoid downloading bodies; we only need headers/status for redirects.
        try {
          res.body?.cancel()
        } catch {
          // ignore
        }
        return res
      } finally {
        clearTimeout(timer)
      }
    }

    // Prefer HEAD to keep requests tiny; fall back to GET for servers that reject HEAD.
    let res = await doRequest("HEAD")
    if (res.status === 405) {
      res = await doRequest("GET")
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location")
      if (!loc) throw new Error("redirect_missing_location")
      const next = new URL(loc, current)
      if (next.protocol !== "http:" && next.protocol !== "https:") throw new Error("redirect_invalid_protocol")
      if (next.port && next.port !== "80" && next.port !== "443") throw new Error("redirect_invalid_port")
      redirects.push(next.toString())
      current = next
      continue
    }

    return { finalUrl: current, redirects }
  }

  throw new Error("too_many_redirects")
}


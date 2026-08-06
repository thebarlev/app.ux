type RateLimitResult =
  | { allowed: true; limit: number; remaining: number; resetAtMs: number }
  | { allowed: false; limit: number; remaining: 0; resetAtMs: number; retryAfterSeconds: number }

type RecordValue = { count: number; resetAtMs: number }

const GLOBAL_KEY = "__vow_rate_limit_store__"

function store(): Map<string, RecordValue> {
  const g = globalThis as any
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map<string, RecordValue>()
  return g[GLOBAL_KEY] as Map<string, RecordValue>
}

/**
 * Resolve the client IP from the most platform-controlled source available.
 *
 * Order, per Vercel's request-headers reference:
 *   1. `x-vercel-forwarded-for` — set by Vercel. Documented as identical to
 *      x-forwarded-for, but it is the one that still holds when "a proxy on top
 *      of Vercel" overwrites x-forwarded-for. Most trustworthy, so it wins.
 *   2. `x-real-ip` — also set by Vercel, documented as identical.
 *   3. `x-forwarded-for` — last resort. If it is a list we take the LAST entry,
 *      not the first: entries are appended hop by hop, so the right-hand side is
 *      the value added by the nearest hop, while the left-hand side is whatever
 *      the original caller supplied. The previous implementation read the FIRST
 *      entry, which off-Vercel (local, or behind another proxy) is attacker-
 *      controlled and let a rotating header reset every counter.
 *
 * On Vercel today x-forwarded-for is itself overwritten by the platform, which
 * strips external IPs specifically to prevent spoofing — so the practical
 * exposure of the old code in production was smaller than it looks. This order
 * is defence in depth: it keeps holding if a proxy is ever put in front of
 * Vercel, or if Enterprise "Trusted Proxy" (custom X-Forwarded-For) is enabled.
 *
 * Returns "unknown" when no source is present. Note that every caller then
 * shares the single "unknown" bucket.
 */
export function getClientIp(req: Request): string {
  const platformIp =
    req.headers.get("x-vercel-forwarded-for") || req.headers.get("x-real-ip")
  if (platformIp) {
    const ip = String(platformIp).split(",").pop()?.trim()
    if (ip) return ip
  }

  const xff = req.headers.get("x-forwarded-for")
  if (xff) {
    const ip = String(xff).split(",").pop()?.trim()
    if (ip) return ip
  }

  return "unknown"
}

export function rateLimit(params: {
  key: string
  limit: number
  windowMs: number
  nowMs?: number
}): RateLimitResult {
  const now = typeof params.nowMs === "number" ? params.nowMs : Date.now()
  const s = store()

  const existing = s.get(params.key)
  if (!existing || now >= existing.resetAtMs) {
    const resetAtMs = now + params.windowMs
    s.set(params.key, { count: 1, resetAtMs })
    return { allowed: true, limit: params.limit, remaining: Math.max(0, params.limit - 1), resetAtMs }
  }

  if (existing.count >= params.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAtMs - now) / 1000))
    return { allowed: false, limit: params.limit, remaining: 0, resetAtMs: existing.resetAtMs, retryAfterSeconds }
  }

  existing.count += 1
  s.set(params.key, existing)
  return {
    allowed: true,
    limit: params.limit,
    remaining: Math.max(0, params.limit - existing.count),
    resetAtMs: existing.resetAtMs,
  }
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const resetSeconds = Math.floor(result.resetAtMs / 1000)
  const base: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(resetSeconds),
  }
  if (!result.allowed) {
    base["Retry-After"] = String(result.retryAfterSeconds)
  }
  return base
}


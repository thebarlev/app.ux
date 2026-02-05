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

export function getClientIp(req: Request): string {
  // Vercel/Proxy: x-forwarded-for may be a CSV list.
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return String(xff).split(",")[0]?.trim() || "unknown"
  const realIp = req.headers.get("x-real-ip")
  if (realIp) return String(realIp).trim() || "unknown"
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


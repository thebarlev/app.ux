function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function defaultIsRetryable(err: unknown): boolean {
  const anyErr = err as any
  const name = typeof anyErr?.name === "string" ? anyErr.name : ""
  const message = typeof anyErr?.message === "string" ? anyErr.message : ""
  const code = typeof anyErr?.code === "string" ? anyErr.code : ""
  const status = typeof anyErr?.status === "number" ? anyErr.status : null

  if (name === "AbortError") return true
  if (code === "ETIMEDOUT" || code === "ECONNRESET" || code === "EAI_AGAIN") return true
  if (status === 429) return true
  if (status !== null && status >= 500) return true
  if (message.toLowerCase().includes("timeout")) return true

  return false
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: {
    maxRetries?: number
    baseDelayMs?: number
    maxDelayMs?: number
    isRetryable?: (err: unknown) => boolean
    onRetry?: (args: { attempt: number; maxRetries: number; delayMs: number; error: unknown }) => void
  }
): Promise<T> {
  const maxRetries = typeof opts?.maxRetries === "number" ? Math.max(0, Math.floor(opts.maxRetries)) : 3
  const baseDelayMs = typeof opts?.baseDelayMs === "number" ? Math.max(0, Math.floor(opts.baseDelayMs)) : 1_000
  const maxDelayMs = typeof opts?.maxDelayMs === "number" ? Math.max(0, Math.floor(opts.maxDelayMs)) : 15_000
  const isRetryable = opts?.isRetryable || defaultIsRetryable

  let lastErr: unknown = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const canRetry = attempt < maxRetries && isRetryable(e)
      if (!canRetry) throw e

      const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt))
      const jitter = Math.floor(Math.random() * Math.min(250, exp + 1))
      const delayMs = exp + jitter
      opts?.onRetry?.({ attempt: attempt + 1, maxRetries, delayMs, error: e })
      await sleep(delayMs)
    }
  }

  throw lastErr
}


import "server-only"

import { Agent, ProxyAgent, type Dispatcher } from "undici"

/**
 * Dispatcher used for SHAAM (ITA) egress only.
 *
 * Vercel functions egress from a rotating pool of IPs, which is incompatible
 * with an upstream that allowlists source addresses. When SHAAM_HTTPS_PROXY is
 * set, SHAAM calls are routed through it to get a stable egress IP.
 *
 * Scoped deliberately: this is passed per-fetch as `dispatcher`, never via
 * setGlobalDispatcher/HTTPS_PROXY. A global dispatcher would send *all* app
 * egress (Supabase, PostHog, …) through a proxy that only permits taxes.gov.il.
 *
 * When SHAAM_HTTPS_PROXY is unset, behaviour is identical to before this
 * module existed: call sites that forced IPv4 still do, and call sites that
 * passed no dispatcher still pass none.
 */

let proxyAgent: ProxyAgent | null | undefined
let ipv4Agent: Agent | undefined

function getProxyAgent(): ProxyAgent | null {
  if (proxyAgent === undefined) {
    const url = String(process.env.SHAAM_HTTPS_PROXY || "").trim()
    proxyAgent = url ? new ProxyAgent(url) : null
  }
  return proxyAgent
}

export function isShaamProxyEnabled(): boolean {
  return getProxyAgent() !== null
}

/**
 * @param opts.ipv4Fallback - when no proxy is configured, return an IPv4-only
 *   Agent instead of undefined. Preserves the existing behaviour of the token
 *   endpoint call sites (`connect: { family: 4 }`).
 */
export function getShaamDispatcher(opts?: { ipv4Fallback?: boolean }): Dispatcher | undefined {
  const proxy = getProxyAgent()
  if (proxy) return proxy

  if (opts?.ipv4Fallback) {
    if (!ipv4Agent) ipv4Agent = new Agent({ connect: { family: 4 } })
    return ipv4Agent
  }

  return undefined
}

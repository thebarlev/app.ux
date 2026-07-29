import "server-only"

/**
 * Do not treat these as a readiness gate.
 *
 * Both calls below hit /invoice-information/v2/health and /v2/alive, and
 * neither path appears anywhere in the ITA ICD ("מודל חשבוניות ישראל — תיאור
 * ה-API's", 29/07/2026). The ICD documents invoice-information at v1, with
 * `details` and `confirmationNumber`. Where these two came from is unknown, so
 * a failure here may mean the service is down, or may only mean the endpoint
 * was never real — and a success proves correspondingly little.
 *
 * The host is now correct (infoBaseUrl), so if these paths do exist they will
 * at least be asked in the right place. Verify them against the ITA before
 * relying on either as a health signal.
 */

import { getShaamConfig } from "@/lib/shaam/config"
import { getValidShaamAccessToken, NeedsReauthError, ShaamTransientError } from "@/lib/shaam/token-manager"

async function callJson(url: string, accessToken: string): Promise<{ ok: boolean; status: number; json: any | null }> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  })

  const json = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, json }
}

export async function shaamHealthCheck(params: { companyId: string }): Promise<
  | { ok: true; status: number; json: any | null }
  | { ok: false; status: number; message: string }
> {
  const cfg = getShaamConfig()
  let accessToken: string
  try {
    accessToken = await getValidShaamAccessToken(params.companyId)
  } catch (e: any) {
    if (e instanceof NeedsReauthError) return { ok: false, status: 401, message: "needs_reauth" }
    if (e instanceof ShaamTransientError) return { ok: false, status: 503, message: "transient_error" }
    return { ok: false, status: 503, message: "transient_error" }
  }

  const url = `${cfg.infoBaseUrl}/invoice-information/v2/health`
  const r = await callJson(url, accessToken)
  if (!r.ok) return { ok: false, status: r.status, message: "health_failed" }
  return { ok: true, status: r.status, json: r.json }
}

export async function shaamAliveCheck(params: { companyId: string }): Promise<
  | { ok: true; status: number; json: any | null }
  | { ok: false; status: number; message: string }
> {
  const cfg = getShaamConfig()
  let accessToken: string
  try {
    accessToken = await getValidShaamAccessToken(params.companyId)
  } catch (e: any) {
    if (e instanceof NeedsReauthError) return { ok: false, status: 401, message: "needs_reauth" }
    if (e instanceof ShaamTransientError) return { ok: false, status: 503, message: "transient_error" }
    return { ok: false, status: 503, message: "transient_error" }
  }

  const url = `${cfg.infoBaseUrl}/invoice-information/v2/alive`
  const r = await callJson(url, accessToken)
  if (!r.ok) return { ok: false, status: r.status, message: "alive_failed" }
  return { ok: true, status: r.status, json: r.json }
}


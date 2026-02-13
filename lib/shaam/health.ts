import "server-only"

import { getShaamConfig } from "@/lib/shaam/config"
import { getDecryptedTokensForCompany } from "@/lib/shaam/tokens"

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
  const tokens = await getDecryptedTokensForCompany({ companyId: params.companyId })
  if (!tokens.ok) return { ok: false, status: 401, message: tokens.message }

  const url = `${cfg.baseUrl}/invoice-information/v2/health`
  const r = await callJson(url, tokens.accessToken)
  if (!r.ok) return { ok: false, status: r.status, message: "health_failed" }
  return { ok: true, status: r.status, json: r.json }
}

export async function shaamAliveCheck(params: { companyId: string }): Promise<
  | { ok: true; status: number; json: any | null }
  | { ok: false; status: number; message: string }
> {
  const cfg = getShaamConfig()
  const tokens = await getDecryptedTokensForCompany({ companyId: params.companyId })
  if (!tokens.ok) return { ok: false, status: 401, message: tokens.message }

  const url = `${cfg.baseUrl}/invoice-information/v2/alive`
  const r = await callJson(url, tokens.accessToken)
  if (!r.ok) return { ok: false, status: r.status, message: "alive_failed" }
  return { ok: true, status: r.status, json: r.json }
}


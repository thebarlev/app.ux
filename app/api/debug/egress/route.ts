export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"

function debugEnabled(): boolean {
  return String(process.env.SHAAM_DEBUG || "").trim().toLowerCase() === "true"
}

function proxyDetected() {
  return {
    http: Boolean(process.env.HTTP_PROXY || process.env.http_proxy),
    https: Boolean(process.env.HTTPS_PROXY || process.env.https_proxy),
    all: Boolean(process.env.ALL_PROXY || process.env.all_proxy),
    no: Boolean(process.env.NO_PROXY || process.env.no_proxy),
  }
}

export async function GET() {
  if (!debugEnabled()) {
    return new Response("Not Found", { status: 404 })
  }

  const region = process.env.VERCEL_REGION ? String(process.env.VERCEL_REGION) : null
  const runtime = process.env.NEXT_RUNTIME ? String(process.env.NEXT_RUNTIME) : "nodejs"
  const proxy = proxyDetected()

  let egress_ip: string | null = null
  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    const json: any = await res.json().catch(() => null)
    if (json?.ip && typeof json.ip === "string") egress_ip = json.ip
  } catch {}

  console.log("[SHAAM DEBUG] egress", {
    timestamp: new Date().toISOString(),
    egress_ip,
    region,
    runtime,
    proxyDetected: proxy,
  })

  return NextResponse.json({ egress_ip, region, runtime, proxyDetected: proxy })
}

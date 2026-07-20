import { NextResponse } from "next/server";
import { getShaamDispatcher, isShaamProxyEnabled } from "@/lib/shaam/dispatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function debugEnabled(): boolean {
  return String(process.env.SHAAM_DEBUG || "").trim().toLowerCase() === "true";
}

/**
 * Connectivity probe for the SHAAM token endpoint.
 *
 * Sends an intentionally unsupported grant (client_credentials) with dummy
 * credentials, so it never consumes an authorization slot and never carries a
 * real secret. What matters is *which* answer comes back:
 *
 *   400 unsupported_grant_type -> full path works (Vercel -> proxy -> ITA)
 *   407                        -> proxy credentials rejected
 *   timeout / fetch error      -> egress cannot reach the proxy or ITA
 *
 * Gated on SHAAM_DEBUG so turning that off in P0-A closes this route too.
 */
export async function GET() {
  if (!debugEnabled()) {
    return new Response("Not Found", { status: 404 });
  }

  const url = String(process.env.SHAAM_TOKEN_URL || "").trim();
  if (!url) {
    return NextResponse.json({ ok: false, error: "missing_token_url" }, { status: 200 });
  }

  const startedAt = Date.now();
  const dispatcher = getShaamDispatcher({ ipv4Fallback: true });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: "grant_type=client_credentials&client_id=dummy&client_secret=dummy",
      cache: "no-store",
      ...(dispatcher ? { dispatcher } : {}),
      signal: AbortSignal.timeout(20000),
    });

    // Body is an OAuth error envelope, never a token — safe to surface.
    const body = await res.text().catch(() => "");

    return NextResponse.json(
      {
        ok: true,
        status: res.status,
        via_proxy: isShaamProxyEnabled(),
        elapsed_ms: Date.now() - startedAt,
        region: process.env.VERCEL_REGION ?? null,
        body: body.slice(0, 300),
      },
      { status: 200 },
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.cause?.code || e?.code || e?.message || "probe_failed",
        via_proxy: isShaamProxyEnabled(),
        elapsed_ms: Date.now() - startedAt,
        region: process.env.VERCEL_REGION ?? null,
      },
      { status: 200 },
    );
  }
}

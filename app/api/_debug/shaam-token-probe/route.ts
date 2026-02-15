import { NextResponse } from "next/server";
import { Agent } from "undici";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.SHAAM_TOKEN_URL!;
  try {
    const dispatcher = new Agent({ connect: { family: 4 } });
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=authorization_code&code=dummy&redirect_uri=https%3A%2F%2Fexample.com%2Fcb&client_id=dummy&client_secret=dummy",
      // @ts-expect-error undici extension
      dispatcher,
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });

    return NextResponse.json(
      { ok: true, status: res.status },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.cause?.code || e?.code || e?.message || "probe_failed" },
      { status: 200 }
    );
  }
}

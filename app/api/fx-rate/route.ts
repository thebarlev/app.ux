import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFxRate } from "@/lib/fx/getFxRate";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";

function isIsoYmd(x: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(x);
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `fx-rate:${ip}`, limit: 120, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, message: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const base = String(req.nextUrl.searchParams.get("base") || "").toUpperCase().trim();
  const date = String(req.nextUrl.searchParams.get("date") || "").trim();

  if (!/^[A-Z]{3}$/.test(base)) {
    return NextResponse.json({ ok: false, message: "Invalid base currency" }, { status: 400 });
  }
  if (!isIsoYmd(date)) {
    return NextResponse.json({ ok: false, message: "Invalid date" }, { status: 400 });
  }

  try {
    const out = await getFxRate(base, date);
    return NextResponse.json({ ok: true, ...out });
  } catch (e: any) {
    console.error("[FX_RATE] failed", { base, date, error: e?.message || String(e) })
    return NextResponse.json(
      { ok: false, message: "FX rate fetch failed" },
      { status: 500 }
    );
  }
}


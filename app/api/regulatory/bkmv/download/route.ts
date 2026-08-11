export const dynamic = "force-dynamic"
export const revalidate = 0

import "server-only";

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { assertCompanyRoleAccess } from "@/lib/regulatory/bkmv/auth";
import { assertNotTestCompany } from "@/lib/security/test-company-guard.server";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";

export async function GET(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit({ key: `bkmv-download:${ip}`, limit: 30, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const url = new URL(req.url);
    const companyId = url.searchParams.get("companyId") || "";
    const key = url.searchParams.get("key") || "";

    if (!companyId || !key) {
      return NextResponse.json({ error: "Missing required query params: companyId, key" }, { status: 400 });
    }

    // Ensure key is scoped to the given company to avoid traversal/cross-tenant access.
    /*
     * Downloading a built file is still the file leaving. Guarding only the export
     * would mean a uniform file built before the flag was set stays downloadable
     * forever, so both ends refuse.
     */
    await assertNotTestCompany(companyId, "bkmv_download");

    const expectedPrefix = `company_${companyId}/bkmv/`;
    if (!key.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "Invalid key for company", code: "INVALID_KEY_SCOPE" }, { status: 400 });
    }

    await assertCompanyRoleAccess({ companyId, allowedRoles: ["owner", "admin", "accountant"] });

    const service = createServiceRoleClient();
    const { data, error } = await service.storage.from("regulatory-exports").download(key);

    if (error || !data) {
      // Do not leak storage/internal errors.
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const arrayBuffer = await data.arrayBuffer();
    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="Income.zip"`,
        "Content-Length": String(arrayBuffer.byteLength),
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (e: any) {
    if (e?.message === "unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e?.message === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[BKMV] download failed:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}


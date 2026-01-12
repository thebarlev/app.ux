import "server-only";

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { assertCompanyRoleAccess } from "@/lib/regulatory/bkmv/auth";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const companyId = url.searchParams.get("companyId") || "";
    const key = url.searchParams.get("key") || "";

    if (!companyId || !key) {
      return NextResponse.json({ error: "Missing required query params: companyId, key" }, { status: 400 });
    }

    // Ensure key is scoped to the given company to avoid traversal/cross-tenant access.
    const expectedPrefix = `company_${companyId}/bkmv/`;
    if (!key.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "Invalid key for company", code: "INVALID_KEY_SCOPE" }, { status: 400 });
    }

    await assertCompanyRoleAccess({ companyId, allowedRoles: ["owner", "admin", "accountant"] });

    const service = createServiceRoleClient();
    const { data, error } = await service.storage.from("regulatory-exports").download(key);

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "File not found" }, { status: 404 });
    }

    const arrayBuffer = await data.arrayBuffer();
    const body = Buffer.from(arrayBuffer);

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="Income.zip"`,
        "Content-Length": String(body.byteLength),
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


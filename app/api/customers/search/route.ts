import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";
import { NextRequest, NextResponse } from "next/server";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = rateLimit({
      key: `customers-search:${ip}`,
      limit: 60,
      windowMs: 60_000,
    });

    if (!rl.allowed) {
      return NextResponse.json(
        { customers: [] },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    if (!companyId) {
      return NextResponse.json(
        { error: "Unauthorized", customers: [] },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const rawQuery = searchParams.get("q") || "";

    // sanitize basic special chars to avoid breaking .or() filter
    const query = rawQuery.replace(/[,%()]/g, "").trim();

    let dbQuery = supabase
      .from("customers")
      .select("id, name, tax_id, external_account_key")
      .eq("company_id", companyId)
      .order("name", { ascending: true })
      .limit(5);

    if (query.length > 0) {
      dbQuery = dbQuery.or(
        `name.ilike.%${query}%,tax_id.ilike.%${query}%,external_account_key.ilike.%${query}%`
      );
    }

    const { data, error } = await dbQuery;

    if (error) {
      console.error("Customer search error:", {
        message: error.message,
        code: error.code,
      });

      return NextResponse.json(
        { error: "Failed to search customers", customers: [] },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { customers: data || [] },
      { headers: rateLimitHeaders(rl) }
    );
  } catch (error: any) {
    console.error("Customer search fatal error:", {
      message: error?.message,
      code: error?.code,
      cause: error?.cause?.code,
    });

    if (error?.cause?.code === "ENOTFOUND" || error?.code === "ENOTFOUND") {
      return NextResponse.json(
        { error: "Service unavailable", customers: [] },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Internal Server Error", customers: [] },
      { status: 500 }
    );
  }
}

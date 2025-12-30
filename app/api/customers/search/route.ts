import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q") || "";

    let dbQuery = supabase
      .from("customers")
      .select("id, name, tax_id, external_account_key")
      .eq("company_id", companyId)
      .order("name", { ascending: true })
      .limit(5);

    // If query is provided, filter by name, tax_id, or external_account_key
    if (query.trim().length > 0) {
      dbQuery = dbQuery.or(
        `name.ilike.%${query}%,tax_id.ilike.%${query}%,external_account_key.ilike.%${query}%`
      );
    }

    const { data, error } = await dbQuery;

    if (error) {
      console.error("Customer search error:", error);
      return NextResponse.json(
        { error: "Failed to search customers" },
        { status: 500 }
      );
    }

    return NextResponse.json({ customers: data || [] });
  } catch (error: any) {
    console.error("Customer search error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * API Route: /api/system-texts
 * Returns all system texts for client-side components
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from("system_texts")
      .select("key, value, default_value");

    if (error) {
      console.error("[SystemTexts API] Database error:", error);
      // Return empty object instead of failing
      return NextResponse.json({ texts: {} });
    }

    // Build key-value map: use custom value if set, otherwise default
    const texts: Record<string, string> = {};
    data?.forEach((row) => {
      texts[row.key] = row.value || row.default_value;
    });

    return NextResponse.json(
      { texts },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("[SystemTexts API] Unexpected error:", error);
    return NextResponse.json({ texts: {} });
  }
}

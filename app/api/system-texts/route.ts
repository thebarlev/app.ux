/**
 * API Route: /api/system-texts
 * Returns all system texts for client-side components
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const langParam = searchParams.get("lang");
    const pageParam = searchParams.get("page");
    const lang: "he" | "en" = langParam === "en" ? "en" : "he";
    
    // NOTE: This endpoint is used client-side; keep it permissive and safe.
    // New schema supports per-language rows: key+page+lang.
    let query = supabase
      .from("system_texts")
      .select("key, value, default_value, lang, page");

    if (pageParam) {
      query = query.eq("page", pageParam);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[SystemTexts API] Database error:", error);
      // Return empty object instead of failing
      return NextResponse.json({ texts: {} });
    }

    // Build maps: preferred lang + he fallback
    const heFallback: Record<string, string> = {};
    const langMap: Record<string, string> = {};

    data?.forEach((row: any) => {
      const v = row.value || row.default_value;
      if (row.lang === "he") heFallback[row.key] = v;
      if (row.lang === lang) langMap[row.key] = v;
    });

    const texts: Record<string, string> = {};
    Object.keys(heFallback).forEach((k) => {
      texts[k] = langMap[k] || heFallback[k];
    });
    // Include keys that exist only in requested lang
    Object.keys(langMap).forEach((k) => {
      if (!texts[k]) texts[k] = langMap[k];
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

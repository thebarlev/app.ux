/**
 * System Text Management
 * Provides helper functions to retrieve customizable text strings
 */

import { createClient } from "@/lib/supabase/server";

/**
 * Text cache to reduce database queries
 * In production, consider using Redis or similar
 */
const textCache = new Map<string, { value: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get system text by key.
 * Bilingual support:
 * - If `lang` is provided and the DB has a `lang` column, prefer that language.
 * - If the requested language row is missing, fallback to Hebrew ("he").
 * - If the schema is still the legacy one (no `lang` column), fallback to legacy behavior.
 */
export async function getSystemText(
  key: string,
  fallback?: string,
  lang: "he" | "en" = "he",
  page?: string,
): Promise<string> {
  try {
    // Check cache first
    const cacheKey = `${page || "*"}:${lang}:${key}`
    const cached = textCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.value;
    }

    const supabase = await createClient();
    // Try bilingual schema first (lang column exists)
    let data: any = null
    let error: any = null
    try {
      let q = supabase
        .from("system_texts")
        .select("value, default_value, lang")
        .eq("key", key)
        .eq("lang", lang)
      if (page) q = q.eq("page", page)
      const res = await q.maybeSingle()
      data = res.data
      error = res.error
    } catch (e: any) {
      // ignore - likely schema mismatch
      error = e
    }

    if (error) {
      // If bilingual query failed due to missing column, try legacy schema
      const msg = String(error?.message || error)
      if (msg.includes("lang") || msg.includes("column")) {
        const legacy = await supabase
          .from("system_texts")
          .select("value, default_value")
          .eq("key", key)
          .maybeSingle()
        if (legacy.error) {
          console.error(`[SystemText] Error fetching key "${key}" (legacy):`, legacy.error)
          return fallback || key
        }
        const legacyText = legacy.data?.value || legacy.data?.default_value
        const resolvedLegacy = legacyText || fallback || key
        textCache.set(cacheKey, { value: resolvedLegacy, timestamp: Date.now() })
        return resolvedLegacy
      }
      console.error(`[SystemText] Error fetching key "${key}" (${lang}):`, error);
      return fallback || key;
    }

    // Fallback to Hebrew row if requested language missing
    if (!data && lang !== "he") {
      try {
        let q = supabase
          .from("system_texts")
          .select("value, default_value, lang")
          .eq("key", key)
          .eq("lang", "he")
        if (page) q = q.eq("page", page)
        const resHe = await q.maybeSingle()
        data = resHe.data
      } catch {
        // ignore
      }
    }

    if (!data) {
      console.warn(`[SystemText] Key "${key}" not found in database (${lang})`);
      return fallback || key;
    }

    // Use custom value if set, otherwise default
    const text = data.value || data.default_value;

    // Cache the result
    textCache.set(cacheKey, { value: text, timestamp: Date.now() });

    return text;
  } catch (err) {
    console.error(`[SystemText] Exception for key "${key}":`, err);
    return fallback || key;
  }
}

/**
 * Get multiple system texts at once
 * More efficient than calling getSystemText multiple times
 */
export async function getSystemTexts(
  keys: string[],
  lang: "he" | "en" = "he",
  page?: string,
): Promise<Record<string, string>> {
  try {
    const supabase = await createClient();
    // Prefer bilingual schema
    let data: any[] | null = null
    let error: any = null
    try {
      let q = supabase
        .from("system_texts")
        .select("key, value, default_value, lang")
        .in("key", keys)
        .eq("lang", lang)
      if (page) q = q.eq("page", page)
      const res = await q
      data = res.data as any
      error = res.error
    } catch (e: any) {
      error = e
    }

    if (error) {
      const msg = String(error?.message || error)
      // Legacy fallback
      if (msg.includes("lang") || msg.includes("column")) {
        const legacy = await supabase
          .from("system_texts")
          .select("key, value, default_value")
          .in("key", keys)
        if (legacy.error) {
          console.error("[SystemText] Error fetching texts (legacy):", legacy.error)
          return Object.fromEntries(keys.map((k) => [k, k]))
        }
        const resultLegacy: Record<string, string> = {}
        legacy.data?.forEach((row: any) => {
          const text = row.value || row.default_value
          resultLegacy[row.key] = text
          textCache.set(`${page || "*"}:${lang}:${row.key}`, { value: text, timestamp: Date.now() })
        })
        keys.forEach((k) => {
          if (!resultLegacy[k]) resultLegacy[k] = k
        })
        return resultLegacy
      }
      console.error("[SystemText] Error fetching texts:", error);
      return Object.fromEntries(keys.map((k) => [k, k]));
    }

    const result: Record<string, string> = {};
    data?.forEach((row) => {
      const text = row.value || row.default_value;
      result[row.key] = text;
      // Cache each text
      textCache.set(`${page || "*"}:${lang}:${row.key}`, { value: text, timestamp: Date.now() });
    });

    // Bilingual fallback: fill missing keys from Hebrew rows
    if (lang !== "he") {
      const missingKeys = keys.filter((k) => !result[k])
      if (missingKeys.length > 0) {
        try {
          let q = supabase
            .from("system_texts")
            .select("key, value, default_value, lang")
            .in("key", missingKeys)
            .eq("lang", "he")
          if (page) q = q.eq("page", page)
          const resHe = await q
          resHe.data?.forEach((row: any) => {
            const text = row.value || row.default_value
            result[row.key] = text
            textCache.set(`${page || "*"}:${lang}:${row.key}`, { value: text, timestamp: Date.now() })
          })
        } catch {
          // ignore
        }
      }
    }

    // Fill in missing keys
    keys.forEach((key) => {
      if (!result[key]) {
        result[key] = key;
      }
    });

    return result;
  } catch (err) {
    console.error("[SystemText] Exception fetching texts:", err);
    return Object.fromEntries(keys.map((k) => [k, k]));
  }
}

/**
 * Get all texts for a specific page/module
 */
export async function getPageTexts(
  page: string,
  lang: "he" | "en" = "he",
): Promise<Record<string, string>> {
  try {
    const supabase = await createClient();
    // Prefer bilingual schema
    let data: any[] | null = null
    let error: any = null
    try {
      const res = await supabase
        .from("system_texts")
        .select("key, value, default_value, lang")
        .eq("page", page)
        .eq("lang", lang)
      data = res.data as any
      error = res.error
    } catch (e: any) {
      error = e
    }

    if (error) {
      const msg = String(error?.message || error)
      // Legacy fallback
      if (msg.includes("lang") || msg.includes("column")) {
        const legacy = await supabase
          .from("system_texts")
          .select("key, value, default_value")
          .eq("page", page)
        if (legacy.error) {
          console.error(`[SystemText] Error fetching page "${page}" (legacy):`, legacy.error)
          return {}
        }
        const resultLegacy: Record<string, string> = {}
        legacy.data?.forEach((row: any) => {
          const text = row.value || row.default_value
          resultLegacy[row.key] = text
          textCache.set(`${page}:${lang}:${row.key}`, { value: text, timestamp: Date.now() })
        })
        return resultLegacy
      }
      console.error(`[SystemText] Error fetching page "${page}" (${lang}):`, error);
      return {};
    }

    const result: Record<string, string> = {};
    data?.forEach((row) => {
      const text = row.value || row.default_value;
      result[row.key] = text;
      // Cache each text
      textCache.set(`${page}:${lang}:${row.key}`, { value: text, timestamp: Date.now() });
    });

    // Fallback to Hebrew rows for missing keys when lang=en
    if (lang !== "he") {
      try {
        const resHe = await supabase
          .from("system_texts")
          .select("key, value, default_value, lang")
          .eq("page", page)
          .eq("lang", "he")
        resHe.data?.forEach((row: any) => {
          if (result[row.key]) return
          const text = row.value || row.default_value
          result[row.key] = text
          textCache.set(`${page}:${lang}:${row.key}`, { value: text, timestamp: Date.now() })
        })
      } catch {
        // ignore
      }
    }

    return result;
  } catch (err) {
    console.error(`[SystemText] Exception fetching page "${page}":`, err);
    return {};
  }
}

/**
 * Clear text cache (use after updating texts)
 */
export function clearTextCache(key?: string) {
  if (key) {
    textCache.delete(key);
  } else {
    textCache.clear();
  }
}

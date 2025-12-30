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
 * Get system text by key
 * Returns customized value if exists, otherwise default_value
 */
export async function getSystemText(
  key: string,
  fallback?: string
): Promise<string> {
  try {
    // Check cache first
    const cached = textCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.value;
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("system_texts")
      .select("value, default_value")
      .eq("key", key)
      .maybeSingle();

    if (error) {
      console.error(`[SystemText] Error fetching key "${key}":`, error);
      return fallback || key;
    }

    if (!data) {
      console.warn(`[SystemText] Key "${key}" not found in database`);
      return fallback || key;
    }

    // Use custom value if set, otherwise default
    const text = data.value || data.default_value;

    // Cache the result
    textCache.set(key, { value: text, timestamp: Date.now() });

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
  keys: string[]
): Promise<Record<string, string>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("system_texts")
      .select("key, value, default_value")
      .in("key", keys);

    if (error) {
      console.error("[SystemText] Error fetching texts:", error);
      return Object.fromEntries(keys.map((k) => [k, k]));
    }

    const result: Record<string, string> = {};
    data?.forEach((row) => {
      const text = row.value || row.default_value;
      result[row.key] = text;
      // Cache each text
      textCache.set(row.key, { value: text, timestamp: Date.now() });
    });

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
  page: string
): Promise<Record<string, string>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("system_texts")
      .select("key, value, default_value")
      .eq("page", page);

    if (error) {
      console.error(`[SystemText] Error fetching page "${page}":`, error);
      return {};
    }

    const result: Record<string, string> = {};
    data?.forEach((row) => {
      const text = row.value || row.default_value;
      result[row.key] = text;
      // Cache each text
      textCache.set(row.key, { value: text, timestamp: Date.now() });
    });

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

/**
 * Client-side System Text Helper
 * For use in "use client" components
 */

let textCache: Record<string, string> | null = null;
let cacheKey: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch all system texts from the API
 * Uses in-memory cache to reduce API calls
 */
async function fetchSystemTexts(options?: { lang?: "he" | "en"; page?: string }): Promise<Record<string, string>> {
  // Return cached data if still valid
  const lang = options?.lang || "he"
  const page = options?.page
  const nextKey = `${lang}:${page || "*"}`

  if (textCache && cacheKey === nextKey && Date.now() - cacheTimestamp < CACHE_TTL) {
    return textCache ?? {};
  }

  try {
    const qs = new URLSearchParams()
    qs.set("lang", lang)
    if (page) qs.set("page", page)

    const response = await fetch(`/api/system-texts?${qs.toString()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("[SystemText] API error:", response.status);
      return {};
    }

    const data = await response.json();
    textCache = data.texts || {};
    cacheKey = nextKey
    cacheTimestamp = Date.now();
    
    return textCache ?? {};
  } catch (error) {
    console.error("[SystemText] Fetch error:", error);
    return {};
  }
}

/**
 * Get system text by key (client-side)
 * Returns customized value if exists, otherwise fallback
 */
export async function getSystemText(
  key: string,
  fallback: string,
  options?: { lang?: "he" | "en"; page?: string }
): Promise<string> {
  const texts = await fetchSystemTexts(options);
  return texts[key] || fallback;
}

/**
 * Preload system texts on component mount
 * Call this in useEffect to warm up the cache
 */
export function preloadSystemTexts(): void {
  fetchSystemTexts().catch(console.error);
}

/**
 * Clear the cache (useful after admin updates texts)
 */
export function clearTextCache(): void {
  textCache = null;
  cacheKey = null;
  cacheTimestamp = 0;
}

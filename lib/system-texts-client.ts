/**
 * Client-side System Text Helper
 * For use in "use client" components
 */

let textCache: Record<string, string> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch all system texts from the API
 * Uses in-memory cache to reduce API calls
 */
async function fetchSystemTexts(): Promise<Record<string, string>> {
  // Return cached data if still valid
  if (textCache && Date.now() - cacheTimestamp < CACHE_TTL) {
    return textCache;
  }

  try {
    const response = await fetch("/api/system-texts", {
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("[SystemText] API error:", response.status);
      return {};
    }

    const data = await response.json();
    textCache = data.texts || {};
    cacheTimestamp = Date.now();
    
    return textCache;
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
  fallback: string
): Promise<string> {
  const texts = await fetchSystemTexts();
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
  cacheTimestamp = 0;
}

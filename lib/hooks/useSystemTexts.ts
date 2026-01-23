/**
 * React Hook: useSystemTexts
 * Load all system texts on component mount
 * Returns a getText function that can be used synchronously
 */

"use client";

import { useState, useEffect } from "react";

interface UseSystemTextsReturn {
  getText: (key: string, fallback: string) => string;
  isLoading: boolean;
  error: Error | null;
}

export function useSystemTexts(options?: { lang?: "he" | "en"; page?: string }): UseSystemTextsReturn {
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTexts() {
      try {
        const lang = options?.lang || "he";
        const page = options?.page;
        const qs = new URLSearchParams();
        if (lang) qs.set("lang", lang);
        if (page) qs.set("page", page);

        const response = await fetch(`/api/system-texts?${qs.toString()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        
        if (!cancelled) {
          setTexts(data.texts || {});
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
          setIsLoading(false);
        }
      }
    }

    fetchTexts();

    return () => {
      cancelled = true;
    };
  }, [options?.lang, options?.page]);

  const getText = (key: string, fallback: string): string => {
    return texts[key] || fallback;
  };

  return { getText, isLoading, error };
}

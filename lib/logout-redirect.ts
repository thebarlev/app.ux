/**
 * Logout redirect URLs for auditor/dashboard.
 * Hebrew (Israel) → uxellent.com
 * English (outside Israel) → uxellent.com/en
 */

export const VOW_HOME_HE = "https://uxellent.com"
export const VOW_HOME_EN = "https://uxellent.com/en"

/** Infer locale from Referer: /en/ path → English (uxellent.com/en), else Hebrew (uxellent.com) */
export function getLogoutRedirectUrl(referer: string | null): string {
  if (!referer) return VOW_HOME_HE
  try {
    const pathname = new URL(referer).pathname
    return /\/en(\/|$)/.test(pathname) ? VOW_HOME_EN : VOW_HOME_HE
  } catch {
    return VOW_HOME_HE
  }
}

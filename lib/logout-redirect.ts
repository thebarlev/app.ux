/**
 * Logout redirect URLs for auditor/dashboard.
 * Hebrew (Israel) → vow.co.il
 * English (outside Israel) → vow.co.il/en
 */

export const VOW_HOME_HE = "https://vow.co.il"
export const VOW_HOME_EN = "https://vow.co.il/en"

/** Infer locale from Referer: /en/ path → English (vow.co.il/en), else Hebrew (vow.co.il) */
export function getLogoutRedirectUrl(referer: string | null): string {
  if (!referer) return VOW_HOME_HE
  try {
    const pathname = new URL(referer).pathname
    return /\/en(\/|$)/.test(pathname) ? VOW_HOME_EN : VOW_HOME_HE
  } catch {
    return VOW_HOME_HE
  }
}

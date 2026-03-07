export type AuditorLocale = "he" | "en"
export const AUDITOR_LOCALES = ["he", "en"] as const

export function getAuditorBasePath(locale: AuditorLocale): string {
  return locale === "en" ? "/en/auditor" : "/auditor"
}

export function isEnAuditorPath(pathname: string): boolean {
  return pathname.startsWith("/en/auditor")
}

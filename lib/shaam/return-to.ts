import "server-only"

/**
 * Where to send the user after the SHAAM OAuth round-trip.
 *
 * This value arrives as a query parameter on /api/shaam/oauth/start and is
 * handed straight to NextResponse.redirect at the end of the callback, so an
 * unvalidated value is an open redirect: an attacker could link a user to
 * .../oauth/start?returnTo=https://evil.example and have our own domain bounce
 * them out after a successful login.
 *
 * Only same-origin absolute paths are accepted, and the sanitized value is
 * carried inside the HMAC-signed state so it cannot be swapped mid-flow.
 */

const MAX_RETURN_TO_LENGTH = 512

// C0 controls, DEL, and C1 controls. CR/LF/TAB/NUL in particular can smuggle a
// second header or URL past a naive prefix check.
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    // C0 controls + DEL + C1 controls.
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true
  }
  return false
}

/**
 * Returns a safe same-origin path, or null if the input cannot be trusted.
 *
 * Rejects: anything not starting with "/", protocol-relative "//host" and its
 * backslash variant "/\host" (browsers normalise "\" to "/" in URLs), embedded
 * control characters, and any value carrying a scheme.
 */
export function sanitizeReturnTo(raw: string | null | undefined): string | null {
  const value = typeof raw === "string" ? raw.trim() : ""
  if (!value) return null
  if (value.length > MAX_RETURN_TO_LENGTH) return null

  if (hasControlChars(value)) return null

  // Must be an absolute path on this origin.
  if (!value.startsWith("/")) return null

  // Protocol-relative ("//evil.com") and the backslash form browsers normalise.
  if (value.startsWith("//") || value.startsWith("/\\")) return null

  // A scheme in the leading segment means it is not a bare path.
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(value)) return null

  // Final parse against a throwaway base: anything that escapes the origin,
  // or that URL() reads as absolute, is rejected.
  try {
    const probe = new URL(value, "https://return-to.invalid")
    if (probe.origin !== "https://return-to.invalid") return null
    return `${probe.pathname}${probe.search}${probe.hash}`
  } catch {
    return null
  }
}

/** Where the user lands when no usable return path was supplied. */
export const SHAAM_SETTINGS_PATH = "/dashboard/settings/integrations/shaam"

/**
 * Appends the outcome of the OAuth round-trip to the return path, so the page
 * the user came from can tell them what happened and offer to resume.
 */
export function withShaamOutcome(path: string, outcome: { connected: boolean; error?: string }): string {
  const probe = new URL(path, "https://return-to.invalid")
  if (outcome.connected) {
    probe.searchParams.set("shaam_connected", "1")
    probe.searchParams.delete("shaam_error")
  } else {
    probe.searchParams.set("shaam_error", outcome.error || "1")
    probe.searchParams.delete("shaam_connected")
  }
  return `${probe.pathname}${probe.search}${probe.hash}`
}

/**
 * Client-side helper: starts the SHAAM OAuth flow and asks to be returned to
 * exactly where the user is standing now.
 *
 * The path is sent as `returnTo` and re-validated server-side (sanitizeReturnTo)
 * before it is signed into the OAuth state, so nothing here is trusted.
 */
export function buildShaamConnectUrl(returnToPath?: string): string {
  const path =
    returnToPath ||
    (typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : "");

  if (!path) return "/api/shaam/oauth/start";
  return `/api/shaam/oauth/start?returnTo=${encodeURIComponent(path)}`;
}

/**
 * The draft is already persisted server-side before the SHAAM call is attempted,
 * so returning to the document URL with its draftId restores everything the user
 * entered. This makes sure the draftId is on the URL even when the user reached
 * the form without it (fresh "new document" navigation).
 */
export function buildDocumentReturnPath(draftId?: string | null): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  if (draftId && !url.searchParams.get("draftId")) {
    url.searchParams.set("draftId", draftId);
  }
  // Never carry a previous outcome back into the next round-trip.
  url.searchParams.delete("shaam_connected");
  url.searchParams.delete("shaam_error");
  return `${url.pathname}${url.search}${url.hash}`;
}

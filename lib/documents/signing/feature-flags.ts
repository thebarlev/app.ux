import "server-only";

/**
 * TEMPORARY FEATURE FLAG
 * ----------------------
 * Digital signature / PAdES / PKCS12 + recipient consent enforcement is DEFERRED.
 * Keep the code paths, but ensure they do not execute unless explicitly enabled.
 *
 * Enable only when the signing rollout is approved and fully tested:
 *   DIGITAL_SIGNATURES_ENABLED=true
 */
export function isDigitalSignaturesEnabled(): boolean {
  return process.env.DIGITAL_SIGNATURES_ENABLED === "true";
}

export const DIGITAL_SIGNATURES_DEFERRED_MESSAGE =
  "חתימה דיגיטלית והסכמות מקבל הוקפאו זמנית (TODO/deferred).";


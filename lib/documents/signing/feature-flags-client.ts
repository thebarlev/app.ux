"use client";

/**
 * Client-side companion flag (for UI gating only).
 * Defaults to OFF when not set.
 */
export function isDigitalSignaturesEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_DIGITAL_SIGNATURES_ENABLED === "true";
}


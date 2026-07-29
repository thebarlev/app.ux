import "server-only"

/**
 * The `accounting_software_number` sent to the ITA on an allocation request.
 *
 * The spec (Israel Invoice model, API description 2.0/7.2024) defines it as the
 * registration number of the software the document was issued from, and says
 * that where no such registration exists the ISSUER'S VAT number is used
 * instead.
 *
 * It used to come from SHAAM_ACCOUNTING_SOFTWARE_NUMBER — one global value
 * holding one company's VAT number. Every customer's invoice therefore went out
 * carrying our VAT number rather than their own. Nothing rejected it, which is
 * what made it dangerous: it passed quietly and wrong.
 *
 * Priority:
 *   1. SHAAM_SOFTWARE_REGISTRATION_NUMBER — a real ITA software registration
 *      number, which genuinely is the same for every document we issue. We do
 *      not have one yet; the variable exists for when we do.
 *   2. The issuer's own VAT number.
 *   3. Throw. There is deliberately no fall back to the old env variable — that
 *      is the failure mode this exists to remove.
 *
 * Both the allocation request and the CANCEL/CONTINUE decision for a document
 * must send the same value, or the decision refers to a document the ITA sees
 * differently. That is why this lives in one place instead of at each call site.
 */
export function resolveAccountingSoftwareNumber(issuerVatNumber: number): number {
  const registration = String(process.env.SHAAM_SOFTWARE_REGISTRATION_NUMBER || "").replace(/\D/g, "")
  if (registration) {
    const parsed = Number(registration)
    if (Number.isInteger(parsed) && parsed > 0) return parsed
  }

  if (Number.isInteger(issuerVatNumber) && issuerVatNumber > 0) return issuerVatNumber

  // Both callers already block before reaching here when the issuer VAT is
  // missing, so this is a backstop rather than a new failure mode.
  throw new Error(
    "Cannot resolve accounting_software_number: no SHAAM_SOFTWARE_REGISTRATION_NUMBER and no issuer VAT number"
  )
}

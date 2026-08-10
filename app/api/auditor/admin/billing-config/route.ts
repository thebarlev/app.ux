export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { requireSystemAdmin, SystemAdminAuthError } from "@/lib/security/system-admin"
import { getAuditorBillingConfig } from "@/lib/auditor/billing/env"

/**
 * Where does the money go, and whose books does the document land in.
 *
 * Two values decide the outcome of every auditor charge, and until now neither was
 * visible without reading runtime logs after the fact:
 *
 *   · the Cardcom terminal number — which terminal is actually charged. Not
 *     AUDITOR_CARDCOM_MODE, which only guards against a local base URL
 *     (lib/auditor/billing/cardcom.ts), and not the two *_URL variables, which are
 *     not read anywhere at all.
 *   · AUDITOR_BILLING_ACCOUNT_ID — the dealer the invoice_receipt is issued under.
 *     It no longer has a default, so a wrong value cannot silently become the live
 *     company; but a *deliberately wrong* value still can, and that is what this
 *     endpoint is for.
 *
 * THIS IS THE GATE BEFORE ANY TEST CHARGE. Open it first. If
 * issuer_company_id_prefix shows the production company while you are testing
 * against a sandbox, stop — a document issued to the wrong dealer is immutable and
 * cannot be credited while credit notes are blocked.
 *
 * Both values are truncated: four digits of the terminal and eight characters of a
 * company UUID identify them to someone who already knows them, and are useless to
 * anyone else. Nothing here is a secret, and no secret is added.
 *
 * vercel_env, not NODE_ENV: Vercel sets NODE_ENV to "production" on Preview
 * deployments too, so it cannot tell the environments apart. VERCEL_ENV can.
 */
/**
 * NOTE ON AUDITOR_ENABLED: every sibling route under /api/auditor gates on
 * `AUDITOR_ENABLED === "true"` before doing anything. This one deliberately does
 * not. A diagnostic that goes dark when the feature is off cannot be used to decide
 * whether it is safe to turn the feature on, which is precisely when it is needed.
 * The system-admin guard is the access control here; AUDITOR_ENABLED is a feature
 * flag, not a permission.
 */
export async function GET() {
  try {
    await requireSystemAdmin()
  } catch (e) {
    if (e instanceof SystemAdminAuthError) {
      return NextResponse.json(
        { ok: false, error: e.code },
        { status: e.code === "unauthorized" ? 401 : 403 }
      )
    }
    return NextResponse.json({ ok: false, error: "guard_failed" }, { status: 500 })
  }

  // Deliberately NOT wrapped in a try that swallows: if the configuration is
  // invalid, getAuditorBillingConfig throws, and a diagnostic endpoint that
  // reports "fine" for a broken configuration would be worse than no endpoint.
  // The error text names the missing variable.
  let cfg: ReturnType<typeof getAuditorBillingConfig>
  try {
    cfg = getAuditorBillingConfig()
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "auditor_billing_config_invalid",
        message: e?.message || String(e),
        vercel_env: process.env.VERCEL_ENV || "unset",
      },
      { status: 500 }
    )
  }

  const terminal = String(cfg.cardcom.terminalNumber || "")

  return NextResponse.json({
    ok: true,
    vercel_env: process.env.VERCEL_ENV || "unset",
    cardcom_terminal_last4: terminal.slice(-4),
    issuer_company_id_prefix: String(cfg.billingAccountId || "").slice(0, 8),
    cardcom_mode: cfg.cardcom.mode,
  })
}

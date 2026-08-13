import { notFound } from "next/navigation"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { isCheckoutEnabled } from "@/lib/auditor/billing/checkout-gate"
import AuditorCheckoutClient from "./AuditorCheckoutClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The auditor checkout, for a visitor who has no account and will not be asked to
 * make one.
 *
 * ── WHAT CHANGED, AND WHY THE OLD SHAPE COULD NOT SERVE ─────────────────────
 * This page used to require a signed-in user and redirect to /auditor/login when
 * there wasn't one. There is no signup in this flow by decision: results page ->
 * plan -> this form -> Cardcom -> invoice by email -> thank-you. Account access
 * arrives in stage 5, when everyone who bought is sent a link to set a password;
 * bootstrap-company already knows how to attach an auth_user_id to a company that
 * exists, so nothing here has to anticipate it.
 *
 * The hard-coded AUDITOR_BLOCKED literal is replaced by isCheckoutEnabled(), which
 * fails closed in every direction and keeps production shut until a second, separate
 * variable says otherwise. /auditor/login and the (account) group stay blocked by
 * their own literals — this change is scoped to the checkout.
 *
 * ── THE SCAN PAIR IS THE ONLY CREDENTIAL ────────────────────────────────────
 * With no auth, `scanId` + `token` is what stands between this page and the whole
 * internet. The pair is verified here, server-side, character-for-character against
 * auditor_scans.scan_access_token — the same comparison /api/auditor/status makes at
 * line 49 — before anything is rendered.
 *
 * ── WHAT A BAD PAIR ACTUALLY RETURNS HERE: 200, NOT 403 ─────────────────────
 * An earlier version of this comment claimed 403, and the code never did that. A
 * page component in the App Router cannot set an arbitrary status: the choices are
 * notFound() — which is 404 — or an ordinary render. So a bad pair renders the
 * refusal below at 200, and that is the approved behaviour rather than a compromise:
 * whoever is holding a stale link is a person who needs a sentence they can act on,
 * and a bare 404 tells them nothing.
 *
 * 403 lives where it is both enforceable and meaningful — /api/auditor/billing/
 * checkout/start, which is what a script would be hitting. No middleware was added
 * to manufacture a status here; a third layer to change one number is not worth its
 * own failure mode.
 *
 * Nothing is disclosed either way. The refusal never says which of scanId or token
 * was wrong — that distinction belongs in the log, not on the screen.
 *
 * ── AND THE PRICE IS NEVER READ FROM THE URL ────────────────────────────────
 * Only `plan` travels. The amount is loaded from auditor_plans here and again in the
 * start route. An `amount` arriving from the client would be a hole, not a
 * convenience.
 */

type Search = Promise<{ plan?: string; scanId?: string; token?: string }>

export default async function AuditorCheckoutPage({ searchParams }: { searchParams?: Search }) {
  if (!isCheckoutEnabled()) notFound()

  const sp = (await searchParams) ?? {}
  const planId = typeof sp.plan === "string" ? sp.plan.trim() : ""
  const scanId = typeof sp.scanId === "string" ? sp.scanId.trim() : ""
  const token = typeof sp.token === "string" ? sp.token.trim() : ""

  if (!planId || !scanId || !token) {
    return <CheckoutRefusal reason="missing_params" />
  }

  const admin = createServiceRoleClient()

  /*
   * The pair check. Selected by id, then compared in JS rather than filtered by
   * both columns in SQL, so a mismatch is distinguishable from a missing scan in the
   * logs — and so the comparison is the same exact-string one the status route makes
   * rather than whatever collation a query might apply.
   */
  const { data: scan } = await admin
    .from("auditor_scans")
    .select("id, scan_access_token, hostname, normalized_host, score_total, status, lead_id")
    .eq("id", scanId)
    .maybeSingle()

  if (!scan || String((scan as any).scan_access_token || "") !== token) {
    return <CheckoutRefusal reason="bad_pair" />
  }

  /*
   * ⛔ THE LEAD'S DETAILS, SO NOBODY IS ASKED TWICE.
   *
   * Name, email and phone were already collected at the gate — that is what unlocked the
   * report this visitor just came from. Asking for them again on the payment step is the
   * single most reliable way to lose a sale that was already won, and it is a commercial
   * defect rather than a cosmetic one.
   *
   * Read through the scan's lead_id, which the pair check above already verified, so this
   * discloses nothing a holder of the scanId+token pair did not already have.
   *
   * ⚠️ Prefilled, never locked. The invoice may legitimately need different details from
   * the person who ran the scan — an accountant's address, a company contact rather than
   * the individual. Every field stays editable; the section just no longer starts empty.
   */
  const leadId = (scan as any)?.lead_id ? String((scan as any).lead_id) : ""
  let prefill = { fullName: "", email: "", phone: "" }
  if (leadId) {
    const { data: lead } = await admin
      .from("auditor_leads")
      .select("full_name, email, phone")
      .eq("id", leadId)
      .maybeSingle()
    if (lead) {
      prefill = {
        fullName: String((lead as any).full_name || ""),
        email: String((lead as any).email || ""),
        phone: String((lead as any).phone || ""),
      }
    }
  }

  const { data: plan } = await admin
    .from("auditor_plans")
    .select("id, name, monthly_amount, currency, is_active")
    .eq("id", planId)
    .eq("is_active", true)
    .maybeSingle()

  if (!plan) {
    return <CheckoutRefusal reason="no_plan" />
  }

  /*
   * monthly_amount is VAT-INCLUSIVE — see the COMMENT on the column, and migration
   * 130. The form shows the base figure large and the inclusive one beneath it,
   * because a business audience decides on the base, and both are derived from this
   * one number rather than stored twice.
   */
  const gross = Number((plan as any).monthly_amount)
  const net = Math.round((gross / 1.18) * 100) / 100
  const vat = Math.round((gross - net) * 100) / 100

  return (
    <AuditorCheckoutClient
      planId={String((plan as any).id)}
      planName={String((plan as any).name)}
      grossAmount={gross}
      netAmount={net}
      vatAmount={vat}
      currency={String((plan as any).currency || "ILS")}
      scanId={scanId}
      token={token}
      prefill={prefill}
      host={String((scan as any).normalized_host || (scan as any).hostname || "")}
    />
  )
}

/**
 * A refusal the visitor can act on.
 *
 * Rendered rather than thrown, because the three reasons are ordinary things that
 * happen to a real person with an old link — not errors. The copy never says which
 * of scanId or token was wrong: that distinction is for the log, not for whoever is
 * holding the link.
 */
function CheckoutRefusal({ reason }: { reason: "missing_params" | "bad_pair" | "no_plan" }) {
  const copy =
    reason === "no_plan"
      ? {
          title: "המסלול הזה לא זמין",
          body: "ייתכן שהוא הוחלף. חזרו לדוח ובחרו מסלול מהרשימה המעודכנת.",
        }
      : {
          title: "הקישור לא תקף",
          body: "קישורי דוח הם אישיים ופגי-תוקף. פתחו את הדוח שלכם מחדש ובחרו מסלול משם, והקישור ייווצר לכם מחדש.",
        }

  return (
    <main className="min-h-svh bg-white px-4 py-16 sm:px-6" dir="rtl">
      <div className="mx-auto max-w-md rounded-2xl bg-[#F6F8FC] p-7 text-center">
        <h1 className="text-lg font-extrabold text-[#1C2A46]">{copy.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#3A465F]">{copy.body}</p>
        <a
          href="/auditor"
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#3A6D9A] text-sm font-extrabold text-white"
        >
          חזרה לסריקה
        </a>
      </div>
    </main>
  )
}

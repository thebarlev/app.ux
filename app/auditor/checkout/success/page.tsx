import { notFound } from "next/navigation"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { isCheckoutEnabled } from "@/lib/auditor/billing/checkout-gate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Where a paying customer lands, and deliberately not inside (account).
 *
 * The (account) group is blocked until stage 5, so if this page lived there the
 * customer would pay and be shown a 404. Keeping it outside takes stage 5 off the
 * critical path entirely: everything a buyer needs on day one is here — what they
 * bought, what it cost, the invoice number, and where the invoice went.
 *
 * ── IT READS, IT NEVER CREATES ──────────────────────────────────────────────
 * Cardcom's own indicator callback is what turns a payment into a charge, a
 * subscription and a document. This page only reports what that already produced. A
 * success page that completes the purchase would mean a purchase that depends on the
 * buyer's browser reaching a URL, and browsers do not reach URLs reliably.
 *
 * So a fresh arrival can legitimately find nothing yet — the callback may be a
 * second behind the redirect. That is the "still processing" state below, and it is
 * a normal outcome rather than an error.
 *
 * ── THE SESSION ID IS THE CREDENTIAL ────────────────────────────────────────
 * Cardcom returns it as ReturnValue and it is a uuid nobody can guess. It is looked
 * up as-is; no scan pair is required here, because by this point the visitor has
 * already paid and the only thing being revealed is their own receipt.
 */

type Search = Promise<{ session?: string; ReturnValue?: string; returnValue?: string }>

export default async function AuditorCheckoutSuccessPage({ searchParams }: { searchParams?: Search }) {
  if (!isCheckoutEnabled()) notFound()

  const sp = (await searchParams) ?? {}
  // Cardcom's casing has changed between integrations, so all three are accepted.
  const sessionId = String(sp.session || sp.ReturnValue || sp.returnValue || "").trim()

  let planName = ""
  let gross: number | null = null
  let documentNumber: string | null = null
  let email = ""
  let settled = false

  if (sessionId) {
    const admin = createServiceRoleClient()

    const { data: session } = await admin
      .from("auditor_checkout_sessions")
      .select("id, company_id, plan_id, amount, status")
      .eq("id", sessionId)
      .maybeSingle()

    if (session) {
      gross = Number((session as any).amount)

      const { data: plan } = await admin
        .from("auditor_plans")
        .select("name")
        .eq("id", String((session as any).plan_id))
        .maybeSingle()
      planName = String((plan as any)?.name || "")

      const companyId = (session as any).company_id ? String((session as any).company_id) : ""
      if (companyId) {
        const { data: company } = await admin
          .from("companies")
          .select("email")
          .eq("id", companyId)
          .maybeSingle()
        email = String((company as any)?.email || "")

        /*
         * The invoice, via the charge rather than by guessing at documents. A charge
         * carries issued_invoice_id, which the issuance function writes in the same
         * transaction that creates the document — so if there is a number to show,
         * this is where it is, and if there is not, the callback has not finished.
         */
        const { data: charge } = await admin
          .from("auditor_subscription_charges")
          .select("issued_invoice_id, status")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        settled = String((charge as any)?.status || "") === "succeeded"

        const invoiceId = (charge as any)?.issued_invoice_id ? String((charge as any).issued_invoice_id) : ""
        if (invoiceId) {
          const { data: doc } = await admin
            .from("documents")
            .select("document_number")
            .eq("id", invoiceId)
            .maybeSingle()
          documentNumber = (doc as any)?.document_number ? String((doc as any).document_number) : null
        }
      }
    }
  }

  const money = (n: number) =>
    n.toLocaleString("he-IL", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })

  return (
    <main className="min-h-svh bg-white px-4 py-12 sm:px-6 sm:py-20" dir="rtl">
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl bg-[#F6F8FC] p-7 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#E4F3EA] text-2xl text-[#127048]">
            ✓
          </div>
          <h1 className="mt-4 text-xl font-extrabold text-[#101B31]">התשלום התקבל</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#3A465F]">
            תודה. המנוי פעיל, והמומחה שלנו יוצר איתכם קשר בימים הקרובים.
          </p>

          <dl className="mt-6 flex flex-col gap-0 border-t border-[#E1E7F1] text-start">
            {planName ? <Row label="המסלול" value={planName} /> : null}
            {gross !== null && Number.isFinite(gross) ? (
              <Row label="סכום" value={`${money(gross)} ₪ כולל מע״מ · לחודש`} />
            ) : null}
            {documentNumber ? (
              <Row label="חשבונית מס קבלה" value={documentNumber} ltr />
            ) : (
              <Row
                label="חשבונית מס קבלה"
                value={settled ? "מופקת ברגעים אלה" : "תופק מיד לאחר אישור התשלום"}
              />
            )}
          </dl>

          <p className="mt-5 text-[12.5px] leading-relaxed text-[#78859B]">
            {email ? (
              <>
                החשבונית נשלחה ל<span dir="ltr" className="font-bold">{email}</span>.
              </>
            ) : (
              <>החשבונית נשלחה לאימייל שהזנתם.</>
            )}
            <br />
            הגישה לאזור האישי תיפתח בקרוב, ותקבלו קישור להגדרת סיסמה.
          </p>
        </div>

        <a
          href="/auditor"
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-white text-sm font-extrabold text-[#2C5679] shadow-[inset_0_0_0_1.5px_#CBDDEC]"
        >
          חזרה לדוח
        </a>
      </div>
    </main>
  )
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[#E1E7F1] py-3 last:border-b-0">
      <dt className="text-[12.5px] font-semibold text-[#78859B]">{label}</dt>
      <dd className="text-sm font-extrabold text-[#101B31]" dir={ltr ? "ltr" : undefined}>
        {value}
      </dd>
    </div>
  )
}

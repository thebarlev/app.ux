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

type Search = Promise<{
  session?: string
  ReturnValue?: string
  returnValue?: string
  /** Carried through the Cardcom round trip so "חזרה לדוח" can return to the real report. */
  scanId?: string
  token?: string
}>

export default async function AuditorCheckoutSuccessPage({ searchParams }: { searchParams?: Search }) {
  if (!isCheckoutEnabled()) notFound()

  const sp = (await searchParams) ?? {}
  // Cardcom's casing has changed between integrations, so all three are accepted.
  const sessionId = String(sp.session || sp.ReturnValue || sp.returnValue || "").trim()
  /*
   * Carried through the Cardcom round trip by checkout/start so "חזרה לדוח" can return to
   * the report that was actually read, rather than to /auditor, which starts a new scan.
   * Absent on an older link, in which case the button falls back to /auditor — the same
   * behaviour as before, and still a working page rather than a dead end.
   */
  const backScanId = String(sp.scanId || "").trim()
  /*
   * The site the subscription is for. The page listed a plan and a price and never said
   * what they were for — on a confirmation screen that is the one line that tells a buyer
   * the right thing was bought.
   */
  let host = ""
  const backToken = String(sp.token || "").trim()
  const backHref =
    backScanId && backToken
      ? `/auditor?scanId=${encodeURIComponent(backScanId)}&token=${encodeURIComponent(backToken)}`
      : "/auditor"

  let planName = ""
  let gross: number | null = null
  let documentNumber: string | null = null
  let email = ""
  let settled = false
  /** Whether the invoice email is recorded as sent. Never assumed from the document. */
  let invoiceEmailed = false

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

          /*
           * ⛔ MEASURED, NOT ASSUMED — the same rule the invoice number already follows.
           *
           * This page used to state "החשבונית נשלחה לאימייל שהזנתם" unconditionally,
           * while no code existed anywhere that emailed an invoice to a customer. The
           * document was real and unreachable: the only route to the PDF is auth-gated,
           * behind an account area this very page says opens "בקרוב".
           *
           * document_events is where the sender records a successful send. It is read
           * here rather than inferred from the document existing, because those are two
           * different facts and conflating them is what produced the false sentence.
           * event_type 'emailed' has been in the check constraint since migration 006,
           * so no schema change was needed to be able to tell.
           */
          const { data: emailedEvent } = await admin
            .from("document_events")
            .select("id")
            .eq("document_id", invoiceId)
            .eq("event_type", "emailed")
            .limit(1)
            .maybeSingle()
          invoiceEmailed = Boolean((emailedEvent as any)?.id)
        }
      }
    }
  }

  if (backScanId) {
    const admin = createServiceRoleClient()
    const { data: scanRow } = await admin
      .from("auditor_scans")
      .select("normalized_host, hostname")
      .eq("id", backScanId)
      .maybeSingle()
    host = String((scanRow as any)?.normalized_host || (scanRow as any)?.hostname || "")
  }

  const money = (n: number) =>
    n.toLocaleString("he-IL", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })

  return (
    <main className="min-h-svh bg-white px-4 py-10 sm:px-6 sm:py-14" dir="rtl">
      <div className="mx-auto max-w-md">
        {/*
          ⛔ THE TOP BAR, WHICH THIS PAGE DID NOT HAVE AT ALL.
          
          It was the only screen in the flow with no logo and no header — a card floating on
          white, reached straight after a card payment. That is the screen where a buyer is
          most likely to ask whether the money went to the right place, and it was the one
          screen that did not say who we are. Same bar as the checkout, same asset, same
          22px, so the two pages read as one step.
        */}
        <div className="flex items-center justify-between gap-3 border-b border-[#E1E7F1] pb-3">
          <img src="/brand/black.svg" alt="UXellent" style={{ height: 22, width: "auto", display: "block" }} />
          <span className="rounded-full bg-[#EDF3F9] px-2.5 py-1 text-[11px] font-extrabold text-[#2C5679]">
            אישור תשלום
          </span>
        </div>

        <div className="mt-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#E4F3EA] text-2xl text-[#127048]">
            ✓
          </div>
          <h1 className="mt-4 text-xl font-extrabold text-[#101B31]">התשלום התקבל</h1>
          {/*
            ⚠️ "המומחה שלנו יוצר איתכם קשר בימים הקרובים" is kept verbatim and NOT deleted,
            as instructed — but see the report: a purchase writes no row to auditor_tasks,
            which is the table the admin tasks screen reads. The only thing a human receives
            is the operator email. Whether the promise is kept rests on that inbox alone.
          */}
          <p className="mt-2 text-sm leading-relaxed text-[#3A465F]">
            תודה. המנוי פעיל, והמומחה שלנו יוצר איתכם קשר בימים הקרובים.
          </p>
        </div>

        {/*
          ⛔ WHAT WAS BOUGHT, AS ITS OWN BLOCK.
          
          The plan, the price and the site used to be three rows in one undifferentiated
          list that also held the invoice — so "חשבונית מס קבלה / תופק מיד" sat among them
          looking like a stray table row. They are two different questions: what did I buy,
          and where is my document. Two blocks, each with a heading, answers both.
        */}
        <section className="mt-7 rounded-2xl bg-[#F6F8FC] p-5">
          <h2 className="text-[12.5px] font-extrabold tracking-[.14em] text-[#78859B]">מה נקנה</h2>
          <dl className="mt-3 flex flex-col gap-0">
            {planName ? <Row label="המסלול" value={planName} /> : null}
            {gross !== null && Number.isFinite(gross) ? (
              <Row label="סכום" value={`${money(gross)} ₪ כולל מע״מ · לחודש`} />
            ) : null}
            {host ? <Row label="עבור" value={host} ltr /> : null}
          </dl>
        </section>

        <section className="mt-4 rounded-2xl bg-[#F6F8FC] p-5">
          <h2 className="text-[12.5px] font-extrabold tracking-[.14em] text-[#78859B]">החשבונית</h2>
          {documentNumber ? (
            <>
              <dl className="mt-3 flex flex-col gap-0">
                <Row label="חשבונית מס קבלה" value={documentNumber} ltr />
              </dl>
              {/*
                Past tense only when a send is on record — document_events, not the document
                existing. Two different facts, and conflating them is what produced the false
                "נשלחה" this page used to show unconditionally.
              */}
              <p className="mt-3 text-[12.5px] leading-relaxed text-[#78859B]">
                {invoiceEmailed ? (
                  email ? (
                    <>נשלחה ל<span dir="ltr" className="font-bold">{email}</span>.</>
                  ) : (
                    <>נשלחה לאימייל שהזנתם.</>
                  )
                ) : email ? (
                  <>תישלח ל<span dir="ltr" className="font-bold">{email}</span> תוך מספר דקות.</>
                ) : (
                  <>תישלח לאימייל שהזנתם תוך מספר דקות.</>
                )}
              </p>
            </>
          ) : (
            /*
              No number yet, so no empty row pretending to be one. The cron runs every five
              minutes, so "within a few minutes" is the real window rather than reassurance.
            */
            <p className="mt-3 text-sm leading-relaxed text-[#3A465F]">
              {email ? (
                <>תישלח ל<span dir="ltr" className="font-bold">{email}</span> תוך מספר דקות.</>
              ) : (
                <>תישלח לאימייל שהזנתם תוך מספר דקות.</>
              )}
            </p>
          )}
        </section>

        <p className="mt-4 text-center text-[12.5px] leading-relaxed text-[#78859B]">
          הגישה לאזור האישי תיפתח בקרוב, ותקבלו קישור להגדרת סיסמה.
        </p>

        <a
          href={backHref}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-white text-sm font-extrabold text-[#2C5679] shadow-[inset_0_0_0_1.5px_#CBDDEC]"
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

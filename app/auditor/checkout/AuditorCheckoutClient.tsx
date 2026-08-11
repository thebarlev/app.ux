"use client"

import { useState } from "react"
import { isValidIsraeliId } from "@/lib/validation/israeli-id"
import { AuditorTestimonials } from "@/components/auditor/home/ui/AuditorTestimonials"
import { AUDITOR_SCOPE, AuditorScaleStyles } from "@/components/auditor/home/ui/auditor-scale"
import { CheckoutHero } from "./CheckoutHero"

/**
 * The details form, and the last screen before money moves.
 *
 * Five required fields and one optional. No sixth was added: the list is Itzik's and
 * every field on a payment form costs conversion, so anything else has to be asked
 * for rather than assumed.
 *
 * ── THE ONE IDENTIFIER FIELD ────────────────────────────────────────────────
 * Labelled ח.פ / ע.מ / ת״ז because it accepts all three, and it accepts all three
 * because in Israel all three are nine digits sharing one check digit — so the
 * existing, already-tested isValidIsraeliId covers them with no extra code.
 *
 * It is required, and that is a deliberate trade. A tax invoice without the buyer's
 * identifier cannot be used to reclaim VAT, and a credit note (330) is blocked
 * system-wide — so an invoice issued without one cannot be corrected afterwards.
 * Requiring a company number instead would have been the obvious version of this and
 * the wrong one: it locks out עוסק פטור, a sole עוסק מורשה, and any private
 * individual. One field that takes any of the three costs nobody anything.
 *
 * ── WHAT THIS COMPONENT DOES NOT DO ─────────────────────────────────────────
 * It never sends an amount. The plan id goes up and the price is read from
 * auditor_plans on the server, twice — here for display, and again in the start
 * route that talks to Cardcom. A price in the request body would be a hole.
 *
 * It also has no card fields, and never will: the card is entered on Cardcom's own
 * Low Profile page. Nothing in this repository should ever be in a position to read
 * a card number.
 */

type Props = {
  planId: string
  planName: string
  /** VAT-inclusive — the figure that will be charged. See migration 130. */
  grossAmount: number
  netAmount: number
  vatAmount: number
  currency: string
  scanId: string
  token: string
  host: string
}

type Fields = {
  fullName: string
  email: string
  phone: string
  businessName: string
  taxId: string
  address: string
}

const EMPTY: Fields = { fullName: "", email: "", phone: "", businessName: "", taxId: "", address: "" }

/**
 * Itzik's sentence, approved word for word — not re-punctuated, not re-broken, not
 * "improved". It lives in exactly one constant so it cannot drift between the two
 * places it was asked for.
 *
 * It is in the hero and NOT in the trust rail. It was approved as the rail's heading
 * first and as the hero's line second; rendering it twice on one page would weaken
 * it in both spots, so it moved up to the more prominent of the two. Say the word and
 * it goes back to the rail as well.
 */
const HERO_SENTENCE =
  "מהרגע הזה אתם לא לבד. מומחים שדוחפים את העסק שלכם קדימה, חודש אחר חודש."

/** The same shape the rest of the app uses — see AuditorRegisterClient and forgot-password. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Israeli mobile and landline, digits only after normalising. Deliberately loose on
 * formatting and strict on length: people type spaces, hyphens and a leading +972,
 * and rejecting a correct number because of a hyphen is the most annoying possible
 * way to lose a sale.
 */
function normalisePhone(raw: string): string {
  const digits = String(raw || "").replace(/[^\d]/g, "")
  if (digits.startsWith("972")) return "0" + digits.slice(3)
  return digits
}

function validate(f: Fields): Partial<Record<keyof Fields, string>> {
  const errors: Partial<Record<keyof Fields, string>> = {}

  if (!f.fullName.trim()) errors.fullName = "נדרש שם מלא"
  if (!EMAIL_RE.test(f.email.trim())) errors.email = "כתובת אימייל לא תקינה"

  const phone = normalisePhone(f.phone)
  if (phone.length < 9 || phone.length > 10) errors.phone = "מספר טלפון לא תקין"

  if (!f.businessName.trim()) errors.businessName = "נדרש שם חברה או עסק"

  // One checksum for all three identifier types — see the note at the top.
  if (!isValidIsraeliId(f.taxId)) errors.taxId = "מספר לא תקין. ח.פ, ע.מ או ת״ז — תשע ספרות"

  return errors
}

export default function AuditorCheckoutClient(props: Props) {
  const [fields, setFields] = useState<Fields>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFields((prev) => ({ ...prev, [k]: e.target.value }))
    // Clear this field's error as soon as it is touched: an error that stays on
    // screen while the visitor fixes it reads as "still wrong".
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: undefined }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setServerError(null)

    const found = validate(fields)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSubmitting(true)
    try {
      const res = await fetch("/api/auditor/billing/checkout/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // No amount. See the note at the top of this file.
          plan_id: props.planId,
          scanId: props.scanId,
          token: props.token,
          full_name: fields.fullName.trim(),
          email: fields.email.trim().toLowerCase(),
          phone: normalisePhone(fields.phone),
          business_name: fields.businessName.trim(),
          tax_id: String(fields.taxId || "").replace(/[\s-]/g, ""),
          address: fields.address.trim() || undefined,
        }),
      })
      const json = (await res.json().catch(() => null)) as any

      if (!res.ok || !json?.ok || !json?.redirect_url) {
        setServerError(
          json?.error === "rate_limited"
            ? "יותר מדי נסיונות. נסו שוב בעוד דקה."
            : "לא הצלחנו לפתוח את עמוד התשלום. נסו שוב בעוד רגע."
        )
        setSubmitting(false)
        return
      }

      // Cardcom's own page. Full navigation, not a fetch — the card is entered there.
      window.location.href = String(json.redirect_url)
    } catch {
      setServerError("לא הצלחנו לפתוח את עמוד התשלום. נסו שוב בעוד רגע.")
      setSubmitting(false)
    }
  }

  const money = (n: number) =>
    n.toLocaleString("he-IL", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })

  return (
    <main className={`${AUDITOR_SCOPE} min-h-svh bg-white`} dir="rtl">
      <AuditorScaleStyles />
      <CheckoutHero sentence={HERO_SENTENCE} />
      <div className="px-4 py-7 sm:px-6 sm:py-10">
      {/*
        Two columns on a desktop, one on a phone, and the DOM order does both.

        grid-template-columns: 1fr 340px in RTL puts the first child on the RIGHT and
        the second on the LEFT — so the form is first in the DOM and lands in the main
        right-hand column, and the trust rail is second and lands narrower on the
        left. When the grid collapses on a phone, that same order stacks the rail
        BELOW the form and below the button, which is the requirement: pushing the CTA
        down on a phone is the fastest way to lose the sale.
      */}
      <div className="mx-auto grid max-w-5xl items-start gap-8 lg:grid-cols-[1fr_340px]">
        <div className="max-w-lg">
        {/*
          The top bar. Same mark as the report's, at the same 17px / 800 with the
          same brand-coloured second half — not a new version of it. Static text,
          not a link: see the note at the top of this file.
        */}
        <div className="flex items-center justify-between gap-3 border-b border-[#E1E7F1] pb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-[17px] font-extrabold tracking-[.2px] text-[#1C2A46]" dir="ltr">
              UX<span className="text-[#5389BB]">ellent</span>
            </span>
            <span className="rounded-full bg-[#EDF3F9] px-2.5 py-1 text-[11px] font-extrabold text-[#2C5679]">
              הרשמה למנוי
            </span>
          </div>
          <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#3A465F]">
            <span aria-hidden="true">🔒</span>
            תשלום מאובטח
          </span>
        </div>

        {/* What is being bought, before what is being asked. */}
        <div className="mt-5 rounded-2xl bg-[#F6F8FC] p-5">
          <div className="text-[12.5px] font-extrabold tracking-[.14em] text-[#78859B]">
            {props.planName}
          </div>
          <div className="mt-2 flex items-end justify-start gap-2.5">
            <b className="text-[44px] font-extrabold leading-[.92] tracking-[-.035em] text-[#101B31]">
              {money(props.netAmount)}
            </b>
            <em className="pb-1.5 text-sm font-bold not-italic text-[#78859B]">₪ לחודש</em>
          </div>
          <div className="mt-1.5 text-[12.5px] font-semibold text-[#78859B]">
            {money(props.grossAmount)} ₪ כולל מע״מ · חיוב חודשי, בלי התחייבות
          </div>
          {props.host ? (
            <div className="mt-3 border-t border-[#E1E7F1] pt-3 text-[12.5px] text-[#3A465F]">
              עבור <span dir="ltr" className="font-bold">{props.host}</span>
            </div>
          ) : null}
        </div>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
          <Field label="שם מלא" value={fields.fullName} onChange={set("fullName")} error={errors.fullName} autoComplete="name" />
          <Field label="אימייל" value={fields.email} onChange={set("email")} error={errors.email} type="email" autoComplete="email" dir="ltr" />
          <Field label="טלפון" value={fields.phone} onChange={set("phone")} error={errors.phone} type="tel" autoComplete="tel" dir="ltr" />
          <Field label="שם חברה / עסק" value={fields.businessName} onChange={set("businessName")} error={errors.businessName} autoComplete="organization" />
          <Field
            label="ח.פ / ע.מ / ת״ז"
            value={fields.taxId}
            onChange={set("taxId")}
            error={errors.taxId}
            hint="תשע ספרות. נדרש לחשבונית מס קבלה."
            inputMode="numeric"
            dir="ltr"
          />
          <Field label="כתובת" value={fields.address} onChange={set("address")} error={undefined} optional autoComplete="street-address" />

          {serverError ? (
            <p role="alert" className="rounded-xl bg-[#FBE7E4] px-4 py-3 text-sm font-semibold text-[#B33A2C]">
              {serverError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 inline-flex h-[54px] items-center justify-center rounded-xl bg-gradient-to-b from-[#5389BB] to-[#3A6D9A] text-base font-extrabold text-white transition disabled:opacity-60"
          >
            {submitting ? "רגע…" : `לתשלום · ${money(props.grossAmount)} ₪`}
          </button>

          {/* Itzik's wording, unchanged. It is also literally true: what is stored
              is a Cardcom token, never a card number. */}
          <p className="text-center text-[12.5px] leading-relaxed text-[#78859B]">
            התשלום מתבצע בעמוד המאובטח של קארדקום. פרטי הכרטיס אינם נשמרים אצלנו.
            <br />
            חשבונית מס קבלה תישלח לאימייל שהזנתם.
          </p>
        </form>
        </div>

        <TrustRail />
      </div>
      </div>
    </main>
  )
}

/**
 * The trust rail. Left on a desktop, below the button on a phone.
 *
 * ── NAVY, AND NOT BY PREFERENCE ─────────────────────────────────────────────
 * AuditorTestimonials is written for the report's closing block: its text colours
 * are hard-coded #FFFFFF and #C4D3E6. Dropping it on a white column would render it
 * invisible, and "the same two testimonials, same design" was the instruction — so
 * the rail carries the navy the component already expects, and the component itself
 * is reused untouched. Same quotes, same layout, same colours, zero edits.
 *
 * ── NOTHING HERE IS CLICKABLE ───────────────────────────────────────────────
 * No <a>, no href, no target. A person who leaves a payment page mid-way does not
 * come back, so the logo, the quotes and the sentence are all static text.
 * AuditorTestimonials was checked for links before being reused: it has none.
 *
 * ── WHAT IS MISSING FROM THIS RAIL, AND WHY IT IS NOT INVENTED ──────────────
 * The client-logo strip was asked for as "the same logos as the results page". There
 * is no such strip on the results page: it belongs to the "מה שהשגנו ללקוחות שלנו"
 * section, which exists in the v5 spec only and is one of the three sections
 * deferred until after launch. Rather than pick logos, it is left out and reported.
 */
function TrustRail() {
  return (
    <aside
      className="overflow-hidden rounded-2xl px-5 py-6"
      style={{ background: "linear-gradient(135deg,#1B3453,#2C577F)" }}
    >
      {/*
        No heading here any more — the approved sentence moved to the hero, where it
        is the first thing on the page rather than the fourth. Repeating it in both
        places would have blunted it in both. AuditorTestimonials brings its own
        heading.
      */}
      <AuditorTestimonials locale="he" />
    </aside>
  )
}

function Field({
  label,
  value,
  onChange,
  error,
  hint,
  optional,
  type = "text",
  ...rest
}: {
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  error?: string
  hint?: string
  optional?: boolean
  type?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-bold text-[#3A465F]">
        {label}
        {optional ? <span className="font-semibold text-[#78859B]"> · אופציונלי</span> : null}
      </span>
      <input
        {...rest}
        type={type}
        value={value}
        onChange={onChange}
        aria-invalid={error ? true : undefined}
        className={`h-12 rounded-none border-0 border-b bg-transparent px-0.5 text-base text-[#101B31] outline-none transition ${
          error ? "border-b-2 border-[#B33A2C]" : "border-[#5C6473] focus:border-b-2 focus:border-[#3F76AC]"
        }`}
      />
      {error ? (
        <span className="text-[12.5px] font-semibold text-[#B33A2C]">{error}</span>
      ) : hint ? (
        <span className="text-[12.5px] text-[#78859B]">{hint}</span>
      ) : null}
    </label>
  )
}

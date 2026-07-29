"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { AuditorLocale } from "@/lib/auditor/locale"
import { AuditorReportV3 } from "@/components/auditor/home/ui/AuditorReportV3"

type Props = {
  locale: AuditorLocale
  isSubmitting: boolean
  /** Real counts from the finished scan — the headline states them out loud. */
  pagesScanned: number
  issuesCount: number
  onSubmit: (lead: {
    full_name: string
    phone: string
    email: string
    consent_terms: boolean
    consent_contact: boolean
  }) => void
}

const C = {
  ink: "#19183B",
  ink2: "#3A4160",
  muted: "#8A90A0",
  line: "#ECEFF4",
  line2: "#E2E7F0",
  field: "#F7F9FC",
  brand: "#5389BB",
  brandDk: "#3F76AC",
  green: "#167C4B",
  greenBg: "#E9F8F0",
  red: "#C0392B",
} as const

const T = {
  he: {
    ready: "● הדוח מוכן",
    where: "לאן לשלוח את הדוח?",
    ledeA: "הציון כבר חושב. השאירו פרטים ו",
    ledeB: "הדוח נפתח מיד כאן על המסך",
    ledeC: ".",
    peekScore: "ציון-על",
    peekIssues: "ממצאים",
    name: "שם מלא",
    phone: "טלפון",
    email: "אימייל",
    terms: "אני מאשר/ת את תנאי השימוש ומדיניות הפרטיות",
    contactBold: "שלחו לי עותק של הדוח למייל",
    contactRest: " — וגם עדכונים ותכנים שיווקיים. בלי סימון, הדוח יוצג כאן על המסך בלבד.",
    cta: "הציגו לי את הדוח ←",
    micro: "ללא עלות · הדוח נפתח מיד על המסך",
    errName: "נא למלא שם מלא",
    errPhone: "נא למלא מספר טלפון",
    errEmail: "נא למלא כתובת אימייל תקינה",
    errTerms: "יש לאשר את תנאי השימוש",
    /**
     * "סרקנו 1 עמודים" was accurate and still read like a defect: the public
     * flow is a verification scan, which the pipeline pins to a single page
     * regardless of the page_limit column, so that "1" is the permanent shape
     * of this sentence rather than a small result. Naming the homepage says the
     * same true thing without dangling a number that looks capped.
     *
     * The plural branch is kept live for the multi-page kinds — nothing about
     * "סרקנו 8 עמודים" needs fixing, and hard-coding the singular would break
     * the day one of them reaches this screen.
     */
    headline: (p: number, i: number) => {
      const scanned = p === 1 ? "בדקנו את עמוד הבית" : p > 1 ? `סרקנו ${p} עמודים` : "בדקנו את האתר"
      const found = i === 0 ? "ולא מצאנו ממצאים מהותיים" : i === 1 ? "ומצאנו ממצא אחד" : `ומצאנו ${i} ממצאים`
      return `${scanned} ${found}.`
    },
  },
  en: {
    ready: "● Your report is ready",
    where: "Where should we send it?",
    ledeA: "The score is already calculated. Leave your details and ",
    ledeB: "the report opens right here on screen",
    ledeC: ".",
    peekScore: "Overall score",
    peekIssues: "Findings",
    name: "Full name",
    phone: "Phone",
    email: "Email",
    terms: "I accept the terms of use and privacy policy",
    contactBold: "Email me a copy of the report",
    contactRest: " — plus updates and marketing content. Without this, the report is shown here on screen only.",
    cta: "Show me the report →",
    micro: "Free · the report opens immediately on screen",
    errName: "Please enter your full name",
    errPhone: "Please enter a phone number",
    errEmail: "Please enter a valid email address",
    errTerms: "You must accept the terms of use",
    headline: (p: number, i: number) => {
      const scanned = p === 1 ? "We checked your homepage" : p > 1 ? `We scanned ${p} pages` : "We checked your site"
      const found = i === 0 ? "and found no major findings" : i === 1 ? "and found 1 finding" : `and found ${i} findings`
      return `${scanned} ${found}.`
    },
  },
} as const

/**
 * The lead form, per design-mockups/auditor-scanflow-v3-light-FINAL.html.
 *
 * Two consents, two different jobs. Terms are mandatory and gate the button.
 * Marketing is optional and buys the emailed copy — nothing else. The report on
 * screen opens for anyone who left details, always: it is what was promised,
 * and tying it to marketing consent would be bundling consent into the service
 * itself. Consent buys extra content, never the product.
 *
 * Both boxes arrive unticked, which is the one place this deviates from the
 * mockup — the mockup ships them `checked`, and a pre-ticked box is not
 * consent. The wording is the mockup's, word for word.
 *
 * The score tile in the peek is an empty block rather than the mockup's blurred
 * figure. A blur is not a security boundary: `filter: blur()` over a real
 * number leaves that number in the DOM for anyone who opens devtools, which
 * makes the form it is meant to gate optional. The count of findings is not
 * treated that way because the headline above already says it in words.
 */
export function AuditorLeadGate({ locale, isSubmitting, pagesScanned, issuesCount, onSubmit }: Props) {
  const en = locale === "en"
  const t = T[en ? "en" : "he"]
  const rtl = !en

  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [consentTerms, setConsentTerms] = useState(false)
  const [consentContact, setConsentContact] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = () => {
    // Mirrors auditorLeadSchema so a rejected submit is caught before the round
    // trip: name >= 2, phone >= 6, a real email, and terms are mandatory.
    if (fullName.trim().length < 2) return setLocalError(t.errName)
    if (phone.trim().length < 6) return setLocalError(t.errPhone)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setLocalError(t.errEmail)
    if (!consentTerms) return setLocalError(t.errTerms)

    setLocalError(null)
    onSubmit({
      full_name: fullName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      consent_terms: consentTerms,
      consent_contact: consentContact,
    })
  }

  return (
    <div className="relative min-h-[80svh] w-full" dir={rtl ? "rtl" : "ltr"}>
      {/*
        The report the visitor is about to get, blurred out behind the form.
        Decorative and inert: aria-hidden keeps it out of the accessibility tree
        and pointer-events-none stops it swallowing taps meant for the fields,
        which matters on mobile where the two overlap almost entirely.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 select-none overflow-hidden blur-[6px] opacity-40 sm:blur-[8px] sm:opacity-50"
      >
        <AuditorReportV3 locale={locale} status={null} teaser />
      </div>

      {/* The mockup's veil: white at 62% over a 2.5px blur. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "rgba(255,255,255,.62)", backdropFilter: "blur(2.5px)" }}
      />

      <div className="relative flex min-h-[80svh] items-center justify-center px-4 py-10">
        <div
          className="w-full max-w-[430px] rounded-[20px] bg-white p-[26px] pb-5"
          style={{ border: `1px solid ${C.line2}`, boxShadow: "0 30px 70px rgba(25,24,59,.20)" }}
        >
          <span
            className="inline-flex items-center gap-[7px] rounded-full px-3 py-1 text-[12.5px] font-extrabold"
            style={{ background: C.greenBg, color: C.green }}
          >
            {t.ready}
          </span>

          <h2 className="mb-1.5 mt-3 text-[22px] font-extrabold leading-[1.3]" style={{ color: C.ink }}>
            {t.headline(pagesScanned, issuesCount)}
            <br />
            {t.where}
          </h2>

          <p className="mb-4 text-sm" style={{ color: C.ink2 }}>
            {t.ledeA}
            <b style={{ color: C.ink }}>{t.ledeB}</b>
            {t.ledeC}
          </p>

          <div className="mb-[17px] flex gap-2">
            <div className="flex-1 rounded-[11px] p-[9px_6px] text-center" style={{ background: C.field, border: `1px solid ${C.line}` }}>
              {/* Not rendered, not merely hidden — see the note above. */}
              <div className="mx-auto h-[19px] w-11 rounded-md" style={{ background: "#0000001a" }} />
              <span className="mt-0.5 block text-[10.5px] font-bold" style={{ color: C.muted }}>{t.peekScore}</span>
            </div>
            <div className="flex-1 rounded-[11px] p-[9px_6px] text-center" style={{ background: C.field, border: `1px solid ${C.line}` }}>
              <b className="block text-[19px] font-extrabold tabular-nums" style={{ color: C.ink }}>{issuesCount}</b>
              <span className="mt-0.5 block text-[10.5px] font-bold" style={{ color: C.muted }}>{t.peekIssues}</span>
            </div>
          </div>

          <div className="space-y-[9px]">
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t.name}
              autoComplete="name"
              className="h-[45px] rounded-[11px]"
              style={{ background: C.field, borderColor: C.line2 }}
            />
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t.phone}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              style={{ direction: "ltr", textAlign: rtl ? "right" : "left", background: C.field, borderColor: C.line2 }}
              className="h-[45px] rounded-[11px]"
            />
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.email}
              type="email"
              inputMode="email"
              autoComplete="email"
              dir="ltr"
              style={{ direction: "ltr", textAlign: rtl ? "right" : "left", background: C.field, borderColor: C.line2 }}
              className="h-[45px] rounded-[11px]"
            />
          </div>

          <div className="mt-[9px] space-y-[9px] text-xs leading-[1.45]">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={consentTerms}
                onChange={(e) => setConsentTerms(e.target.checked)}
                className="mt-0.5 h-[15px] w-[15px] shrink-0"
                style={{ accentColor: C.brand }}
              />
              <span style={{ color: C.ink2 }}>
                {t.terms} <b style={{ color: C.red }}>*</b>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={consentContact}
                onChange={(e) => setConsentContact(e.target.checked)}
                className="mt-0.5 h-[15px] w-[15px] shrink-0"
                style={{ accentColor: C.brand }}
              />
              <span style={{ color: C.ink2 }}>
                <b style={{ color: C.ink }}>{t.contactBold}</b>
                {t.contactRest}
              </span>
            </label>
          </div>

          {localError ? (
            <p role="alert" className="mt-3 text-sm" style={{ color: C.red }}>
              {localError}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleSubmit}
            /* Terms gate the button; marketing never does. */
            disabled={isSubmitting || !consentTerms}
            className="mt-4 flex h-[50px] w-full items-center justify-center gap-2 rounded-xl text-[16.5px] font-extrabold text-white transition hover:opacity-90 disabled:opacity-60"
            style={{ background: C.brandDk, boxShadow: "0 8px 20px rgba(63,118,172,.28)" }}
          >
            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {t.cta}
          </button>

          <div className="mt-2.5 text-center text-[11.5px]" style={{ color: C.muted }}>
            {t.micro}
          </div>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useId, useState } from "react"
import { Loader2 } from "lucide-react"
import { AUDITOR_SCOPE, AuditorScaleStyles } from "@/components/auditor/home/ui/auditor-scale"
import { Input } from "@/components/ui/input"
import type { AuditorLocale } from "@/lib/auditor/locale"
import { AUDITOR_CONSENT_TEXT } from "@/lib/auditor/consent-text"

type Props = {
  locale: AuditorLocale
  isSubmitting: boolean
  /** Real counts from the finished scan — the headline states them out loud. */
  pagesScanned: number
  issuesCount: number
  /**
   * The scan reached a conclusion but produced no score, so there is no report
   * behind this form. Switches every promise on the screen: no "הדוח מוכן", no
   * peek tiles over 0/0, and a CTA that offers a callback instead of a report.
   * Rule 5 permits the gate to open here; it does not permit it to lie.
   */
  noScore?: boolean
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
  /**
   * The field underline, and darker than the hairline it used to borrow.
   *
   * line2 is #E2E7F0, which sits at about 1.2:1 against white — visible in a
   * mockup and not on a phone in daylight. This is the only rule left telling a
   * visitor where the field is, so it needs to carry that on its own. Roughly
   * 5.3:1, comfortably past the 3:1 that non-text UI boundaries want, and still
   * a grey rather than a black line.
   *
   * The thickness is deliberately unchanged at 1px. What was hard to see was the
   * contrast, not the weight.
   */
  fieldLine: "#5C6473",
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
    peekScoreLocked: "ציון האתר",
    peekIssues: "ממצאים",
    name: "שם מלא",
    phone: "טלפון",
    email: "אימייל",
    /*
     * These three come from lib/auditor/consent-text.ts, not from here.
     * The lead route records the same strings into consent_terms_text and
     * consent_contact_text, so the sentence on screen and the sentence in the
     * evidence row cannot drift apart. See the note in that file.
     */
    terms: AUDITOR_CONSENT_TEXT.he.terms,
    contactBold: AUDITOR_CONSENT_TEXT.he.contactBold,
    contactRest: AUDITOR_CONSENT_TEXT.he.contactRest,
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
    /**
     * The no-score variant. Every line that promises a report is replaced
     * rather than softened: there is no score, no findings count and no
     * document waiting, so "מוכן", "הציון כבר חושב" and "הדוח נפתח מיד" would
     * each be false. What is true is that the scan finished, that something
     * blocked it, and that a person will look at it — which is what the email
     * to the team is for.
     */
    noScore: {
      ready: "● הסריקה הסתיימה",
      headlineA: "לא הצלחנו לקרוא את האתר.",
      where: "השאירו פרטים ונחזור אליכם",
      ledeA: "יש תקלה בסריקת האתר. השאירו פרטים ו",
      ledeB: "נבדוק מה חסם אותה ונחזור אליכם",
      ledeC: ".",
      cta: "שלחו פרטים ←",
      micro: "ללא עלות · נחזור אליכם באופן אישי",
    },
  },
  en: {
    ready: "● Your report is ready",
    where: "Where should we send it?",
    ledeA: "The score is already calculated. Leave your details and ",
    ledeB: "the report opens right here on screen",
    ledeC: ".",
    peekScoreLocked: "Site score",
    peekIssues: "Findings",
    name: "Full name",
    phone: "Phone",
    email: "Email",
    terms: AUDITOR_CONSENT_TEXT.en.terms,
    contactBold: AUDITOR_CONSENT_TEXT.en.contactBold,
    contactRest: AUDITOR_CONSENT_TEXT.en.contactRest,
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
    noScore: {
      ready: "● Scan finished",
      headlineA: "We couldn't read this site.",
      where: "Leave your details and we'll get back to you",
      ledeA: "Something blocked the scan. Leave your details and ",
      ledeB: "we'll find out what and come back to you",
      ledeC: ".",
      cta: "Send my details →",
      micro: "Free · a person will get back to you",
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
 * The score tile in the peek carries a padlock rather than the mockup's blurred
 * figure. A blur is not a security boundary: `filter: blur()` over a real
 * number leaves that number in the DOM for anyone who opens devtools, which
 * makes the form it is meant to gate optional. The count of findings is not
 * treated that way because the headline above already says it in words.
 */
export function AuditorLeadGate({ locale, isSubmitting, pagesScanned, issuesCount, noScore = false, onSubmit }: Props) {
  const en = locale === "en"
  const t = T[en ? "en" : "he"]
  const rtl = !en
  /** Every promise-bearing string, resolved once against the two variants. */
  const copy = noScore
    ? t.noScore
    : { ready: t.ready, where: t.where, ledeA: t.ledeA, ledeB: t.ledeB, ledeC: t.ledeC, cta: t.cta, micro: t.micro }

  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [consentTerms, setConsentTerms] = useState(false)
  const [consentContact, setConsentContact] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  /** Label-to-input wiring. Generated so two gates on a page cannot collide. */
  const nameId = useId()
  const phoneId = useId()
  const emailId = useId()

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
    <div className={`${AUDITOR_SCOPE} relative min-h-[80svh] w-full`} dir={rtl ? "rtl" : "ltr"}>
      <AuditorScaleStyles />
      {/*
        ⛔ NOTHING BEHIND THE FORM. WHITE.
        
        This held a full teaser report at blur-[6px] and 40% opacity, under a 62% white
        veil. The idea was that a blurred report is more tempting than an empty panel, and
        it was built that way on request — then seen and decided against.
        
        Two things went with it and both are improvements on their own terms:
        
        · The blurred layer was a full second render of AuditorReportV3, mounted purely as
          texture. Removing it removes that whole subtree from the first screen every
          visitor loads.
        
        · Its values were never real — they could not be, because `filter: blur()` over a
          real score still ships the score in the DOM, and the gate exists to withhold it.
          So the layer was decoration standing in for content, and once it is decoration
          there is no argument for paying for it.
      */}

      {/*
        No card around the form.

        The last round flattened the three fields but left the thing they sat in:
        a white panel with a border and a 70px drop shadow, holding a 26px inset
        of its own. On a 390px screen that was another 52px gone plus an edge, and
        it is the reason the form still read as cramped after the fields were
        already flat.

        Nothing sits behind the form now, so it carries its own edge —
        that is what a veil is for — so the panel was drawing a second boundary
        for the same job. The form is now the content of the page at this step,
        with a width cap so it does not sprawl on a desktop.
      */}
      <div className="relative flex min-h-[80svh] items-center justify-center px-3 py-10 sm:px-4">
        <div className="w-full max-w-[460px]">
          {/*
            ⛔ The logo the lead page did not have.
            
            It is on the report masthead and on the checkout bar, and this is the FIRST screen
            a visitor sees — the one place a brand is worth the most and the only one of the
            three that was missing it. Same asset, same height as the checkout bar.
            
            Centred rather than left-aligned: this card is a centred column on a white page,
            and a mark hugging one edge of a 460px card reads as misalignment.

            ⚠️ 140px wide, and the 10px difference from the report masthead and the scanning
            screen is deliberate, not a slip. Those two are full-width steps; this is a
            460px card, and 150 inside it left the mark crowding the card's own edges. Height
            auto, so the ratio stays the file's.
          */}
          <img
            src="/brand/black.svg"
            alt="UXellent"
            style={{ width: 140, height: "auto", display: "block", margin: "0 auto 18px" }}
          />
          <span
            className="inline-flex items-center gap-[7px] rounded-full px-3 py-1 font-extrabold"
            style={
              noScore
                ? { background: "#FDF3E3", color: "#B7791F", fontSize: "var(--ar-meta)" }
                : { background: C.greenBg, color: C.green, fontSize: "var(--ar-meta)" }
            }
          >
            {copy.ready}
          </span>

          <h2 className="mb-1.5 mt-3 font-extrabold leading-[1.3]" style={{ color: C.ink, fontSize: "var(--ar-h1)" }}>
            {noScore ? t.noScore.headlineA : t.headline(pagesScanned, issuesCount)}
            <br />
            {copy.where}
          </h2>

          <p className="mb-4" style={{ color: C.ink2, fontSize: "var(--ar-lede)" }}>
            {copy.ledeA}
            <b style={{ color: C.ink }}>{copy.ledeB}</b>
            {copy.ledeC}
          </p>

          {/*
            The peek tiles are dropped entirely rather than zeroed. A padlock
            over a score that was never computed advertises something being
            withheld, and "0 ממצאים" reads as a clean bill of health for a site
            nobody managed to read. Neither number exists here.
          */}
          <div className={`mb-[17px] flex gap-2 ${noScore ? "hidden" : ""}`}>
            <div className="flex-1 flex flex-col items-center justify-center rounded-[11px] p-[9px_6px] text-center" style={{ background: C.field, border: `1px solid ${C.line}` }}>
              {/*
                A padlock on the score's own type scale rather than a grey
                placeholder bar. It sits in the same 19px line box as the
                findings figure beside it and carries the brand colour, so the
                two tiles read as one matched pair whose left half is
                deliberately still shut. The bar it replaces read as a component
                that had failed to load, which is why the tile looked like it
                belonged to a different screen.

                Still not rendered, not merely hidden: the score itself never
                reaches the DOM, which is the whole point of the tile.
              */}
              {/* Height and glyph both ride --ar-peek so the pair stays matched at either scale. */}
              <span className="flex items-center justify-center" style={{ color: C.brand, height: "var(--ar-peek)" }} aria-hidden="true">
                <svg width="0.79em" height="0.9em" viewBox="0 0 15 17" fill="none" style={{ fontSize: "var(--ar-peek)" }}>
                  <path d="M4 7.2V4.9a3.5 3.5 0 0 1 7 0v2.3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  <rect x="1.7" y="7.2" width="11.6" height="8.2" rx="2.3" fill="currentColor" />
                </svg>
              </span>
              {/*
                "ציון האתר" under the padlock, not "ציון-על". The old label named
                a metric that does not exist by that name anywhere else in the
                flow; this one names the thing the lock is holding, which is what
                a caption on a locked tile is for.
              */}
              <span className="mt-0.5 block font-bold" style={{ color: C.muted, fontSize: "var(--ar-caption)" }}>{t.peekScoreLocked}</span>
            </div>
            <div className="flex-1 rounded-[11px] p-[9px_6px] text-center" style={{ background: C.field, border: `1px solid ${C.line}` }}>
              <b className="block font-extrabold tabular-nums" style={{ color: C.ink, fontSize: "var(--ar-peek)", lineHeight: "var(--ar-peek)" }}>{issuesCount}</b>
              <span className="mt-0.5 block font-bold" style={{ color: C.muted, fontSize: "var(--ar-caption)" }}>{t.peekIssues}</span>
            </div>
          </div>

          {/*
            The underline is set inline, not from the scoped stylesheet.

            The .ar-scope .ar-field rule is present, matches the element and
            reads border-width 0 0 1px in the CSSOM, and the element carries the
            class and sits inside the scope — all verified in the browser. The
            computed style was still 1px on four sides against a white fill, and
            an enumeration of every matching rule that sets border or background
            came back empty, so whatever wins is not reachable that way. Rather
            than keep excavating, the declaration goes where nothing but
            !important can outrank it. The class stays for the :focus rule, which
            an inline style cannot express.

            Standing labels above the fields, not placeholders inside them.

            A placeholder is the wrong element for a field's name: it disappears
            the moment somebody types, so a half-filled form stops saying what
            its own fields are, and it is announced inconsistently across screen
            readers because it is a hint rather than a name. Each label is a real
            <label htmlFor> pointing at the input's id, which also makes the
            label text a tap target for the field.

            The placeholders are gone rather than kept alongside: repeating the
            label inside the box is noise, and a placeholder that duplicates the
            label is the pattern that made the label look optional.

            ids come from useId so two gates on one page cannot collide.
          */}
          <div className="space-y-[15px]">
            <div>
              <label htmlFor={nameId} className="mb-1 block font-bold" style={{ color: C.ink2, fontSize: "var(--ar-label)" }}>
                {t.name}
              </label>
              {/*
                Inline on purpose. A stylesheet rule does not win here — see the note above.

                ⚠️ textAlign is "left" now, not rtl ? "right" : "left", and unicodeBidi is
                plaintext. An email address and a phone number are LTR values, and this field
                declared direction:ltr while aligning the text to the RIGHT — the one thing in
                this flow that can put a typed character somewhere the typist is not looking.
                It was reported as "the dot is not accepted".

                ⛔ Said plainly: this is the only candidate in our code and it is NOT
                confirmed. There is no character filter anywhere in the path — not in this
                onChange, not in components/ui/input.tsx, and there is no key handler on this
                page. Neither this line nor the shared base class was touched in the recent
                rounds, so this is not a regression from them.

                Worth changing regardless: an LTR value in a right-aligned box is a bidi trap
                whether or not it is today's bug.
              */}
              <Input
                id={nameId}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                className="ar-field h-[52px] focus:ring-0"
                style={{ border: "none", borderBottom: `1px solid ${C.fieldLine}`, borderRadius: 0, background: "transparent", boxShadow: "none", paddingInline: 2 }}
              />
            </div>
            <div>
              <label htmlFor={phoneId} className="mb-1 block font-bold" style={{ color: C.ink2, fontSize: "var(--ar-label)" }}>
                {t.phone}
              </label>
              {/* Inline on purpose. A stylesheet rule does not win here — see the note above. */}
              <Input
                id={phoneId}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                style={{ direction: "ltr", textAlign: "left", unicodeBidi: "plaintext", border: "none", borderBottom: `1px solid ${C.fieldLine}`, borderRadius: 0, background: "transparent", boxShadow: "none", paddingInline: 2 }}
                className="ar-field h-[52px] focus:ring-0"
              />
            </div>
            <div>
              <label htmlFor={emailId} className="mb-1 block font-bold" style={{ color: C.ink2, fontSize: "var(--ar-label)" }}>
                {t.email}
              </label>
              {/* Inline on purpose. A stylesheet rule does not win here — see the note above. */}
              <Input
                id={emailId}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                inputMode="email"
                autoComplete="email"
                dir="ltr"
                style={{ direction: "ltr", textAlign: "left", unicodeBidi: "plaintext", border: "none", borderBottom: `1px solid ${C.fieldLine}`, borderRadius: 0, background: "transparent", boxShadow: "none", paddingInline: 2 }}
                className="ar-field h-[52px] focus:ring-0"
              />
            </div>
          </div>

          {/*
            Alignment note, because this reverses a verified change on purpose.

            A previous round moved these labels from items-start to items-center,
            and that was measured and confirmed: the box sat dead-centre of the
            two-line block. Centring on the block is the wrong target. A consent
            box belongs on the line it introduces, so a two-line label does not
            drift it into the gap between lines. Back to items-start, with an
            explicit offset that lands it on the first line rather than above it.
            This is deliberate, not a regression.

            The size sits on each label, not on this wrapper.

            app/globals.css carries an unlayered `label { font-size: 13px }`, and
            a declaration on the element always beats an inherited value — so a
            font-size on the wrapper never reached these two lines. They were
            measured at 13px on a 390px viewport while the rest of the flow had
            moved to 20px, which is the opposite of what the phone scale was for.
            Same shape of bug as the heading colour in the report: a global
            element rule quietly outranking inheritance.
          */}
          <div className="mt-[9px] space-y-[9px] leading-[1.45]">
            <label className="flex cursor-pointer items-start gap-2.5" style={{ fontSize: "var(--ar-prose)" }}>
              <input
                type="checkbox"
                checked={consentTerms}
                onChange={(e) => setConsentTerms(e.target.checked)}
                className="shrink-0"
                style={{ accentColor: C.brand, width: "var(--ar-check)", height: "var(--ar-check)",
                  // Centred on the first line of the label rather than on the block.
                  // items-start alone pins it to the top edge, which sits above the
                  // cap height; half the difference between one line box and the box
                  // itself puts it on the line. Derived from the two tokens, so it
                  // stays true at both scales.
                  marginTop: "calc((var(--ar-prose) * 1.45 - var(--ar-check)) / 2)" }}
              />
              <span style={{ color: C.ink2 }}>
                {t.terms} <b style={{ color: C.red }}>*</b>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5" style={{ fontSize: "var(--ar-prose)" }}>
              <input
                type="checkbox"
                checked={consentContact}
                onChange={(e) => setConsentContact(e.target.checked)}
                className="shrink-0"
                style={{ accentColor: C.brand, width: "var(--ar-check)", height: "var(--ar-check)",
                  // Centred on the first line of the label rather than on the block.
                  // items-start alone pins it to the top edge, which sits above the
                  // cap height; half the difference between one line box and the box
                  // itself puts it on the line. Derived from the two tokens, so it
                  // stays true at both scales.
                  marginTop: "calc((var(--ar-prose) * 1.45 - var(--ar-check)) / 2)" }}
              />
              <span style={{ color: C.ink2 }}>
                <b style={{ color: C.ink }}>{t.contactBold}</b>
                {t.contactRest}
              </span>
            </label>
          </div>

          {localError ? (
            <p role="alert" className="mt-3" style={{ color: C.red, fontSize: "var(--ar-lede)" }}>
              {localError}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleSubmit}
            /* Terms gate the button; marketing never does. */
            disabled={isSubmitting || !consentTerms}
            className="mt-4 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl py-3 font-extrabold text-white transition hover:opacity-90 disabled:opacity-60"
            style={{ background: C.brandDk, boxShadow: "0 8px 20px rgba(63,118,172,.28)", fontSize: "var(--ar-lede)" }}
          >
            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {copy.cta}
          </button>

          <div className="mt-2.5 text-center" style={{ color: C.muted, fontSize: "var(--ar-meta)" }}>
            {copy.micro}
          </div>
        </div>
      </div>
    </div>
  )
}

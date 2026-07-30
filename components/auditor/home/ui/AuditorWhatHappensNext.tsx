"use client"

import { useState } from "react"
import type { AuditorLocale } from "@/lib/auditor/locale"
import { WhatsAppMark } from "@/components/auditor/home/ui/WhatsAppMark"

/**
 * What happens next, at the top of the report — above the score, before any
 * scrolling.
 *
 * Its whole job is that the phone call is not a surprise. That is also why none
 * of these lines carries a time: no "within minutes", no "one business day".
 * A promise nobody committed to is worse than no promise, and this bar is the
 * first thing the visitor reads after handing over their details.
 */

type Props = {
  locale: AuditorLocale
  whatsappUrl?: string
  phone?: string
  /** Whether they ticked marketing consent — the only thing that buys the email. */
  emailCopy?: boolean
}

/**
 * Kill switch for the emailed copy. While the sending pipeline does not exist,
 * this stays false and the step is not shown at all — the bar must never promise
 * an email nobody sends. Two locks, and neither of them lies: no consent, no
 * step; no pipeline, no step.
 */
const REPORT_EMAIL_ENABLED =
  String(process.env.NEXT_PUBLIC_AUDITOR_REPORT_EMAIL_ENABLED || "").trim() === "true"

const C = {
  ink: "#19183B",
  ink2: "#3A4160",
  dim: "#8A90A0",
  line: "#DCE4EF",
  brand: "#5389BB",
  brandInk: "#3A6D9A",
  green: "#167C4B",
  greenBg: "#E8F7EF",
  /** The report's panel fill. This strip is one of its panels, not a frame. */
  surface: "#F6F8FC",
} as const

type State = "done" | "active" | "waiting"

function Marker({ state }: { state: State }) {
  if (state === "done") {
    return (
      <span style={{ width: 26, height: 26, borderRadius: "50%", background: C.greenBg, color: C.green, display: "grid", placeItems: "center", fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
        ✓
      </span>
    )
  }
  if (state === "active") {
    return (
      <span style={{ width: 26, height: 26, borderRadius: "50%", background: "#fff", display: "grid", placeItems: "center", flexShrink: 0, boxShadow: `0 0 0 3px rgba(83,137,187,.22)`, border: `2px solid ${C.brand}` }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.brand }} />
      </span>
    )
  }
  return (
    <span style={{ width: 26, height: 26, borderRadius: "50%", background: "#fff", border: `2px solid #DDE3EC`, flexShrink: 0 }} />
  )
}

export function AuditorWhatHappensNext({ locale, whatsappUrl, phone = "054-5215193", emailCopy = false }: Props) {
  const en = locale === "en"
  const showEmailStep = REPORT_EMAIL_ENABLED && emailCopy

  /**
   * Whether the visitor has asked to talk. WhatsApp and the phone number are
   * behind this rather than beside it.
   *
   * The strip's job is to say what happens next, and the last step offers to go
   * through the findings together. Two live contact buttons sitting permanently
   * at the foot of that answered the offer before it was made: the choice was
   * already taken, so the step read as an ad for the buttons under it. Asking
   * first and showing the channels second makes the step a question again, and
   * the visitor who does not want a phone call never has one put in front of
   * them.
   */
  const [showContact, setShowContact] = useState(false)

  /**
   * The last step invites rather than promises. Nobody committed to calling
   * anyone, and this is the first thing read after handing over details — an
   * unkept promise here costs more than a softer line.
   */
  const steps: Array<{ state: State; title: string; body: string; reveals?: boolean }> = [
    en
      ? { state: "done", title: "Your report is ready", body: "shown below" }
      : { state: "done", title: "הדוח שלכם מוכן", body: "מוצג כאן למטה" },
    ...(showEmailStep
      ? [
          en
            ? { state: "active" as State, title: "A copy by email", body: "sent to the address you left · keep it" }
            : { state: "active" as State, title: "עותק במייל", body: "נשלח לכתובת שהשארתם · שמרו אותו" },
        ]
      : []),
    en
      ? { state: "waiting", title: "Let's go through it together", body: "Talk to us", reveals: true }
      : { state: "waiting", title: "נעבור על זה יחד", body: "דברו איתנו", reveals: true },
  ]

  return (
    <div
      dir={en ? "ltr" : "rtl"}
      style={{
        background: C.surface,
        borderRadius: 16,
        padding: "var(--ar-panel)",
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ color: C.green, fontSize: "var(--ar-h3)", fontWeight: 800 }}>✓</span>
        <b style={{ fontSize: "var(--ar-h3)", fontWeight: 800, color: C.ink }}>
          {en ? "We got your details, here's what happens now" : "קיבלנו את הפרטים, הנה מה שקורה עכשיו"}
        </b>
      </div>

      {/*
        Horizontal on desktop, stacked on mobile. auto-fit rather than a media
        query so the three collapse on their own at narrow widths, which is what
        the mockup shows and what a 360px phone needs.
      */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14 }}>
        {steps.map((s) =>
          s.reveals ? (
            /*
             * The whole step is the control, not a link buried under it.
             *
             * It was a title with a small underlined word beneath, and the
             * underline was the only thing saying anything here could be
             * clicked. The step now is a <button>: the marker, the title and a
             * chevron that turns when it opens, with the whole row as the tap
             * target. What it reveals — the number and the WhatsApp button — is
             * genuinely not on screen until asked for, which is the point.
             */
            <button
              key={s.title}
              type="button"
              onClick={() => setShowContact((v) => !v)}
              aria-expanded={showContact}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                background: "none", border: "none", padding: 0, font: "inherit",
                textAlign: "start", cursor: "pointer", color: "inherit",
              }}
            >
              <Marker state={s.state} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "var(--ar-prose)", fontWeight: 800, color: C.ink2 }}>{s.title}</span>
                <span style={{ display: "block", fontSize: "var(--ar-meta)", fontWeight: 800, color: C.brandInk, marginTop: 2 }}>
                  {s.body}
                </span>
              </span>
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true"
                   style={{ flexShrink: 0, color: C.brandInk, transform: showContact ? "rotate(180deg)" : "none", transition: "transform .18s ease" }}>
                <path d="M2.5 4.5 L6 8 L9.5 4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <div key={s.title} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <Marker state={s.state} />
              <div>
                <div style={{ fontSize: "var(--ar-prose)", fontWeight: 800, color: s.state === "waiting" ? C.ink2 : C.ink }}>{s.title}</div>
                <div style={{ fontSize: "var(--ar-meta)", color: C.dim, marginTop: 2, lineHeight: 1.45 }}>{s.body}</div>
              </div>
            </div>
          )
        )}
      </div>

      {/* Only after the visitor asks. See the note on showContact. */}
      {showContact ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            marginTop: 16,
            paddingTop: 14,
            borderTop: `1px solid ${C.line}`,
          }}
        >
          <span style={{ fontSize: "var(--ar-prose)", fontWeight: 700, color: C.ink2 }}>
            {en ? "We're here" : "אנחנו כאן"}
          </span>
          <span style={{ flex: 1 }} />
          {whatsappUrl ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ background: "#25D366", color: "#fff", borderRadius: 10, padding: "9px 16px", fontWeight: 800, fontSize: "var(--ar-prose)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 7 }}
            >
              <WhatsAppMark size={16} />
              {en ? "WhatsApp" : "שלחו וואטסאפ"}
            </a>
          ) : null}
          <a
            href={`tel:${phone.replace(/-/g, "")}`}
            style={{ background: "#fff", color: C.brandInk, borderRadius: 10, padding: "10px 16px", fontWeight: 800, fontSize: "var(--ar-prose)", textDecoration: "none" }}
          >
            {phone}
          </a>
        </div>
      ) : null}
    </div>
  )
}

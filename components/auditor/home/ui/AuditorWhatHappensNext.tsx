"use client"

import type { AuditorLocale } from "@/lib/auditor/locale"

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
  line: "#CBDDEE",
  brand: "#5389BB",
  brandInk: "#3A6D9A",
  green: "#167C4B",
  greenBg: "#E8F7EF",
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
   * The last step invites rather than promises. Nobody committed to calling
   * anyone, and this is the first thing read after handing over details — an
   * unkept promise here costs more than a softer line.
   */
  const steps: Array<{ state: State; title: string; body: string }> = [
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
      ? { state: "waiting", title: "Let's go through it together", body: "want us to walk the findings with you? talk to us" }
      : { state: "waiting", title: "נעבור על זה יחד", body: "רוצים שנעבור על הממצאים איתכם? דברו איתנו" },
  ]

  return (
    <div
      dir={en ? "ltr" : "rtl"}
      style={{
        border: `1px solid ${C.line}`,
        background: "linear-gradient(180deg,#F4F9FD,#ffffff)",
        borderRadius: 16,
        padding: "18px 20px",
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ color: C.green, fontSize: 16, fontWeight: 800 }}>✓</span>
        <b style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>
          {en ? "We got your details — here's what happens now" : "קיבלנו את הפרטים — הנה מה שקורה עכשיו"}
        </b>
      </div>

      {/*
        Horizontal on desktop, stacked on mobile. auto-fit rather than a media
        query so the three collapse on their own at narrow widths, which is what
        the mockup shows and what a 360px phone needs.
      */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14 }}>
        {steps.map((s) => (
          <div key={s.title} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <Marker state={s.state} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: s.state === "waiting" ? C.ink2 : C.ink }}>{s.title}</div>
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 2, lineHeight: 1.45 }}>{s.body}</div>
            </div>
          </div>
        ))}
      </div>

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
        <span style={{ fontSize: 13.5, fontWeight: 700, color: C.ink2 }}>
          {en ? "We're here" : "אנחנו כאן"}
        </span>
        <span style={{ flex: 1 }} />
        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ background: "#25D366", color: "#fff", borderRadius: 10, padding: "9px 16px", fontWeight: 800, fontSize: 13.5, textDecoration: "none" }}
          >
            {en ? "WhatsApp" : "שלחו וואטסאפ"}
          </a>
        ) : null}
        <a
          href={`tel:${phone.replace(/-/g, "")}`}
          style={{ background: "#fff", color: C.brandInk, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 16px", fontWeight: 800, fontSize: 13.5, textDecoration: "none" }}
        >
          {phone}
        </a>
      </div>
    </div>
  )
}

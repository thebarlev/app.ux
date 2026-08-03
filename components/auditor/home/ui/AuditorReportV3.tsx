"use client"

import type { AuditorLocale } from "@/lib/auditor/locale"
import type { StatusResponse } from "@/components/auditor/home/logic/auditor-home-types"
import { AuditorWhatHappensNext } from "@/components/auditor/home/ui/AuditorWhatHappensNext"
import { WhatsAppMark } from "@/components/auditor/home/ui/WhatsAppMark"
import { AuditorTestimonials } from "@/components/auditor/home/ui/AuditorTestimonials"
import { AUDITOR_SCOPE, AuditorScaleStyles } from "@/components/auditor/home/ui/auditor-scale"

/**
 * The report, per design-mockups/auditor-dashboard-v3.html.
 *
 * One component serves two jobs. `teaser` renders the same layout with every
 * number replaced by a grey block — that is what sits blurred behind the lead
 * form, so the shape the visitor glimpses is exactly the shape they get. A blur
 * is not a security boundary: the markup under it is readable in devtools
 * whatever the CSS says, so in teaser mode the values are not merely hidden,
 * they are never rendered.
 *
 * Where the mockup shows data the engine does not produce, the tile is locked
 * rather than invented — see TILES below.
 */

type Props = {
  locale: AuditorLocale
  status: StatusResponse | null
  teaser?: boolean
  onUnlock?: () => void
  whatsappUrl?: string
  phone?: string
  emailCopy?: boolean
}

const C = {
  ink: "#1C2A46",
  ink2: "#3A465F",
  muted: "#8A93A6",
  /**
   * Row separators inside a list, and the only rules left on the page. Deepened
   * from #EAEEF4 once the panels stopped being white: a hairline tuned against
   * white is nearly invisible on the surface fill, and these rules are what keep
   * a findings list readable as a list.
   */
  line: "#E1E7F1",
  /** Meter and gauge tracks, on the surface fill rather than on white. */
  track: "#E4E9F3",
  brand: "#5389BB",
  brandInk: "#3A6D9A",
  green: "#1E9E63",
  amber: "#C68A24",
  amberBg: "#FBF3E0",
  red: "#D65F55",
  gold: "#B0872F",
  goldBg: "#FAF2DC",
  slate: "#AEB8CC",
  /**
   * The fill every panel on this page uses, on a page that is itself white.
   *
   * It replaces a system of white panel + hairline border + shadow sitting on a
   * #F5F7FB canvas. That gave every block three separate edges, and blocks
   * nested inside blocks inherited all three again: a gold lock band, bordered,
   * inside a bordered card, inside a bordered canvas. Three frames deep to say
   * one thing.
   *
   * Grouping now comes from fill alone. Nothing on this page draws a border
   * except the hairlines that separate rows inside a list, which are content
   * rules rather than frames, and hierarchy comes from scale and space.
   */
  surface: "#F6F8FC",
  /**
   * Secondary text on the navy closing block. Same value as onNavyDim in
   * AuditorTestimonials, which owns the top half of that block — the two halves
   * have to agree and this is the second of them.
   */
  onNavyDim: "#C4D3E6",
} as const

function toneFor(v: number | null): { text: string; fill: string } {
  if (v === null) return { text: C.muted, fill: C.slate }
  if (v >= 75) return { text: C.green, fill: C.green }
  if (v >= 50) return { text: C.amber, fill: C.amber }
  return { text: C.red, fill: C.red }
}

/**
 * A number in the report, or an anonymous block in the teaser.
 *
 * `size` stays a number because the teaser block is a rectangle sized off it.
 * The rendered figure takes --ar-val instead, so it grows with the rest of the
 * scale on a phone; the teaser only has to hold the same slot, not the same
 * pixels.
 */
function Val({ v, teaser, size = 30 }: { v: number | null; teaser: boolean; size?: number }) {
  if (teaser) return <div style={{ height: size * 0.9, width: size * 1.7, borderRadius: 8, background: "#0000001a" }} />
  const tone = toneFor(v)
  return (
    <div style={{ fontSize: "var(--ar-val)", fontWeight: 800, lineHeight: 1.1, color: tone.text }}>{v === null ? "—" : v}</div>
  )
}

/**
 * Where this category stands, as a climb rather than a stripe.
 *
 * A flat filled bar says "some of a thing" and nothing else — it has no low end
 * and no high end, so 40 and 80 look like different amounts of the same
 * indifferent colour. Twelve rungs that rise left to right give the axis back:
 * the lit ones are how far up this site has got, the unlit ones are the room
 * above it, and the height of each rung says which direction is better.
 *
 * Twelve because the tile is narrow on a phone and fewer, fatter rungs read at a
 * glance; the value is still exact in the figure above.
 */
const RUNGS = 12

function Meter({ v, teaser }: { v: number | null; teaser: boolean }) {
  const pct = teaser ? 60 : v === null ? 0 : Math.max(0, Math.min(100, v))
  const tone = toneFor(teaser ? null : v)
  const lit = Math.round((pct / 100) * RUNGS)
  return (
    <div
      style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 26 }}
      role="img"
      aria-label={v === null ? undefined : `${pct} / 100`}
    >
      {Array.from({ length: RUNGS }, (_, i) => {
        const on = i < lit
        return (
          <span
            key={i}
            style={{
              flex: 1,
              // 34% at the low end rising to full height at the high end, so the
              // shape itself reads as a scale before any colour is noticed.
              height: `${34 + (i / (RUNGS - 1)) * 66}%`,
              borderRadius: 2,
              background: on ? (teaser ? "#00000022" : tone.fill) : C.track,
              transition: "background .2s ease",
            }}
          />
        )
      })}
    </div>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.surface, borderRadius: 18, padding: "var(--ar-panel)", ...style }}>
      {children}
    </div>
  )
}

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "0 4px 12px" }}>
      <h2 style={{ fontSize: "var(--ar-h2)", fontWeight: 800, color: C.ink }}>{title}</h2>
      {hint ? <span style={{ fontSize: "var(--ar-meta)", color: C.muted, fontWeight: 600 }}>{hint}</span> : null}
    </div>
  )
}

/**
 * What the score means, in the visitor's terms, and what we are offering about it.
 *
 * Content only — it reads score_total and changes nothing about how that number
 * is produced. It sits directly above the closing contact block because the two
 * belong to the same beat: this is the reading of the result, and the block
 * under it is the invitation to act on it.
 *
 * Band boundaries follow the wording of the brief literally — "above 70",
 * "50 to 70", "below 50" — so both endpoints fall in the middle band: 70 is
 * "50 to 70" and 50 is "50 to 70". Stated here because a boundary that lives
 * only in a comparison operator is the kind of thing that gets flipped by
 * accident later.
 */
const SCORE_BAND_COPY = {
  he: {
    high: {
      title: "ציון טוב, אבל זה לא אומר שהוא מביא לקוחות",
      body: "האתר שלכם עומד ברוב הדרישות הטכניות, וזה בסיס מצוין. אבל ציון גבוה בבדיקה כזו לא מבטיח שמבקרים הופכים ללקוחות. יש עוד כמה דברים שישפיעו ישירות על התוצאות שלכם, ונשמח לעבור עליהם יחד איתכם.",
    },
    mid: {
      title: "ציון בינוני, אתם כבר בדרך הנכונה",
      body: "האתר שלכם עומד בחלק מהדרישות, וזו התחלה טובה. יש כמה נקודות מרכזיות שכדאי לחדד כדי שהאתר באמת יעבוד בשבילכם. נשמח לעזור לכם לסגור את הפערים האלה.",
    },
    low: {
      title: "יש כאן עבודה, ואנחנו כאן בשבילה",
      body: "כרגע האתר לא ממצה את מה שהוא יכול לתת לכם, לא בבדיקות הטכניות ולא ביכולת להביא לקוחות חדשים. זו הזדמנות טובה להתחיל לבנות את זה נכון, ונשמח לעשות את זה איתכם.",
    },
    always: "ציון גבוה חשוב, אבל הוא לא הכל. הצלחה אמיתית באינטרנט היא שילוב של אתר תקין ודרך נכונה להביא לקוחות. בזה אנחנו יכולים לעזור לכם.",
    offer:
      "הטבה מיוחדת ל-24 השעות הקרובות. פרטים אצל הסוכנים שלנו, החל מ-300 ₪ לחודש לקידום אורגני ב-SEO ובבינה מלאכותית (AI).",
  },
  /**
   * Written to read as English rather than as a translation of the Hebrew, and
   * approved as such — the two say the same thing without matching clause for
   * clause. Kept nullable in the type so a future locale can opt out the way
   * this one did before the wording existed.
   */
  en: {
    high: {
      title: "A good score — but a good score doesn't bring customers",
      body: "Your site meets most of the technical requirements, and that's an excellent base. But a high score here doesn't guarantee that visitors turn into customers. A few more things affect your results directly, and we'd be glad to go through them with you.",
    },
    mid: {
      title: "A fair score — you're on the right track",
      body: "Your site meets some of the requirements, and that's a good start. There are a few key points worth sharpening so the site really works for you. We'd be glad to help you close those gaps.",
    },
    low: {
      title: "There's work to do here, and that's what we're for",
      body: "Right now your site isn't giving you what it could — not in the technical checks, and not in bringing in new customers. This is a good opportunity to start building it properly, and we'd be glad to do it with you.",
    },
    always:
      "A high score matters, but it isn't everything. Real success online is a working site combined with the right way to bring in customers. That's where we can help.",
    offer:
      "Special offer for the next 24 hours. Details from our agents — from ₪300/month for organic SEO and AI visibility.",
  } as null | {
    high: { title: string; body: string }
    mid: { title: string; body: string }
    low: { title: string; body: string }
    always: string
    offer: string
  },
} as const

function scoreBand(total: number): "high" | "mid" | "low" {
  if (total > 70) return "high"
  if (total >= 50) return "mid"
  return "low"
}

/**
 * One fixed size for the whole band, desktop and phone alike.
 *
 * Everything else in this flow rides the --ar-* scale, which grows on a phone
 * — 13.5px prose becomes 20px. This block is asked to hold one size at both
 * widths instead, so the sizes are literals rather than tokens; a token cannot
 * express "the same at every width" here.
 *
 * 18px rather than a 16/18 split. auditor-scale states the floor in as many
 * words — nothing a visitor reads goes below 18px on a phone — and a 16px body
 * would have sat under it on exactly the screens that rule was written for.
 * Hierarchy comes from weight instead: the reading leads at 800, the rest is
 * regular, and the block still steps up from the 14.5px lede around it.
 */
const BAND_TYPE = 18

function ScoreBandCopy({ locale, total }: { locale: AuditorLocale; total: number }) {
  const copy = locale === "en" ? SCORE_BAND_COPY.en : SCORE_BAND_COPY.he
  if (!copy) return null
  const band = copy[scoreBand(total)]

  return (
    /*
     * One panel, two tiers, so the four lines do not read as a wall.
     *
     * The band reading leads at heading weight. The two fixed lines sit under a
     * hairline as a separate register — they are ours in every case rather than
     * a reading of this particular score — and the offer is the only one of the
     * four that carries a fill, because it is the only one making a concrete
     * commercial promise and it is what the contact block below is for.
     */
    <div style={{ background: C.surface, borderRadius: 20, padding: "var(--ar-panel-lg)", marginTop: 14 }}>
      <h3 style={{ fontSize: BAND_TYPE, fontWeight: 800, color: C.ink, marginBottom: 8 }}>{band.title}</h3>
      <p style={{ fontSize: BAND_TYPE, color: C.ink2, maxWidth: "62ch" }}>{band.body}</p>

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
        <p style={{ fontSize: BAND_TYPE, color: C.ink2, maxWidth: "62ch" }}>{copy.always}</p>
        {/*
          White on the surface fill, not gold.

          Gold on this page means "locked, pay to unlock" — it is the LockBand
          fill, and two of those sit directly above this panel. An offer in the
          same gold read as a third lock band rather than as an invitation to
          talk to somebody, which is the opposite of what it is. Inverting the
          figure/ground instead keeps it distinct using the page's own system,
          where grouping comes from fill and nothing draws a border.
        */}
        <p
          style={{
            marginTop: 12,
            background: "#fff",
            color: C.ink,
            borderRadius: 14,
            padding: "12px 14px",
            fontSize: BAND_TYPE,
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          {copy.offer}
        </p>
      </div>
    </div>
  )
}

/** The gold "and more — in premium" band from the mockup. */
function LockBand({ title, body, cta, onUnlock }: { title: string; body: string; cta: string; onUnlock?: () => void }) {
  return (
    /*
     * The row wraps, and the text column has a floor.
     *
     * It was a nowrap flex row with a 40px icon and a ~130px button both at
     * flexShrink 0 and the text at flex:1 — which is flex-basis 0%, so the text
     * absorbed every pixel the other two would not give up. Nested two cards
     * deep at 360px that left it about 90px wide and it broke to one word per
     * line, twelve lines tall, in the band that is supposed to sell premium.
     *
     * flex-basis 170 with a 150px floor means the text stops shrinking first;
     * once icon + text + button no longer fit, the button wraps onto its own
     * line instead. Wide screens still get the original single row.
     */
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 13, marginTop: 14, background: C.goldBg, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#fff", color: C.gold, display: "grid", placeItems: "center", fontSize: 18, flexShrink: 0 }}>🔒</div>
      <div style={{ flex: "1 1 170px", minWidth: 150 }}>
        <b style={{ fontSize: "var(--ar-prose)", color: C.ink }}>{title}</b>
        <p style={{ fontSize: "var(--ar-meta)", color: C.ink2, marginTop: 1 }}>{body}</p>
      </div>
      <button type="button" onClick={onUnlock} style={{ background: C.gold, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 800, fontSize: "var(--ar-meta)", cursor: "pointer", flexShrink: 0, fontFamily: "inherit", marginInlineStart: "auto" }}>
        {cta}
      </button>
    </div>
  )
}

export function AuditorReportV3({ locale, status, teaser = false, onUnlock, whatsappUrl, phone = "0545215193", emailCopy = false }: Props) {
  const en = locale === "en"
  const ok = status && status.ok === true ? status : null
  const cats = (ok?.category_scores || {}) as Record<string, number>
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null)

  const total = teaser ? null : num(ok?.score_total)
  const issues = teaser ? [] : ok?.issues_overview || []
  const issuesCount = teaser ? 0 : typeof ok?.issues_count === "number" ? ok.issues_count : issues.length
  const pages = teaser ? null : num(ok?.pages_scanned)
  const host = teaser ? "" : String(ok?.hostname || "")

  /**
   * The mockup shows five categories. Three exist: search, AI and tracking —
   * tracking only became readable once it was added to category_scores, having
   * carried 10% of the total while appearing in neither entry.
   *
   * "Technical" is computed but never leaves the server: /api/auditor/status
   * publishes category_scores, not score_breakdown. "Content" has no source at
   * all — no scoring rule reads content, keywords or word count. Both are shown
   * locked rather than filled with a plausible number, which is also where the
   * content dimension is headed as a premium feature.
   */
  const TILES: Array<{ label: string; value: number | null; locked?: boolean }> = [
    { label: en ? "Google SEO" : "גוגל SEO", value: num(cats.search_readiness ?? ok?.score_search) },
    { label: en ? "AI visibility" : "נראות ב-AI", value: num(cats.ai_readiness ?? ok?.score_ai) },
    { label: en ? "Technical" : "טכני", value: null, locked: true },
    { label: en ? "Content" : "תוכן", value: null, locked: true },
    { label: en ? "Traffic tracking" : "מעקב תנועה", value: num(cats.tracking) },
  ]

  const dash = 326.7
  const offset = total === null ? dash : dash * (1 - Math.max(0, Math.min(100, total)) / 100)
  const gaugeTone = toneFor(total)

  return (
    <div className={AUDITOR_SCOPE} dir={en ? "ltr" : "rtl"} style={{ background: "#fff", color: C.ink, padding: "var(--ar-page)", fontFamily: "'Assistant',system-ui,Arial,sans-serif" }}>
      <AuditorScaleStyles />
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        {/*
          The masthead. It used to be one unstyled line of bold text with a dot
          and a hostname, sitting under a block of empty page — the only part of
          the report that looked like it had been forgotten.

          Now a labelled strip: a small brand-coloured eyebrow saying what this
          document is, and the hostname under it at heading weight, which is the
          thing the visitor actually wants confirmed. Hairline under it so the
          head of the page has an edge to sit on.
        */}
        <div style={{ marginTop: 0, marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "var(--ar-meta)", fontWeight: 800, color: C.brandInk, letterSpacing: ".02em" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.brand, flexShrink: 0 }} />
            {en ? "Ranking report" : "דוח דירוג"}
          </div>
          {!teaser && host ? (
            <div style={{ fontWeight: 800, fontSize: "var(--ar-h3)", color: C.ink, marginTop: 3, wordBreak: "break-word" }} dir="ltr">
              {host}
            </div>
          ) : null}
        </div>

        {!teaser ? <AuditorWhatHappensNext locale={locale} whatsappUrl={whatsappUrl} emailCopy={emailCopy} /> : null}

        {/* hero */}
        <div style={{ background: C.surface, borderRadius: 20, padding: "var(--ar-panel-lg)", display: "flex", alignItems: "center", gap: 28, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: "var(--ar-label)", fontWeight: 700, color: C.brandInk, marginBottom: 6 }}>
              {en ? "Search & AI readiness" : "מוכנות לחיפוש ול-AI"}
            </div>
            <h1 style={{ fontSize: "var(--ar-h1)", fontWeight: 800, marginBottom: 8, color: C.ink }}>
              {en ? "Your site's current score" : "הציון הנוכחי של האתר שלך"}
            </h1>
            <p style={{ color: C.ink2, fontSize: "var(--ar-lede)", maxWidth: "52ch" }}>
              {teaser
                ? en
                  ? "Where you stand in Google and AI search, and what is holding you back."
                  : "איפה אתה עומד בגוגל ובחיפוש AI, ומה מעכב אותך."
                : issuesCount > 0
                  ? en
                    ? `A solid base, but key pieces are missing. We found ${issuesCount} ${issuesCount === 1 ? "opportunity" : "opportunities"} to improve.`
                    : `בסיס טוב, אבל חסרים רכיבים מרכזיים. ${issuesCount === 1 ? "זיהינו הזדמנות אחת לשיפור." : `זיהינו ${issuesCount} הזדמנויות לשיפור.`}`
                  : en
                    ? "No major findings in the initial scan."
                    : "לא נמצאו ממצאים מהותיים בסריקה הראשונית."}
            </p>
            {!teaser && total !== null ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 14, background: C.amberBg, color: C.amber, fontWeight: 700, fontSize: "var(--ar-label)", padding: "6px 13px", borderRadius: 999 }}>
                ● {en ? "Room to improve" : "פוטנציאל שיפור גבוה"}
              </span>
            ) : null}
          </div>
          <div style={{ flexShrink: 0, width: 132, height: 132, position: "relative", display: "grid", placeItems: "center" }}>
            <svg viewBox="0 0 120 120" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
              <circle cx="60" cy="60" r="52" fill="none" stroke={C.track} strokeWidth="11" />
              <circle cx="60" cy="60" r="52" fill="none" stroke={teaser ? "#00000018" : gaugeTone.fill} strokeWidth="11" strokeLinecap="round" strokeDasharray={dash} strokeDashoffset={teaser ? dash * 0.45 : offset} />
            </svg>
            <div style={{ textAlign: "center" }}>
              {teaser ? (
                <div style={{ height: 38, width: 62, borderRadius: 8, background: "#0000001a" }} />
              ) : (
                <div style={{ fontSize: "var(--ar-score)", fontWeight: 800, lineHeight: 1 }}>{total === null ? "—" : total}</div>
              )}
              <div style={{ fontSize: "var(--ar-meta)", color: C.muted, fontWeight: 600, marginTop: 2 }}>{en ? "out of 100" : "מתוך 100"}</div>
            </div>
          </div>
        </div>

        {/* experts banner */}
        {/*
          The same surface fill as the score panel above it, which is what it
          should have been all along. It once carried a blue wash that made it
          the loudest thing on a page whose subject is the score, so it read as
          the headline rather than the aside it is. The blue it needs is in the
          badge.
        */}
        <div style={{ background: C.surface, borderRadius: 18, padding: "var(--ar-panel)", display: "flex", alignItems: "flex-start", gap: 11, marginBottom: 12 }}>
          {/*
            A rising line instead of a 46px filled tile with a ✦ in it. The tile
            was the widest thing in the banner and said nothing; the chart says
            what the sentence beside it promises. The line draws itself once on
            mount and then holds — motion that reports, rather than loops.
          */}
          {/*
            26px and on the first line of the heading, not 34px centred against
            the whole block. Centring floated it into the middle of a five-line
            column and the 18px gap beside it took a further chunk of a 334px
            row, which is the crowding: the mark was reading as a third of the
            banner rather than as a mark.
          */}
          <div style={{ flexShrink: 0, width: 26, height: 26, color: C.brand, marginTop: "calc((var(--ar-h3) * 1.25 - 26px) / 2)" }} aria-hidden="true">
            <svg viewBox="0 0 34 34" width="26" height="26" fill="none">
              <path d="M3 27 L12 18 L19 22 L31 8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
                    style={{ strokeDasharray: 46, strokeDashoffset: 0, animation: "ar-draw .9s ease-out both" }} />
              <path d="M24 8 H31 V15" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            {/*
              Nobody is working on this site yet. The service starts after an
              approval, a connection and a payment, so "already working on your
              site" was describing work that had not begun, to a visitor who had
              done nothing but leave a phone number.

              The progress bar went with it. It sat at a fixed 34% with the label
              "work in progress", which is the same false claim drawn instead of
              written — a bar that never moves cannot be reporting anything, and
              rewording the heading above a fake 34% would have fixed only the
              half a reader takes least seriously.
            */}
            <b style={{ fontSize: "var(--ar-h3)", fontWeight: 800 }}>
              {en ? "We'll bring your business new customers" : "נביא לעסק שלך לקוחות חדשים"}
            </b>
            <p style={{ fontSize: "var(--ar-prose)", color: C.ink2, marginTop: 2 }}>
              {en
                ? "Our specialists do the groundwork that gets you there: links to your site, articles and more. It starts the moment you give us the go-ahead."
                : "המומחים שלנו עושים את העבודה היסודית שמביאה לזה: קישורים לאתר, מאמרים ועוד. מתחילים ברגע שתאשרו."}
            </p>
          </div>
        </div>

        {/*
          Legitimacy strip. One line of prose, so it is set as one line of prose
          rather than as a third panel: no fill, no edge, just space around it.
          Panelling a single sentence was most of what made this page feel closed
          in.
        */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "4px 6px", margin: "2px 0 24px", fontSize: "var(--ar-label)", lineHeight: 1.35, color: C.ink2, flexWrap: "wrap" }}>
          <span>🔍</span>
          <span>
            <span style={{ fontWeight: 800, color: C.ink }}>
              {/*
                Same treatment as the lead gate: the public flow is a
                verification scan pinned to one page, so "1 pages" is the
                permanent shape of this line rather than a small result.
                Naming the homepage says the same true thing. The plural branch
                stays for the multi-page scan kinds.
              */}
              {teaser || pages === null
                ? en ? "Pages scanned" : "עמודים שנסרקו"
                : pages === 1
                  ? en ? "The scan checked your homepage" : "הסריקה בדקה את עמוד הבית"
                  : en ? `The scan checked ${pages} pages` : `הסריקה בדקה ${pages} עמודים`}
            </span>{" "}
            {en ? "with data-based analysis, not estimates." : "באתר שלך, בניתוח מבוסס-נתונים ולא בהערכות."}
          </span>
          <span style={{ color: C.muted }}>·</span>
          <span style={{ color: C.gold, fontWeight: 700, lineHeight: 1.25 }}>
            {en ? "Premium customers get a deep scan across dozens of pages ↗" : "לקוחות פרימיום מקבלים סריקה עמוקה בעשרות עמודים ↗"}
          </span>
        </div>

        {/* category tiles */}
        {/*
          Title on its own line, hint under it, cards below. The two used to sit
          on one row with space-between, and on a phone the hint crowded the
          title into a corner of its own heading.
        */}
        <div style={{ margin: "0 4px 12px" }}>
          {/*
            A question, in the register the homepage headline uses, rather than
            "ציון לפי קטגוריה" — which named the mechanism and not the stake. The
            mechanism moves down into the subhead where it belongs.
          */}
          <h2 style={{ fontSize: "var(--ar-h2)", fontWeight: 800, color: C.ink, width: "100%" }}>
            {en ? "How likely is your business to be found?" : "מה הסיכוי שהעסק שלך יימצא?"}
          </h2>
          <div style={{ fontSize: "var(--ar-meta)", color: C.muted, fontWeight: 600, marginTop: 2 }}>
            {en ? "By category · 0–100" : "לפי קטגוריה · 0–100"}
          </div>
        </div>
        <div className="ar-tiles" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginBottom: 24 }}>
          {TILES.map((t) => (
            <div key={t.label} className="ar-tile" style={{ background: t.locked && !teaser ? C.goldBg : C.surface, borderRadius: 15, padding: "var(--ar-panel-sm)" }}>
              {/*
                Fixed-height label row as well as a fixed-height value row. The
                locked tiles carry a padlock next to the word, and the glyph is
                taller than the label text, so their whole tile shifted down and
                the meters in one row started at two different heights.
              */}
              <div className="ar-tile-label" style={{ fontSize: "var(--ar-label)", color: C.ink2, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, height: "calc(var(--ar-label) * 1.5)" }}>
                {t.label}
                {/* The lock lives on the value row now, next to the word "נעול". */}
              </div>
              {t.locked && !teaser ? (
                <>
                  {/*
                    A locked tile shows a lock and the word, not a grey bar that
                    looks like a score of zero. The row underneath says what is
                    behind it rather than drawing an empty scale, because an
                    unlit scale on a locked card reads as "measured, and bad".
                  */}
                  <div className="ar-tile-val" style={{ fontSize: "var(--ar-label)", fontWeight: 800, lineHeight: "var(--ar-val)", height: "var(--ar-val)", display: "flex", alignItems: "center", gap: 7, margin: "4px 0 9px", color: C.gold }}>
                    <span style={{ fontSize: "var(--ar-caption)", lineHeight: 1 }}>🔒</span>
                    {en ? "Locked" : "נעול"}
                  </div>
                  <div className="ar-tile-meter" style={{ display: "flex", alignItems: "center", height: 26 }}>
                    <span style={{ fontSize: "var(--ar-meta)", color: C.gold, fontWeight: 700 }}>
                      {en ? "Opens with premium" : "נפתח בפרימיום"}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  {/*
                    A fixed --ar-val-tall slot, so the meter under every tile
                    starts at the same y whatever the tile has to show: a real
                    figure, the em dash for "not measured", or the word Premium.
                    They used to be three different heights in one row.
                  */}
                  <div className="ar-tile-val" style={{ height: "var(--ar-val)", display: "flex", alignItems: "center", margin: "4px 0 9px" }}>
                    <Val v={t.value} teaser={teaser} />
                  </div>
                  <div className="ar-tile-meter">
                    <Meter v={t.value} teaser={teaser} />
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* issues + gaps */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
          <Card>
            <SectionHead
              title={en ? "Findings" : "ממצאים"}
              hint={teaser ? undefined : String(issuesCount)}
            />
            {teaser ? (
              [0, 1].map((i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i ? `1px solid ${C.line}` : "none" }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: "#0000001a", flexShrink: 0 }} />
                  <div style={{ height: 10, borderRadius: 99, background: "#0000001a", width: i ? "62%" : "84%" }} />
                </div>
              ))
            ) : issues.length > 0 ? (
              issues.slice(0, 2).map((text, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: i ? `1px solid ${C.line}` : "none" }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", fontWeight: 800, flexShrink: 0, fontSize: "var(--ar-label)", background: "#FCEDEB", color: C.red }}>!</div>
                  <div style={{ fontSize: "var(--ar-prose)", fontWeight: 600 }}>{text}</div>
                </div>
              ))
            ) : (
              <p style={{ fontSize: "var(--ar-prose)", color: C.muted, padding: "8px 0" }}>
                {en ? "No major findings." : "לא נמצאו ממצאים מהותיים."}
              </p>
            )}
            {!teaser && issuesCount > 2 ? (
              <LockBand
                title={en ? `${issuesCount - 2} more findings in premium` : `ועוד ${issuesCount - 2} ממצאים בפרימיום`}
                body={en ? "Our experts will find and fix all of them for you." : "המומחים שלנו יזהו ויטפלו בכל הממצאים עבורך."}
                cta={en ? "Unlock access" : "פתחו גישה"}
                onUnlock={onUnlock}
              />
            ) : null}
          </Card>

          <Card>
            <SectionHead title={en ? "Where the gaps are" : "איפה הפערים"} hint={en ? "by category" : "לפי קטגוריה"} />
            {TILES.filter((t) => !t.locked).map((t) => (
              <div key={t.label} style={{ display: "flex", alignItems: "center", gap: 11, margin: "11px 0" }}>
                <span style={{ width: 92, fontSize: "var(--ar-label)", fontWeight: 700, color: C.ink2, flexShrink: 0 }}>{t.label}</span>
                <div style={{ flex: 1 }}>
                  <Meter v={t.value === null ? null : 100 - t.value} teaser={teaser} />
                </div>
              </div>
            ))}
            {!teaser ? (
              <LockBand
                title={en ? "More categories in premium" : "ועוד קטגוריות בפרימיום"}
                body={en ? "Exactly where you lose traffic, and what we close first." : "בדיוק איפה אתה מפסיד תנועה, ומה נסגור קודם."}
                cta={en ? "Unlock access" : "פתחו גישה"}
                onUnlock={onUnlock}
              />
            ) : null}
          </Card>
        </div>

        {/*
          The closing block: what other customers say, and then us saying we have
          their details. One container, not two.

          They were two blocks with a gap between them, and the gap made the
          quotes read as one more report section that happened to be followed by
          a CTA. Joined, the sequence is an argument: here is what they say about
          us, and here is us. Clipped by a single overflow:hidden radius so the
          tinted half and the navy half are one shape.

          The separation this had from the findings above it is untouched — that
          seam is the one that should stay open.

          Not in the teaser: it is a shape to glimpse behind a form, and two
          paragraphs of real customer prose blurred out is noise there.
        */}
        {/*
          Reads the score, sells nothing the score does not support. Gated on a
          real number: the teaser has no score by design, and a scan that ended
          without one never reaches this component.
        */}
        {!teaser && total !== null ? <ScoreBandCopy locale={locale} total={total} /> : null}

        {!teaser ? (
          <div style={{ marginTop: 40, borderRadius: 20, overflow: "hidden", background: "linear-gradient(135deg,#1B3453,#2C577F)" }}>
            <AuditorTestimonials locale={locale} />
            {/*
          CTA. The visitor has already left their details by the time this shows.

          It is the one dark block on the page and the only place colour is used
          to close something rather than to group it, so it is set deeper than
          the mid-blue it used to carry and the body copy is full white rather
          than the pale blue tint. On a page that is now white throughout, a
          washed-out paragraph inside the single dark band read as the weakest
          text on the screen while sitting in the loudest place on it.
        */}
            <div style={{ padding: "var(--ar-panel-lg)", color: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
                {/*
                Explicit white, not inherited white.

                app/globals.css carries unlayered `h1..h4 { color: var(--fg) }`
                rules. An unlayered element rule is still a declaration on the
                element, and a declaration always beats an inherited value, so
                the parent's color:#fff never reached this heading: it rendered
                in the app's dark foreground on a dark navy band, which is the
                one place on the page where that is unreadable.

                The hero h1 below has the same gap and was invisible only because
                --fg happens to be dark and it sits on a light panel. Both now
                state their colour rather than depending on a global.
              */}
              <h3 style={{ fontSize: "var(--ar-cta)", fontWeight: 800, marginBottom: 6, color: "#fff" }}>
                {en ? "We got your details ✓" : "קיבלנו את הפרטים שלך ✓"}
              </h3>
              <p style={{ fontSize: "var(--ar-lede)", color: "#fff", maxWidth: "48ch" }}>
                {en ? "We'll be in touch shortly. Want to move faster? Talk to us directly." : "נציג שלנו יחזור אליך בהקדם. רוצה להתקדם כבר עכשיו? דברו איתנו ישירות."}
              </p>
            </div>
            <div className="ar-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {whatsappUrl ? (
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" style={{ background: "#25D366", color: "#fff", borderRadius: 12, padding: "var(--ar-btn)", fontWeight: 800, fontSize: "var(--ar-lede)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <WhatsAppMark size={18} />
                  {en ? "Send WhatsApp" : "שלחו וואטסאפ"}
                </a>
              ) : null}
              <a href={`tel:${phone}`} style={{ background: "#fff", color: C.brandInk, borderRadius: 12, padding: "var(--ar-btn)", fontWeight: 800, fontSize: "var(--ar-lede)", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                {en ? `Call ${phone}` : `חייגו ${phone}`}
              </a>
            </div>
            </div>
            {/*
              The mark closes the block. It is the one place on this page where
              our name belongs: directly under two customers vouching for it, so
              the quotes land on somebody rather than trailing off. White on the
              navy, and decorative — the page has already said who we are.

              A sibling of the CTA row inside the same navy wrapper, not a child
              of the row. Inside it, it became a third item in a space-between
              flex and sat off to one side; in a wrapper of its own it would have
              restarted the gradient and drawn a seam.
            */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, marginTop: 20 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/white.svg" alt="" aria-hidden="true" width={116} height={40}
                   style={{ width: 116, height: "auto", opacity: 0.92 }} />
              {/*
                The line under the mark. Ours, not a customer's, so unlike the
                quotes above it this one is translated rather than shown in
                Hebrew on an English page.
              */}
              <span style={{ fontSize: "var(--ar-meta)", fontWeight: 600, color: C.onNavyDim, textAlign: "center", letterSpacing: ".01em" }}>
                {en ? "Digital presence that brings customers" : "נוכחות דיגיטלית שמביאה לקוחות"}
              </span>
            </div>
          </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

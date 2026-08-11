"use client"

import { useEffect, useState } from "react"
import type { AuditorLocale } from "@/lib/auditor/locale"
import type { StatusResponse } from "@/components/auditor/home/logic/auditor-home-types"
import { AuditorWhatHappensNext } from "@/components/auditor/home/ui/AuditorWhatHappensNext"
import { WhatsAppMark } from "@/components/auditor/home/ui/WhatsAppMark"
import { AuditorTestimonials } from "@/components/auditor/home/ui/AuditorTestimonials"
import { AuditorPlans, type AuditorPlanSlug } from "@/components/auditor/home/ui/AuditorPlans"
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
  /**
   * The scan on screen, handed to the plans section so a chosen plan can be tied
   * back to the report that sold it. Not on StatusResponse — the status route
   * does not publish the id it was queried with — so it comes from the caller.
   */
  scanId?: string | null
  /** See AuditorPlans: the plan slug and the scan it was chosen from. */
  onSelectPlan?: (plan: AuditorPlanSlug, scanId: string | null) => void
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
  /*
   * The hero band. Values are the spec's --navy0/--navy1 and its three text
   * tints; onNavyDim above is the closing block's own and stays as it is, because
   * that block and AuditorTestimonials have to agree with each other.
   */
  navy0: "#0A0F1A",
  navy1: "#0D1526",
  onNavy: "#F4F6FA",
  onNavyBandDim: "#BCD3E8",
  onNavyMute: "#8FA3BE",
  /** The one warm accent inside the band, for a count that wants attention. */
  statWarm: "#F0B65A",
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
  } as null | {
    high: { title: string; body: string }
    mid: { title: string; body: string }
    low: { title: string; body: string }
  },
} as const

/**
 * The headline in the band, one per score band.
 *
 * The Hebrew is the spec's own three strings. The English is written to read as
 * English rather than as a translation of them, the same way SCORE_BAND_COPY.en
 * was — the spec has no English at all, so there was nothing to copy.
 */
const HERO_HEADLINE = {
  he: {
    low: "האתר שלכם כמעט לא נמצא בחיפוש",
    mid: "האתר תקין. השאלה היא כמה אנשים מגיעים אליו",
    high: "האתר שלכם עשה את שלו",
  },
  en: {
    low: "Your site is barely showing up in search",
    mid: "The site works. The question is how many people reach it",
    high: "Your site has done its part",
  },
} as const

/**
 * The word for the score, next to the number.
 *
 * Values are the spec's three [background, foreground, label] triples. Each pair
 * clears 4.5:1 as measured — 4.96, 4.79 and 5.33 — so the pill is readable as
 * body text, which matters because it is the one place the score's own colour
 * still speaks now that the arc carries the spec's blue gradient instead.
 */
const GRADE = {
  low: { bg: "#FBE7E4", fg: "#B33A2C", he: "חלש", en: "Weak" },
  mid: { bg: "#FBF3E0", fg: "#8A6521", he: "סביר", en: "Fair" },
  high: { bg: "#E4F3EA", fg: "#127048", he: "מצוין", en: "Excellent" },
} as const

function GradeBadge({ total, en }: { total: number; en: boolean }) {
  const g = GRADE[scoreBand(total)]
  return (
    <span
      style={{
        marginTop: 9,
        display: "inline-block",
        fontSize: "var(--ar-caption)",
        fontWeight: 800,
        padding: "4px 12px",
        borderRadius: 999,
        background: g.bg,
        color: g.fg,
      }}
    >
      {en ? g.en : g.he}
    </span>
  )
}

/**
 * The stats strip in the hero band.
 *
 * The spec shows four boxes: open findings, criticals, pages scanned, and a
 * locked improvement potential. Three are built here. **"קריטיים" is not**, and
 * that is deliberate: /api/auditor/status publishes issues_overview as plain
 * strings and issues_count as a total, with no severity anywhere, so a critical
 * count could only be guessed. This page already refuses to do that — two of the
 * category tiles are locked rather than filled with a plausible number, for the
 * same reason — so the box is left out rather than invented. It comes back the
 * day the status route publishes severity.
 *
 * The fourth box is locked, so it needs no data: it says a figure exists behind a
 * plan, which is true, and the lock is the whole content.
 */
function HeroStats({ en, issuesCount, pages }: { en: boolean; issuesCount: number; pages: number | null }) {
  const items: Array<{ value: string; label: string; tone?: "warm" | "locked" }> = []

  if (issuesCount > 0) {
    items.push({ value: String(issuesCount), label: en ? "open findings" : "ממצאים פתוחים", tone: "warm" })
  }
  if (pages !== null && pages > 0) {
    items.push({ value: String(pages), label: en ? (pages === 1 ? "page scanned" : "pages scanned") : pages === 1 ? "עמוד נסרק" : "עמודים נסרקו" })
  }
  items.push({ value: en ? "Improvement potential" : "פוטנציאל שיפור", label: en ? "on a subscription plan" : "במסלול מנוי", tone: "locked" })

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginTop: 20 }}>
      {items.map((s) => (
        <div
          key={s.label}
          style={{
            background: "rgba(255,255,255,.06)",
            border: "1px solid rgba(255,255,255,.10)",
            borderRadius: 12,
            padding: "10px 14px",
            minWidth: 104,
          }}
        >
          <b
            style={{
              display: s.tone === "locked" ? "flex" : "block",
              alignItems: "center",
              gap: 6,
              fontSize: s.tone === "locked" ? "var(--ar-label)" : 20,
              fontWeight: 800,
              lineHeight: 1.15,
              color: s.tone === "warm" ? C.statWarm : s.tone === "locked" ? C.gold : C.onNavy,
            }}
          >
            {s.tone === "locked" ? <span style={{ fontSize: 13 }} aria-hidden="true">🔒</span> : null}
            <bdi dir="ltr">{s.value}</bdi>
          </b>
          <span style={{ fontSize: "var(--ar-meta)", color: C.onNavyMute, fontWeight: 600 }}>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

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
    /*
      Centred, heading and body together.

      The two lines are the page speaking in its own voice about the number just
      above them, not a row in a report, and they now sit alone in this panel —
      so the block is centred as one unit and the body is centred within its own
      measure rather than being ragged against a left edge.
    */
    <div style={{ background: C.surface, borderRadius: 20, padding: "var(--ar-panel-lg)", marginTop: 14, textAlign: "center" }}>
      <h3 style={{ fontSize: BAND_TYPE, fontWeight: 800, color: C.ink, marginBottom: 8 }}>{band.title}</h3>
      <p style={{ fontSize: BAND_TYPE, color: C.ink2, maxWidth: "62ch", marginInline: "auto" }}>{band.body}</p>
    </div>
  )
}

/**
 * The gold "and more — in a subscription plan" band from the mockup.
 *
 * The action is an anchor to a section on this page, not a callback. It used to
 * call onUnlock, which started checkout against a billing route that the auditor
 * block hard-404s; the plans section below is now the thing these bands are
 * asking the visitor to look at, so they scroll to it.
 */
function LockBand({ title, body, cta, href }: { title: string; body: string; cta: string; href: string }) {
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
      <a href={href} style={{ background: C.gold, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 800, fontSize: "var(--ar-meta)", cursor: "pointer", flexShrink: 0, fontFamily: "inherit", marginInlineStart: "auto", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
        {cta}
      </a>
    </div>
  )
}

export function AuditorReportV3({ locale, status, teaser = false, scanId = null, onSelectPlan, whatsappUrl, phone = "0545215193", emailCopy = false }: Props) {
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

  /*
   * The gauge draws itself once, on mount.
   *
   * The target offset depends on the score, so this cannot be a keyframe. The arc
   * renders empty on the first paint and the real offset is set on the next frame;
   * .ar-gauge-arc supplies the transition between the two, and drops it under
   * prefers-reduced-motion. requestAnimationFrame rather than a timeout so the
   * empty state is committed before the value changes — set in the same frame, the
   * browser coalesces both and there is nothing to animate from.
   */
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const dash = 326.7
  const offset = total === null ? dash : dash * (1 - Math.max(0, Math.min(100, total)) / 100)
  /*
   * No gaugeTone any more: the arc takes the spec's blue gradient, so the score's
   * colour is not read off it. toneFor still serves the category meters and
   * figures, and the score's own colour now lives in the grade pill.
   */

  return (
    /*
      Vertical padding on the root, horizontal on each container.

      The hero is a full-bleed band now, and it cannot bleed past padding on its
      own ancestor. So the root keeps --ar-page-top / --ar-page-bottom and the
      side gutter moves to the containers, which is why there are three of them
      below: masthead, then the band, then the rest of the report. All three sit
      on the same 1040 measure, so nothing shifts horizontally.
    */
    <div className={AUDITOR_SCOPE} dir={en ? "ltr" : "rtl"} style={{ background: "#fff", color: C.ink, paddingTop: "var(--ar-page-top)", paddingBottom: "var(--ar-page-bottom)", fontFamily: "'Assistant',system-ui,Arial,sans-serif" }}>
      <AuditorScaleStyles />
      <div style={{ maxWidth: 1040, margin: "0 auto", paddingInline: "var(--ar-gutter)" }}>
        {/*
          The masthead. It used to be one unstyled line of bold text with a dot
          and a hostname, sitting under a block of empty page — the only part of
          the report that looked like it had been forgotten.

          Now a labelled strip: a small brand-coloured eyebrow saying what this
          document is, and the hostname under it at heading weight, which is the
          thing the visitor actually wants confirmed. Hairline under it so the
          head of the page has an edge to sit on.
        */}
        {/*
          The top bar, per the spec: one 62px row, white, hairline under it —
          mark, then what this document is, then the hostname pushed to the far
          end. It was a two-row block with the host stacked under an eyebrow.

          The mark is set as type rather than fetched as an asset. This is a light
          bar, so the white SVG the navy closing block uses cannot serve here, and
          two spans need no request and no second colourway.
        */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, minHeight: 62, marginBottom: 14, borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: ".2px", color: C.ink }} dir="ltr">
            UX<span style={{ color: C.brand }}>ellent</span>
          </span>
          <span style={{ fontSize: "var(--ar-caption)", fontWeight: 800, color: C.brandInk, background: "#EDF3F9", padding: "4px 11px", borderRadius: 999 }}>
            {en ? "Ranking report" : "דוח דירוג"}
          </span>
          {!teaser && host ? (
            <span style={{ marginInlineStart: "auto", fontSize: "var(--ar-label)", color: C.muted, fontWeight: 600, wordBreak: "break-word" }} dir="ltr">
              {host}
            </span>
          ) : null}
        </div>

      </div>

      {/*
        The hero, as a full-bleed dark band.

        It was a light panel on the same surface fill as every other block, inside
        the 1040 measure — so the head of the report carried no more weight than a
        findings card. The band is the shape the design asks for: the score is the
        one thing on this page that should stop somebody, and a dark field running
        edge to edge is what makes it read that way.

        The gauge keeps its semantic colour rather than the spec's blue gradient.
        Measured against both navy stops, the three tones clear the 3:1 that WCAG
        1.4.11 asks of a graphical object with room to spare — red 4.88, green
        5.32, amber 6.13 at the worst stop — and a red ring at 40 sells the
        problem in a way a blue one cannot.
      */}
      <div
        style={{
          background:
            "radial-gradient(900px 420px at 78% 8%, rgba(83,137,187,.20), transparent 60%)," +
            "radial-gradient(700px 500px at 18% 85%, rgba(83,137,187,.10), transparent 60%)," +
            `linear-gradient(${C.navy0} 0%, ${C.navy1} 100%)`,
          color: C.onNavy,
          marginBottom: 14,
        }}
      >
        <div style={{ maxWidth: 1040, margin: "0 auto", paddingInline: "var(--ar-gutter)", paddingBlock: "var(--ar-panel-lg)", display: "flex", alignItems: "center", gap: 38, flexWrap: "wrap" }}>
          {/*
            Gauge first in the DOM, so in RTL it sits on the right — the order the
            spec's `grid-template-columns: auto 1fr` produces. It was text-first,
            which put the dial on the wrong side of the band.
          */}
          <div style={{ flexShrink: 0, width: 222, height: 222, position: "relative", display: "grid", placeItems: "center" }}>
            <svg viewBox="0 0 120 120" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
              <defs>
                <linearGradient id="ar-gauge-gr" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#7FB0DC" />
                  <stop offset="100%" stopColor="#3A6D9A" />
                </linearGradient>
              </defs>
              {/* Track is a wash of the band's own light, not the light-page #E4E9F3. */}
              <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="10" />
              {/*
                The spec's blue gradient, replacing the score-coloured arc. Both
                stops clear WCAG 1.4.11's 3:1 for a graphical object against the
                band — #7FB0DC at 7.94 and #3A6D9A at 3.33 against the darker navy
                stop — so nothing here is unreadable, and the score's own colour
                still speaks through the grade pill below the number.

                strokeDashoffset starts at `dash` (an empty ring) and moves to the
                real offset once mounted; .ar-gauge-arc carries the transition that
                turns that into a sweep, and honours prefers-reduced-motion.
              */}
              <circle
                className="ar-gauge-arc"
                cx="60" cy="60" r="52" fill="none"
                stroke={teaser ? "rgba(255,255,255,.18)" : "url(#ar-gauge-gr)"}
                strokeWidth="10" strokeLinecap="round"
                strokeDasharray={dash}
                strokeDashoffset={teaser ? dash * 0.45 : drawn ? offset : dash}
              />
            </svg>
            <div style={{ textAlign: "center", position: "relative", zIndex: 2 }}>
              {teaser ? (
                <div style={{ height: 38, width: 62, borderRadius: 8, background: "rgba(255,255,255,.14)" }} />
              ) : (
                <div style={{ fontSize: 58, fontWeight: 800, lineHeight: 1, letterSpacing: "-1px", color: C.onNavy }}>{total === null ? "—" : total}</div>
              )}
              <div style={{ fontSize: "var(--ar-meta)", color: C.onNavyMute, fontWeight: 600, marginTop: 2 }}>{en ? "out of 100" : "מתוך 100"}</div>
              {!teaser && total !== null ? <GradeBadge total={total} en={en} /> : null}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--ar-label)", fontWeight: 800, letterSpacing: ".06em", color: C.brand, marginBottom: 10 }}>
              <span className="ar-pulse" aria-hidden="true" />
              {en ? "Search & AI readiness" : "מוכנות לחיפוש ולמנועי AI"}
            </div>
            {/*
              The headline reads the score rather than announcing itself. It was
              the fixed "הציון הנוכחי של האתר שלך", which named the page instead of
              telling the visitor anything; the three band headlines are the spec's
              own strings.
            */}
            <h1 style={{ fontSize: "var(--ar-h1)", fontWeight: 800, marginBottom: 10, color: C.onNavy, lineHeight: 1.2 }}>
              {teaser || total === null
                ? en ? "Your site's current score" : "הציון הנוכחי של האתר שלך"
                : HERO_HEADLINE[en ? "en" : "he"][scoreBand(total)]}
            </h1>
            <p style={{ color: C.onNavyDim, fontSize: "var(--ar-lede)", maxWidth: "54ch" }}>
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
            {!teaser ? <HeroStats en={en} issuesCount={issuesCount} pages={pages} /> : null}
            {/*
              One button, and only one.

              The spec styles a .hero-cta row with four .btn variants but never
              uses the class in its hero, so there was nothing to copy — the label
              and the destination are Itzik's. The gold variant is the primary on a
              dark band, and it is the right one here for a reason beyond looks:
              gold on this page already means "behind a plan" (it is the LockBand
              fill), and this button goes to the plans. #231A05 on the gradient
              measures 7.81 and 5.20 against its two stops.

              No secondary button. The spec's pairing would send one to a contact
              or lead anchor, and this report has none: the lead form is a separate
              step the visitor has already passed by the time any of this renders,
              and the only id in the component is the gauge's gradient. Rather than
              mint an anchor to satisfy a button, there is one button.
            */}
            {!teaser ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 22 }}>
                <a
                  href="#plans"
                  style={{
                    border: 0,
                    borderRadius: 12,
                    padding: "14px 24px",
                    fontFamily: "inherit",
                    fontWeight: 800,
                    fontSize: "var(--ar-prose)",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    background: "linear-gradient(180deg,#D9A73C,#B0872F)",
                    color: "#231A05",
                  }}
                >
                  {en ? "See the plans" : "לראות את המסלולים"}
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1040, margin: "0 auto", paddingInline: "var(--ar-gutter)" }}>
        {/*
          Moved below the band. It used to sit between the masthead and the hero,
          which put a block about what happens next ahead of the number it is a
          reaction to.
        */}
        {!teaser ? <AuditorWhatHappensNext locale={locale} whatsappUrl={whatsappUrl} emailCopy={emailCopy} /> : null}

        {/*
          Directly under the gauge, because it is the reading of that number.

          It used to sit just above the closing contact block, on the argument
          that the reading and the invitation to act on it are one beat. In
          practice that put four paragraphs about the score at the far end of
          the page, after every finding and category, where the visitor has
          already formed their own view of it. Under the panel it comments on,
          it lands while the number is still on screen — and the closing block
          keeps its own job of asking for the conversation.

          Gated on a real number: the teaser has no score by design, and a scan
          that ended without one never reaches this component.
        */}
        {!teaser && total !== null ? <ScoreBandCopy locale={locale} total={total} /> : null}

        {/* experts banner */}
        {/*
          The same surface fill as the score panel above it, which is what it
          should have been all along. It once carried a blue wash that made it
          the loudest thing on a page whose subject is the score, so it read as
          the headline rather than the aside it is. The blue it needs is in the
          badge.
        */}
        {/*
          Centred: the mark and the heading on one line, the sub-line under it.

          It was a left-aligned two-column row — mark in the first column, five
          lines of text in the second. Centring the text inside that second
          column would have centred it against the column rather than against the
          banner, leaving it visibly off by the width of the mark and its gap. So
          the banner is a centred column instead, and the mark moves onto the
          heading's own line, which is also where it already claimed to be.
        */}
        <div style={{ background: C.surface, borderRadius: 18, padding: "var(--ar-panel)", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 11, flexWrap: "wrap" }}>
            {/*
              A rising line instead of a 46px filled tile with a ✦ in it. The tile
              was the widest thing in the banner and said nothing; the chart says
              what the sentence beside it promises. The line draws itself once on
              mount and then holds — motion that reports, rather than loops.

              No marginTop now: it was offsetting the mark down to meet the first
              line of a heading in a flex-start row. On a centred row alignItems
              does that, and the old calc would push it below the text.
            */}
            <div style={{ flexShrink: 0, width: 26, height: 26, color: C.brand }} aria-hidden="true">
              <svg viewBox="0 0 34 34" width="26" height="26" fill="none">
                <path d="M3 27 L12 18 L19 22 L31 8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
                      style={{ strokeDasharray: 46, strokeDashoffset: 0, animation: "ar-draw .9s ease-out both" }} />
                <path d="M24 8 H31 V15" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
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
          </div>
          <p style={{ fontSize: "var(--ar-prose)", color: C.ink2, marginTop: 2, maxWidth: "62ch" }}>
            {en
              ? "Our specialists do the groundwork that gets you there: links to your site, articles and more. It starts the moment you give us the go-ahead."
              : "המומחים שלנו עושים את העבודה היסודית שמביאה לזה: קישורים לאתר, מאמרים ועוד. מתחילים ברגע שתאשרו."}
          </p>
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
            {/*
              The promise is kept by the expert with their own tools, not by this
              scanner. Said that way, it is also true — the full-site pass is
              manual work in the monthly report, which is why a missing
              AUDITOR_SERPER_API_KEY does not block any of this.
            */}
            {en ? "On our subscription plans an expert reviews the whole site ↗" : "במסלולי המנוי המומחה שלנו עובר על האתר המלא ↗"}
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
                      {en ? "Opens on a subscription plan" : "נפתח במסלול מנוי"}
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
                title={en ? `${issuesCount - 2} more findings in a subscription` : `ועוד ${issuesCount - 2} ממצאים במסלול מנוי`}
                body={en ? "Our experts will find and fix all of them for you." : "המומחים שלנו יזהו ויטפלו בכל הממצאים עבורך."}
                cta={en ? "Unlock access" : "פתחו גישה"}
                href="#plans"
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
                title={en ? "More categories in a subscription" : "ועוד קטגוריות במסלול מנוי"}
                body={en ? "Exactly where you lose traffic, and what we close first." : "בדיוק איפה אתה מפסיד תנועה, ומה נסגור קודם."}
                cta={en ? "Unlock access" : "פתחו גישה"}
                href="#plans"
              />
            ) : null}
          </Card>
        </div>

        {/*
          The subscription section.

          It sits after the last measurement and before the closing block, which
          is the position the work order describes — "between the keyword section
          and the customers section" — mapped onto the page as it actually is.
          Neither of those two sections exists in this component: the keyword
          strip and the competitor card are in the v5 spec only, and the customer
          case studies are not in the report at all. What is real here is the
          seam between the findings and the closing testimonials, and the offer
          belongs in it: after the visitor has seen what is wrong, before we
          close.

          Not in the teaser, for the same reason the closing block is not: the
          teaser is a shape glimpsed behind a form, and a blurred price list is
          noise there.
        */}
        {!teaser ? <AuditorPlans locale={locale} scanId={scanId} onSelectPlan={onSelectPlan} /> : null}

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

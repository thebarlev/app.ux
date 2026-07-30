"use client"

import type { AuditorLocale } from "@/lib/auditor/locale"
import type { StatusResponse } from "@/components/auditor/home/logic/auditor-home-types"
import { AuditorWhatHappensNext } from "@/components/auditor/home/ui/AuditorWhatHappensNext"
import { WhatsAppMark } from "@/components/auditor/home/ui/WhatsAppMark"
import { AuditorTestimonials } from "@/components/auditor/home/ui/AuditorTestimonials"

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
} as const

function toneFor(v: number | null): { text: string; fill: string } {
  if (v === null) return { text: C.muted, fill: C.slate }
  if (v >= 75) return { text: C.green, fill: C.green }
  if (v >= 50) return { text: C.amber, fill: C.amber }
  return { text: C.red, fill: C.red }
}

/** A number in the report, or an anonymous block in the teaser. */
function Val({ v, teaser, size = 30 }: { v: number | null; teaser: boolean; size?: number }) {
  if (teaser) return <div style={{ height: size * 0.9, width: size * 1.7, borderRadius: 8, background: "#0000001a" }} />
  const tone = toneFor(v)
  return (
    <div style={{ fontSize: size, fontWeight: 800, lineHeight: 1.1, color: tone.text }}>{v === null ? "—" : v}</div>
  )
}

function Meter({ v, teaser }: { v: number | null; teaser: boolean }) {
  const pct = teaser ? 60 : v === null ? 0 : Math.max(0, Math.min(100, v))
  const tone = toneFor(teaser ? null : v)
  return (
    <div style={{ height: 7, background: C.track, borderRadius: 99, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", insetInlineEnd: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 99, background: teaser ? "#00000022" : tone.fill }} />
    </div>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.surface, borderRadius: 18, padding: "22px 24px", ...style }}>
      {children}
    </div>
  )
}

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "0 4px 12px" }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, color: C.ink }}>{title}</h2>
      {hint ? <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>{hint}</span> : null}
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
        <b style={{ fontSize: 14, color: C.ink }}>{title}</b>
        <p style={{ fontSize: 12.5, color: C.ink2, marginTop: 1 }}>{body}</p>
      </div>
      <button type="button" onClick={onUnlock} style={{ background: C.gold, color: "#fff", border: "none", borderRadius: 10, padding: "9px 15px", fontWeight: 800, fontSize: 12.5, cursor: "pointer", flexShrink: 0, fontFamily: "inherit", marginInlineStart: "auto" }}>
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
    <div dir={en ? "ltr" : "rtl"} style={{ background: "#fff", color: C.ink, padding: "22px 16px 40px", fontFamily: "'Assistant',system-ui,Arial,sans-serif" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>
            {en ? "Ranking report" : "דוח דירוג"} · <span style={{ color: C.brandInk }}>{teaser ? "" : host}</span>
          </div>
        </div>

        {!teaser ? <AuditorWhatHappensNext locale={locale} whatsappUrl={whatsappUrl} emailCopy={emailCopy} /> : null}

        {/* hero */}
        <div style={{ background: C.surface, borderRadius: 20, padding: "26px 30px", display: "flex", alignItems: "center", gap: 28, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.brandInk, marginBottom: 6 }}>
              {en ? "Search & AI readiness" : "מוכנות לחיפוש ול-AI"}
            </div>
            <h1 style={{ fontSize: 23, fontWeight: 800, marginBottom: 8 }}>
              {en ? "Your site's current score" : "הציון הנוכחי של האתר שלך"}
            </h1>
            <p style={{ color: C.ink2, fontSize: 14.5, maxWidth: "52ch" }}>
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
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 14, background: C.amberBg, color: C.amber, fontWeight: 700, fontSize: 13, padding: "6px 13px", borderRadius: 999 }}>
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
                <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{total === null ? "—" : total}</div>
              )}
              <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginTop: 2 }}>{en ? "out of 100" : "מתוך 100"}</div>
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
        <div style={{ background: C.surface, borderRadius: 18, padding: "18px 24px", display: "flex", alignItems: "center", gap: 18, marginBottom: 12 }}>
          <div style={{ flexShrink: 0, width: 46, height: 46, borderRadius: 13, background: C.brand, display: "grid", placeItems: "center", color: "#fff", fontSize: 22, boxShadow: "0 4px 12px rgba(83,137,187,.35)" }}>✦</div>
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
            <b style={{ fontSize: 16, fontWeight: 800 }}>
              {en ? "We're ready to start on your site" : "אנחנו מוכנים להתחיל לעבוד על האתר שלך"}
            </b>
            <p style={{ fontSize: 13.5, color: C.ink2, marginTop: 2 }}>
              {en
                ? "We scan, spot and fix, and you watch the ranking climb without doing any of it yourself. It starts the moment you give us the go-ahead."
                : "אנחנו סורקים, מזהים ומתקנים, ואתם רואים את הדירוג מטפס בלי לעשות כלום. מתחילים ברגע שתאשרו."}
            </p>
          </div>
        </div>

        {/*
          Legitimacy strip. One line of prose, so it is set as one line of prose
          rather than as a third panel: no fill, no edge, just space around it.
          Panelling a single sentence was most of what made this page feel closed
          in.
        */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "4px 6px", margin: "2px 0 24px", fontSize: 13, color: C.ink2, flexWrap: "wrap" }}>
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
          <span style={{ color: C.gold, fontWeight: 700 }}>
            {en ? "Premium customers get a deep scan across dozens of pages ↗" : "לקוחות פרימיום מקבלים סריקה עמוקה בעשרות עמודים ↗"}
          </span>
        </div>

        {/* category tiles */}
        <SectionHead title={en ? "Score by category" : "ציון לפי קטגוריה"} hint={en ? "0–100 · higher is better" : "0–100 · ככל שגבוה יותר, טוב יותר"} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 24 }}>
          {TILES.map((t) => (
            <div key={t.label} style={{ background: t.locked && !teaser ? C.goldBg : C.surface, borderRadius: 15, padding: "15px 16px" }}>
              <div style={{ fontSize: 13, color: C.ink2, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                {t.label}
                {t.locked && !teaser ? <span style={{ fontSize: 11 }}>🔒</span> : null}
              </div>
              {t.locked && !teaser ? (
                <>
                  <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.1, margin: "10px 0 11px", color: C.gold }}>
                    {en ? "Premium" : "בפרימיום"}
                  </div>
                  <Meter v={null} teaser={false} />
                </>
              ) : (
                <>
                  <div style={{ margin: "4px 0 9px" }}>
                    <Val v={t.value} teaser={teaser} />
                  </div>
                  <Meter v={t.value} teaser={teaser} />
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
                  <div style={{ width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", fontWeight: 800, flexShrink: 0, fontSize: 13, background: "#FCEDEB", color: C.red }}>!</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{text}</div>
                </div>
              ))
            ) : (
              <p style={{ fontSize: 13.5, color: C.muted, padding: "8px 0" }}>
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
                <span style={{ width: 92, fontSize: 13, fontWeight: 700, color: C.ink2, flexShrink: 0 }}>{t.label}</span>
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
          Social proof, between the findings and the ask. Not in the teaser: the
          teaser is a shape to glimpse behind a form, and two paragraphs of real
          customer prose blurred out is noise there.
        */}
        {!teaser ? <AuditorTestimonials locale={locale} /> : null}

        {/*
          CTA. The visitor has already left their details by the time this shows.

          It is the one dark block on the page and the only place colour is used
          to close something rather than to group it, so it is set deeper than
          the mid-blue it used to carry and the body copy is full white rather
          than the pale blue tint. On a page that is now white throughout, a
          washed-out paragraph inside the single dark band read as the weakest
          text on the screen while sitting in the loudest place on it.
        */}
        {!teaser ? (
          <div style={{ background: "linear-gradient(135deg,#1B3453,#2C577F)", borderRadius: 20, padding: "26px 30px", color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap", marginTop: 16 }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
                {en ? "We got your details ✓" : "קיבלנו את הפרטים שלך ✓"}
              </h3>
              <p style={{ fontSize: 14.5, color: "#fff", maxWidth: "48ch" }}>
                {en ? "We'll be in touch shortly. Want to move faster? Talk to us directly." : "נציג שלנו יחזור אליך בהקדם. רוצה להתקדם כבר עכשיו? דברו איתנו ישירות."}
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {whatsappUrl ? (
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" style={{ background: "#25D366", color: "#fff", borderRadius: 12, padding: "13px 20px", fontWeight: 800, fontSize: 14.5, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <WhatsAppMark size={18} />
                  {en ? "Send WhatsApp" : "שלחו וואטסאפ"}
                </a>
              ) : null}
              <a href={`tel:${phone}`} style={{ background: "#fff", color: C.brandInk, borderRadius: 12, padding: "13px 20px", fontWeight: 800, fontSize: 14.5, textDecoration: "none" }}>
                {en ? `Call ${phone}` : `חייגו ${phone}`}
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

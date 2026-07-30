import type { AuditorLocale } from "@/lib/auditor/locale"

/**
 * Two customer testimonials on the report, between the findings and the closing
 * CTA: the visitor has just been told what is wrong with their site and is about
 * to be asked to talk to us, which is the one place on the page where somebody
 * else's opinion of us is worth more than another sentence from us.
 *
 * Every word here is copied from the marketing site (thebarlev/ux), not written
 * for this page. Two reasons. The Google review is a quotation, and its source
 * file says so in as many words: "Real Google review, quoted exactly as the
 * customer wrote it. The brief (§1) forbids editing the wording or the
 * punctuation." And an invented testimonial is a lie about a named person, which
 * is a different kind of wrong from a clumsy headline.
 *
 * That also exempts these strings from the report's no-em-dash wording rule.
 * Nothing in them is ours to smooth out — the hyphen in the middle of the Hulda
 * quote is how the customer typed it.
 *
 * Sources:
 *   ux/src/app/_components/new-home/homeSections.constants.ts  → DAN_REVIEW
 *   ux/src/app/_components/home/home.constants.ts              → TESTIMONIALS[0]
 *   ux/src/app/en/_components/home/homeEn.constants.ts         → TESTIMONIALS_EN[0]
 *
 * The Google review runs in Hebrew only. The marketing site has an approved
 * English translation of the Hulda testimonial and none for the review, and
 * translating a quotation would be writing it — so on /en Hulda appears alone
 * rather than beside a Hebrew paragraph or an invented rendering of it.
 */

const C = {
  ink: "#1C2A46",
  ink2: "#3A465F",
  muted: "#8A93A6",
  gold: "#E0A32B",
  /**
   * One continuous navy, the same one the CTA below carries, so the closing
   * block is a single colour from the first quote to the mark at the foot.
   *
   * The quotes used to sit on white cards inside a pale band. That drew a card
   * per person inside a section inside a block, which is the nesting this page
   * spent two rounds removing, and it broke the run of colour at exactly the
   * point where the argument should carry through: what they say about us, then
   * us. A hairline between quotes does the separating a card was doing.
   */
  onNavy: "#FFFFFF",
  onNavyDim: "#C4D3E6",
  navyRule: "rgba(255,255,255,.16)",
} as const

type Testimonial = {
  quote: string
  name: string
  source: string
  imageSrc: string
  imageAlt: string
  /** Filled stars, when the source published a rating. */
  stars?: number
}

const DAN: Testimonial = {
  quote: '"שירות מקצועי ויעיל!! תוצאות מעל ומעבר למצופה.. מומלץ בחום!!"',
  name: "דן עראמי",
  source: "ביקורת בגוגל",
  imageSrc: "/reviews/dan-arami.png",
  imageAlt: "דן עראמי, ביקורת בגוגל על Uxellent",
  stars: 5,
}

const HULDA_HE: Testimonial = {
  quote:
    '"עברנו מתחושת בטן לנתונים אמיתיים. Uxellent העניקה לנו בהירות מלאה על מצב העסק - תובנות שהפתיעו אותנו פעם אחר פעם וחשפו הזדמנויות שהיו תמיד שם. התוצאות: יותר מכירות, יותר לקוחות ושליטה אמיתית בעסק."',
  name: "שנאי חולדה",
  source: "לקוח Uxellent",
  imageSrc: "/testimonials/shanai-hulda.webp",
  imageAlt: "שנאי חולדה, לקוח Uxellent",
}

const HULDA_EN: Testimonial = {
  quote:
    '"We moved from gut feeling to real data. Uxellent gave us full clarity on the business - insights that surprised us again and again and revealed opportunities that were always there. Results: more sales, more customers, real control."',
  name: "Hulda Transformer",
  source: "Uxellent client",
  imageSrc: "/testimonials/shanai-hulda.webp",
  imageAlt: "Hulda Transformer, Uxellent client",
}

function Stars({ n }: { n: number }) {
  return (
    <span style={{ color: C.gold, fontSize: "var(--ar-label)", letterSpacing: 2 }} aria-label={`${n}/5`}>
      {"★".repeat(n)}
    </span>
  )
}

/**
 * One quote, as a centred column: face, then name, then the words.
 *
 * The face used to sit beside the name with the quote ranged under both. Centred
 * puts the person at the top of their own testimonial and lets the quote read as
 * theirs rather than as a paragraph with an avatar attached, which is what the
 * side-by-side row had become once the cards came off.
 */
function Quote({ t, first }: { t: Testimonial; first: boolean }) {
  return (
    <figure style={{ margin: 0, padding: "var(--ar-panel)", textAlign: "center", position: "relative" }}>
      {/*
        A short centred rule, not a full-width border. A rule that runs edge to
        edge cuts the block in two; this one separates two quotes inside one
        block, which is a smaller job and wants a smaller mark.
      */}
      {first ? null : (
        <span aria-hidden="true" style={{
          position: "absolute", insetInlineStart: "50%", transform: "translateX(50%)",
          top: 0, width: 64, height: 1, background: C.navyRule,
        }} />
      )}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginBottom: 12 }}>
        {/*
          A plain <img>. next/image wants width and height or a fill parent, and
          these are two fixed 44px avatars — the optimiser buys nothing here.

          Not lazy. Measured on the preview: at 1440 both avatars had decoded
          (naturalWidth 144 and 64), and at 390 and 360 both were still at 0 and
          came out blank in a full-page capture, because on a phone this section
          sits about 5900px down a 7376px page. Whether a given scroll would have
          triggered them is exactly the thing not worth depending on: these are
          two files of 30KB and 2KB whose whole job is that a stranger's face is
          next to their words, and a testimonial that arrives without one is worse
          than the bytes it saved.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={t.imageSrc}
          alt={t.imageAlt}
          width={44}
          height={44}
          decoding="async"
          style={{ width: 62, height: 62, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: `2px solid ${C.navyRule}` }}
        />
        <div>
          <div style={{ fontSize: "var(--ar-prose)", fontWeight: 800, color: C.onNavy }}>{t.name}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 8, marginTop: 4, textAlign: "center" }}>
            <span style={{ fontSize: "var(--ar-meta)", color: C.onNavyDim, fontWeight: 600 }}>{t.source}</span>
            {t.stars ? <Stars n={t.stars} /> : null}
          </div>
        </div>
      </div>
      <blockquote style={{ margin: 0, fontSize: "var(--ar-prose)", lineHeight: 1.6, color: C.onNavyDim }}>{t.quote}</blockquote>
    </figure>
  )
}

export function AuditorTestimonials({ locale }: { locale: AuditorLocale }) {
  const en = locale === "en"
  const items = en ? [HULDA_EN] : [DAN, HULDA_HE]

  return (
    <div
      style={{
        // No background, no margin, no radius. This is the top of the closing
        // block in AuditorReportV3, which now carries one navy across the whole
        // thing and clips it with a single radius — see the note there.
        // --ar-panel-lg is a two-value shorthand, so it cannot be fed to calc()
        // or used as one side of a three-value padding. Shorthand first for both
        // axes, then the two longhands that need to differ.
        padding: "var(--ar-panel-lg)",
        paddingTop: "var(--ar-testi-top)",
        paddingBottom: 0,
      }}
    >
      <h2 style={{ fontSize: "var(--ar-h2)", fontWeight: 800, color: C.onNavy, textAlign: "center", margin: "0 0 14px" }}>
        {en ? "What our customers say" : "מה הלקוחות שלנו אומרים"}
      </h2>
      <div>
        {items.map((t, i) => (
          <Quote key={t.name} t={t} first={i === 0} />
        ))}
      </div>
    </div>
  )
}

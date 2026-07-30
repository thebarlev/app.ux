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
  surface: "#F6F8FC",
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
    <span style={{ color: C.gold, fontSize: 13, letterSpacing: 1 }} aria-label={`${n}/5`}>
      {"★".repeat(n)}
    </span>
  )
}

function Quote({ t }: { t: Testimonial }) {
  return (
    <figure style={{ background: C.surface, borderRadius: 18, padding: "22px 24px", margin: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        {/*
          A plain <img>. next/image wants width and height or a fill parent, and
          these are two fixed 44px avatars in a component that is also rendered
          inside the blurred teaser — the optimiser buys nothing here and the
          teaser would pay for it twice.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={t.imageSrc}
          alt={t.imageAlt}
          width={44}
          height={44}
          loading="lazy"
          style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>{t.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 1 }}>
            <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>{t.source}</span>
            {t.stars ? <Stars n={t.stars} /> : null}
          </div>
        </div>
      </div>
      <blockquote style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: C.ink2 }}>{t.quote}</blockquote>
    </figure>
  )
}

export function AuditorTestimonials({ locale }: { locale: AuditorLocale }) {
  const en = locale === "en"
  const items = en ? [HULDA_EN] : [DAN, HULDA_HE]

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "0 4px 12px" }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: C.ink }}>
          {en ? "What our customers say" : "מה הלקוחות שלנו אומרים"}
        </h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
        {items.map((t) => (
          <Quote key={t.name} t={t} />
        ))}
      </div>
    </div>
  )
}

/**
 * The subscription section on the scan-results page.
 *
 * Source of truth for the design is docs/scan-results-v5-with-plans.html. The
 * markup there is converted to a component here; the stylesheet is carried over
 * verbatim, for a reason worth stating because it looks like duplication.
 *
 * Why its own token layer instead of the page scale.
 *
 * The report around it runs on --ar-*, whose scale is INVERTED against the usual
 * direction: small on a desktop, larger on a phone (see auditor-scale.tsx — the
 * phone floors exist because nothing a visitor reads should fall under 18px).
 * That is right for a dense report of measurements. It is wrong for a price
 * list, which needs a 58px number and a 42px display line on a desktop and has
 * one job per card rather than twenty figures per screen. Reusing --ar-* would
 * have meant overriding almost every size at the larger breakpoint, so the
 * section carries a self-contained --pl-* layer instead. Every token and class
 * here is --pl- / .pl- prefixed and declared on .pl, so nothing reaches the rest
 * of the page and nothing on the page reaches in.
 *
 * The three plan slugs are the identifiers the signup flow will read. They are
 * not rows in auditor_plans yet — the new rows land in stage 2 — so this section
 * hands the slug and the scan id to its caller and takes no view on how they are
 * redeemed. The old basic/pro/premium rows are unrelated and stay untouched;
 * 14 historical charges point at them.
 *
 * Hebrew only, deliberately. The spec has no English copy, and customer-facing
 * copy is not ours to invent — an English page renders no section rather than a
 * machine-translated price list.
 */
"use client"

import type { AuditorLocale } from "@/lib/auditor/locale"

/** The slugs stage 2 will create in auditor_plans, and stage 3 will charge. */
export type AuditorPlanSlug = "links_basic" | "links_plus" | "links_full"

type Props = {
  locale: AuditorLocale
  /**
   * The scan this visitor is looking at. Travels with the chosen plan so the
   * signup flow can tie the subscription to the report that sold it. Null when
   * the report renders without one.
   */
  scanId?: string | null
  /**
   * Called with the chosen plan and the scan it came from. Deliberately a
   * callback and not an href: /auditor/checkout is hard-404'd by the auditor
   * block, so there is no destination to link to yet, and a dead link is worse
   * than a handler the caller can wire when stage 3 lands.
   */
  onSelectPlan?: (plan: AuditorPlanSlug, scanId: string | null) => void
}

/** Two links, joined — the chain in "a link from another site". */
function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </svg>
  )
}

/** A speech bubble — the human on the other end. */
function TalkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 20.5l1.5-4.9A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z" />
    </svg>
  )
}

/** Two figures, one behind the other — the assigned expert. */
function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 20v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.4A3.4 3.4 0 0 0 3 18.4V20" />
      <circle cx="9.5" cy="7.5" r="3.5" />
      <path d="M17 4.2a3.5 3.5 0 0 1 0 6.6" />
      <path d="M21 20v-1.6a3.4 3.4 0 0 0-2.6-3.3" />
    </svg>
  )
}

type Plan = {
  slug: AuditorPlanSlug
  name: string
  price: string
  vat: string
  /** The link cadence: the headline promise of every plan. */
  linkTitle: string
  linkNote: string
  /** The human: what "an expert is available" actually means at this price. */
  expertTitle: string
  expertNote: string
  /** "Also included" under the two rows, or the absence of it on the entry plan. */
  extraLabel: string
  extraBody: string
  /** The middle card is raised, flagged, and takes the filled button. */
  top?: boolean
}

/**
 * Prices are the pre-VAT figure with the VAT-inclusive one under it, which is
 * how the table in the work order states them. They are display copy here; the
 * price a subscription is actually charged is snapshotted onto the charge record
 * at signup, so an edit to this file can never restate what someone was billed.
 */
const PLANS: Plan[] = [
  {
    slug: "links_basic",
    name: "בסיסי",
    price: "97",
    vat: "114 ₪ כולל מע״מ",
    linkTitle: "קישור כל 6 חודשים",
    linkNote: "שני קישורים בשנה",
    expertTitle: "מומחה במייל",
    expertNote: "שאלה בחודש, תשובה תוך יומיים",
    extraLabel: "תוספות",
    extraBody: "ללא",
  },
  {
    slug: "links_plus",
    name: "מורחב",
    price: "250",
    vat: "295 ₪ כולל מע״מ",
    linkTitle: "קישור כל 3 חודשים",
    linkNote: "ארבעה קישורים בשנה",
    expertTitle: "מומחה זמין, בלי הגבלת שאלות",
    expertNote: "תשובה תוך יום עסקים · שיחת ייעוץ ברבעון",
    extraLabel: "ובנוסף",
    extraBody: "הטקסט מגיע מוכן להעתקה: כותרות, תיאורים, שאלות ותשובות",
    top: true,
  },
  {
    slug: "links_full",
    name: "מלא",
    price: "500",
    vat: "590 ₪ כולל מע״מ",
    linkTitle: "קישור כל חודש",
    linkNote: "שנים עשר קישורים בשנה",
    expertTitle: "מומחה צמוד בוואטסאפ",
    expertNote: "מענה באותו יום · שיחת ייעוץ בכל חודש",
    extraLabel: "ובנוסף",
    extraBody: "הטקסט מוכן להעתקה, ותוכנית משפך לידים",
  },
]

/** What every plan carries, whatever the price. */
const INCLUDED: Array<{ title: string; note: string }> = [
  { title: "צ'קליסט 37 סעיפים", note: "נבדק באתר שלכם מחדש בכל חודש" },
  { title: "שלוש משימות לחודש", note: "מה לעשות, איפה, ובאיזה סדר" },
  { title: "דיווח ביטויים חדשים", note: "על מה התחילו למצוא אתכם" },
  { title: "הקישורים שקיבלתם", note: "עם הכתובת המדויקת, ללחיצה" },
  { title: "בלי התחייבות", note: "ביטול או שינוי מסלול בכל חודש" },
  { title: "חשבונית מס קבלה", note: "נשלחת אוטומטית בכל חיוב" },
]

/** The 37 items, grouped, behind a disclosure so the section stays scannable. */
const CHECKLIST_GROUPS: Array<{ title: string; body: string }> = [
  {
    title: "יסודות טכניים",
    body: "מהירות במובייל, גרסה אחת באוויר, HTTPS, מפת אתר, robots, קישורים שבורים, תצוגה בטלפון, עמוד מקורי",
  },
  {
    title: "מה שגוגל קורא",
    body: "כותרות ייחודיות, תיאורים, כפילויות, כותרת ראשית, תיאורי תמונות, כתובות קריאות",
  },
  {
    title: "עמודים שחייבים להיות",
    body: "עמוד לכל שירות, עמוד לכל אזור, מחירים, שאלות נפוצות, מי אנחנו",
  },
  {
    title: "שגוגל יזהה עסק אמיתי",
    body: "פרופיל גוגל מאומת, קטגוריה, תמונות, כתובת וטלפון זהים, שעות, סימון עסק מקומי, ביקורות ומענה, שם אחיד ברשת",
  },
  {
    title: "הפניות מבחוץ",
    body: "אינדקסים בענף, קישור מספק, קישור מאיגוד, קישורים מהרשת שלנו",
  },
  {
    title: "מנועי AI ומדידה",
    body: "תוכן שאלה ותשובה, סימון מובנה, עמוד הסבר על העסק, Search Console, Analytics, מקור כל פנייה",
  },
]

/** Why the human, in three lines. */
const EXPERT_POINTS: Array<{ title: string; body: string }> = [
  {
    title: "מתייעצים לפני שפועלים",
    body: "שאלה על שינוי באתר, על מחיר, על מתחרה שקפץ. שואלים ומקבלים תשובה.",
  },
  {
    title: "מרימים טלפון",
    body: "יש דברים שלא נפתרים במייל. במסלולים המורחב והמלא יש שיחת ייעוץ אמיתית.",
  },
  {
    title: "אותו אדם כל חודש",
    body: "לא מוקד ולא כרטיס תמיכה. מישהו שכבר יודע איפה הייתם בחודש שעבר.",
  },
]

export function AuditorPlans({ locale, scanId = null, onSelectPlan }: Props) {
  // See the note at the top of the file: no English copy exists to render.
  if (locale === "en") return null

  return (
    <>
      <AuditorPlansStyles />
      <section className="pl" id="plans">
        <div className="pl-in">

          <div className="pl-head">
            <span className="pl-kick"><i />שירות חודשי</span>
            <h2>השלב הבא: <span>קישורים מאתרים אחרים, ומומחה שלנו לצידכם</span></h2>
            <p>גוגל מדרג לפי מי מקשר אליכם, וזה הפער הגדול בדוח שלמעלה. להשיג קישור אחד לבד לוקח חודשיים של איתור, פנייה ושכנוע. <b>אנחנו נותנים לכם את הקישורים, ובן אדם שאפשר להרים אליו טלפון.</b></p>
          </div>

          <div className="pl-grid">
            {PLANS.map((plan) => (
              <div key={plan.slug} className={plan.top ? "pl-card is-top" : "pl-card"}>
                {plan.top ? <span className="pl-flag">הכי נבחר</span> : null}
                <div className="pl-name">{plan.name}</div>
                <div className="pl-price"><b>{plan.price}</b><em>₪ לחודש</em></div>
                <div className="pl-vat">{plan.vat}</div>

                <div className="pl-row">
                  <span className="ico"><LinkIcon /></span>
                  <strong>{plan.linkTitle}</strong>
                  <span>{plan.linkNote}</span>
                </div>

                <div className="pl-row sm">
                  <span className="ico"><TalkIcon /></span>
                  <strong>{plan.expertTitle}</strong>
                  <span>{plan.expertNote}</span>
                </div>

                <p className={plan.extraLabel === "תוספות" ? "pl-extra is-none" : "pl-extra"}>
                  <b>{plan.extraLabel}</b>{plan.extraBody}
                </p>

                <div className="pl-cta">
                  <button
                    type="button"
                    className={plan.top ? "pl-btn fill" : "pl-btn ghost"}
                    onClick={() => onSelectPlan?.(plan.slug, scanId)}
                  >
                    בחירת המסלול
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="pl-exp">
            <span className="ic"><PeopleIcon /></span>
            <h3>לא כלי, לא בוט. מומחה אנושי שעובד אתכם יד ביד</h3>
            <p>לכל מנוי מוצמד מומחה קידום מהצוות שלנו. אותו אדם, לאורך כל הדרך, שמכיר את העסק שלכם ואת האתר שלכם ואפשר להתייעץ אתו לפני שעושים משהו.</p>
            <div className="pl-exp-g">
              {EXPERT_POINTS.map((point) => (
                <div key={point.title}><b>{point.title}</b><p>{point.body}</p></div>
              ))}
            </div>
          </div>

          <div className="pl-inc">
            <div className="pl-inc-t">כלול בכל המסלולים</div>
            <div className="pl-inc-g">
              {INCLUDED.map((item) => (
                <div key={item.title} className="pl-item">
                  <span className="tick" aria-hidden="true">✓</span>
                  <p><b>{item.title}</b>{item.note}</p>
                </div>
              ))}
            </div>

            <details className="pl-more">
              <summary>מה נבדק ב-37 הסעיפים</summary>
              <div className="cols">
                {CHECKLIST_GROUPS.map((group) => (
                  <p key={group.title}><b>{group.title}</b>{group.body}</p>
                ))}
              </div>
            </details>
          </div>

          <p className="pl-fine">
            <b>תוכנית משפך לידים</b> היא התכנון בלבד: איזה עמוד צריך להיות, מה ההצעה, מה הטופס שואל ולאן הפנייה נכנסת. הבנייה, העיצוב והקריאטיב מתומחרים בנפרד.<br />
            ביצוע סעיפי הצ'קליסט ותקציב פרסום אינם כלולים. אין הבטחה למיקום מסוים בגוגל.<br />
            <b>כתיבת מאמרים לאתר שלכם זמינה כשירות נפרד</b>, בתמחור לפי היקף.
          </p>

        </div>
      </section>
    </>
  )
}

/**
 * The section's stylesheet.
 *
 * The block between the two markers is docs/scan-results-v5-with-plans.html
 * lines 249-480, carried across unchanged and copied by script rather than
 * retyped. Do not hand-edit it: change the spec and re-derive, so the two cannot
 * drift apart silently.
 *
 * The rules after the marker are this file's own, and there is one reason for
 * each:
 *
 *   .pl-btn as a button — the spec's plan CTAs are <a href="#join">, a
 *   placeholder for a flow that did not exist. They are real buttons here (see
 *   onSelectPlan above), and a button carries a UA border, background, font and
 *   centred text that an anchor does not. These four declarations undo exactly
 *   that, and nothing else.
 *
 *   :focus-visible — a button needs a visible keyboard focus state. The spec
 *   styles hover only.
 *
 *   prefers-reduced-motion — the cards lift on hover via a transform. The rest
 *   of this flow already honours the preference (auditor-scale.tsx); this
 *   section should not be the one place that ignores it.
 */
function AuditorPlansStyles() {
  return (
    <style
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `
/* ═══ carried verbatim from the spec · do not hand-edit ═══ */
/* ═══════════════════════════════════════════════════════════
   PLANS · שכבת טוקנים ייעודית לסקשן המסלולים
   כל הטוקנים בתחילית --pl- ואינם נוגעים בשאר העמוד.
   הצבעים נגזרים מהפלטה הקיימת, הסקאלה עצמאית וגדולה יותר.
   ═══════════════════════════════════════════════════════════ */
.pl{
  /* ── צבע ── */
  --pl-ink:#101B31;
  --pl-ink-2:#41506B;
  --pl-ink-3:#78859B;
  --pl-brand:#3A6D9A;
  --pl-brand-2:#5389BB;
  --pl-brand-ink:#2C5679;
  --pl-brand-wash:#EAF2F9;
  --pl-brand-line:#CBDDEC;
  --pl-ok:#1E9E63;
  --pl-surface:#FFFFFF;
  --pl-line:rgba(16,27,49,.09);
  --pl-line-soft:rgba(16,27,49,.06);

  /* ── טיפוגרפיה ── */
  --pl-display:clamp(29px,3.2vw,42px);
  --pl-title:clamp(20px,1.7vw,24px);
  --pl-lede:clamp(17px,1.35vw,20px);
  --pl-price:clamp(46px,4.2vw,58px);
  --pl-body:clamp(15.5px,1.1vw,17px);
  --pl-sm:clamp(14px,.95vw,15px);
  --pl-xs:12.5px;
  --pl-track-tight:-.025em;
  --pl-track-wide:.14em;

  /* ── מרווח ── */
  --pl-1:4px; --pl-2:8px; --pl-3:12px; --pl-4:16px;
  --pl-5:22px; --pl-6:30px; --pl-7:44px; --pl-8:64px; --pl-9:88px;

  /* ── צורה ── */
  --pl-r-lg:24px; --pl-r-md:16px; --pl-r-sm:11px; --pl-r-pill:999px;

  /* ── עומק ── */
  --pl-sh-1:0 1px 2px rgba(16,27,49,.05);
  --pl-sh-2:0 2px 4px rgba(16,27,49,.04), 0 10px 26px rgba(16,27,49,.07);
  --pl-sh-3:0 4px 10px rgba(44,86,121,.10), 0 26px 64px rgba(44,86,121,.20);
}

/* ── הרצועה ─────────────────────────────────────────────── */
section.pl{
  padding:var(--pl-9) 0;
  background:
    radial-gradient(760px 420px at 78% -8%, rgba(83,137,187,.13), transparent 62%),
    radial-gradient(620px 380px at 12% 108%, rgba(83,137,187,.09), transparent 62%),
    linear-gradient(180deg,#FBFCFE 0%, #EEF4FA 100%);
  border-block:1px solid var(--pl-line-soft);
  color:var(--pl-ink);
}
.pl *{box-sizing:border-box}
.pl .pl-in{max-width:1120px;margin:0 auto;padding:0 20px}

/* ── כותרת הסקשן, ממורכזת בכל רוחב מסך ───────────────────── */
.pl-head{text-align:center;max-width:720px;margin:0 auto var(--pl-7)}
.pl-kick{
  display:inline-flex;align-items:center;gap:8px;
  font-size:var(--pl-xs);font-weight:800;letter-spacing:var(--pl-track-wide);
  color:var(--pl-brand-ink);background:var(--pl-brand-wash);
  border:1px solid var(--pl-brand-line);
  padding:7px 15px;border-radius:var(--pl-r-pill);margin-bottom:var(--pl-4);
}
.pl-kick i{width:6px;height:6px;border-radius:50%;background:var(--pl-brand-2);font-style:normal}
.pl-head h2{
  font-size:var(--pl-display);font-weight:800;line-height:1.15;
  letter-spacing:var(--pl-track-tight);color:var(--pl-ink);margin:0;
}
.pl-head h2 span{color:var(--pl-brand);position:relative;white-space:nowrap}
@media (max-width:520px){.pl-head h2 span{white-space:normal}}
.pl-head p{
  font-size:var(--pl-lede);color:var(--pl-ink-2);line-height:1.6;
  margin:var(--pl-4) auto 0;max-width:60ch;
}
.pl-head p b{color:var(--pl-ink);font-weight:800}

/* ── כרטיסים ────────────────────────────────────────────── */
.pl-grid{display:grid;gap:var(--pl-4);align-items:stretch}
@media (min-width:900px){
  .pl-grid{grid-template-columns:repeat(3,1fr);gap:var(--pl-5);align-items:center}
}
.pl-card{
  position:relative;display:flex;flex-direction:column;text-align:center;align-items:center;
  background:var(--pl-surface);border:1px solid var(--pl-line);
  border-radius:var(--pl-r-lg);padding:var(--pl-6) var(--pl-5) var(--pl-5);
  box-shadow:var(--pl-sh-2);transition:transform .22s ease, box-shadow .22s ease;
}
.pl-card:hover{transform:translateY(-3px);box-shadow:0 6px 14px rgba(16,27,49,.07),0 22px 50px rgba(16,27,49,.11)}
.pl-card.is-top{
  border:1.5px solid var(--pl-brand-2);box-shadow:var(--pl-sh-3);
  background:linear-gradient(180deg,#FFFFFF 0%, #F9FCFE 100%);
}
@media (min-width:900px){
  .pl-card.is-top{padding-block:var(--pl-7) var(--pl-6);z-index:2}
}
.pl-card.is-top:hover{transform:translateY(-5px)}
.pl-flag{
  position:absolute;top:0;inset-inline-start:50%;transform:translate(50%,-50%);
  background:linear-gradient(180deg,var(--pl-brand-2),var(--pl-brand));color:#fff;
  font-size:var(--pl-xs);font-weight:800;letter-spacing:.04em;
  padding:6px 18px;border-radius:var(--pl-r-pill);white-space:nowrap;
  box-shadow:0 6px 16px rgba(44,86,121,.32);
}

.pl-name{font-size:var(--pl-xs);font-weight:800;letter-spacing:var(--pl-track-wide);color:var(--pl-ink-3)}
.pl-price{
  display:flex;align-items:flex-end;justify-content:center;gap:9px;margin-top:var(--pl-3);
  font-variant-numeric:tabular-nums;
}
.pl-price b{font-size:var(--pl-price);font-weight:800;line-height:.92;letter-spacing:-.035em;color:var(--pl-ink)}
.pl-price em{font-style:normal;font-size:var(--pl-sm);font-weight:700;color:var(--pl-ink-3);padding-bottom:6px}
.pl-vat{font-size:var(--pl-xs);color:var(--pl-ink-3);font-weight:600;margin-top:var(--pl-2)}

.pl-row{width:100%;padding:var(--pl-5) 0;border-top:1px solid var(--pl-line)}
.pl-row .ico{
  width:34px;height:34px;border-radius:50%;background:var(--pl-brand-wash);
  border:1px solid var(--pl-brand-line);display:grid;place-items:center;
  margin:0 auto var(--pl-3);color:var(--pl-brand);
}
.pl-row .ico svg{width:17px;height:17px;display:block}
.pl-row strong{display:block;font-size:var(--pl-title);font-weight:800;color:var(--pl-ink);line-height:1.3}
.pl-row span{display:block;font-size:var(--pl-xs);font-weight:700;color:var(--pl-brand);margin-top:5px;letter-spacing:.02em}
.pl-row.sm strong{font-size:var(--pl-body)}
.pl-card.is-top .pl-row .ico{background:var(--pl-brand);border-color:var(--pl-brand);color:#fff}
.pl-card.is-top .pl-row strong{color:var(--pl-brand-ink)}

.pl-extra{
  margin-top:var(--pl-4);font-size:var(--pl-sm);color:var(--pl-ink-2);line-height:1.6;max-width:32ch;width:100%;
}
.pl-extra b{
  display:block;font-size:var(--pl-xs);font-weight:800;letter-spacing:.08em;
  color:var(--pl-ink-3);margin-bottom:var(--pl-2);
}
.pl-extra.is-none{color:var(--pl-ink-3)}

.pl-cta{margin-top:auto;padding-top:var(--pl-5);width:100%}
.pl-btn{
  display:flex;align-items:center;justify-content:center;width:100%;
  height:54px;border-radius:var(--pl-r-sm);font-size:var(--pl-body);font-weight:800;
  text-decoration:none;transition:background .18s ease, box-shadow .18s ease;
}
.pl-btn.ghost{background:#fff;color:var(--pl-brand-ink);box-shadow:inset 0 0 0 1.5px var(--pl-brand-line)}
.pl-btn.ghost:hover{background:var(--pl-brand-wash)}
.pl-btn.fill{
  background:linear-gradient(180deg,var(--pl-brand-2),var(--pl-brand));color:#fff;
  box-shadow:0 8px 20px rgba(44,86,121,.28);
}
.pl-btn.fill:hover{box-shadow:0 12px 28px rgba(44,86,121,.36)}

/* ── רצועת המומחה ───────────────────────────────────────── */
.pl-exp{
  margin-top:var(--pl-6);border-radius:var(--pl-r-lg);padding:var(--pl-6) var(--pl-5);
  background:linear-gradient(135deg,var(--pl-brand-ink) 0%, var(--pl-brand-2) 100%);
  color:#fff;text-align:center;position:relative;overflow:hidden;
  box-shadow:0 18px 44px rgba(44,86,121,.26);
}
.pl-exp::after{
  content:"";position:absolute;inset:0;pointer-events:none;
  background-image:radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px);
  background-size:22px 22px;
}
.pl-exp>*{position:relative;z-index:2}
.pl-exp .ic{
  width:52px;height:52px;border-radius:50%;margin:0 auto var(--pl-4);
  background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);
  display:grid;place-items:center;color:#fff;
}
.pl-exp .ic svg{width:25px;height:25px;display:block}
.pl-exp h3{font-size:var(--pl-title);font-weight:800;color:#fff;margin:0 0 var(--pl-2);line-height:1.3}
.pl-exp>p{font-size:var(--pl-body);color:rgba(255,255,255,.86);max-width:56ch;margin:0 auto;line-height:1.6}
.pl-exp-g{
  display:grid;gap:var(--pl-4);margin-top:var(--pl-6);padding-top:var(--pl-5);
  border-top:1px solid rgba(255,255,255,.18);
}
@media (min-width:760px){.pl-exp-g{grid-template-columns:repeat(3,1fr)}}
.pl-exp-g div b{display:block;font-size:var(--pl-body);font-weight:800;color:#fff;margin-bottom:3px}
.pl-exp-g div p{font-size:var(--pl-sm);color:rgba(255,255,255,.78);margin:0;line-height:1.5}

/* ── מה שכלול בכולם ─────────────────────────────────────── */
.pl-inc{
  margin-top:var(--pl-6);background:var(--pl-surface);border:1px solid var(--pl-line);
  border-radius:var(--pl-r-lg);padding:var(--pl-6) var(--pl-5);box-shadow:var(--pl-sh-1);
}
.pl-inc-t{
  text-align:center;font-size:var(--pl-xs);font-weight:800;
  letter-spacing:var(--pl-track-wide);color:var(--pl-ink-3);margin-bottom:var(--pl-5);
}
.pl-inc-g{display:grid;gap:var(--pl-4)}
@media (min-width:640px){.pl-inc-g{grid-template-columns:1fr 1fr}}
@media (min-width:980px){.pl-inc-g{grid-template-columns:repeat(3,1fr)}}
.pl-item{display:flex;flex-direction:column;align-items:center;gap:var(--pl-3);text-align:center;padding:var(--pl-2) var(--pl-3)}
.pl-item .tick{
  flex-shrink:0;width:30px;height:30px;border-radius:50%;
  background:#E6F4EC;color:var(--pl-ok);display:grid;place-items:center;
  font-size:14px;font-weight:800;
}
.pl-item p{font-size:var(--pl-sm);color:var(--pl-ink-2);line-height:1.5;margin:0}
.pl-item p b{display:block;color:var(--pl-ink);font-weight:800;font-size:var(--pl-body);margin-bottom:1px}

.pl-more{margin-top:var(--pl-5);padding-top:var(--pl-4);border-top:1px solid var(--pl-line-soft);text-align:center}
.pl-more summary{
  list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:7px;
  font-size:var(--pl-sm);font-weight:800;color:var(--pl-brand-ink);
}
.pl-more summary::-webkit-details-marker{display:none}
.pl-more summary::after{content:"+";font-size:16px;line-height:1}
.pl-more[open] summary::after{content:"−"}
.pl-more .cols{columns:1;column-gap:32px;margin-top:var(--pl-5);text-align:start}
@media (min-width:640px){.pl-more .cols{columns:2}}
@media (min-width:980px){.pl-more .cols{columns:3}}
.pl-more .cols p{break-inside:avoid;margin:0 0 var(--pl-4);font-size:var(--pl-sm);color:var(--pl-ink-2);line-height:1.55}
.pl-more .cols p b{
  display:block;font-size:var(--pl-xs);font-weight:800;letter-spacing:.07em;
  color:var(--pl-brand-ink);margin-bottom:3px;
}

/* ── אותיות קטנות ───────────────────────────────────────── */
.pl-fine{
  margin-top:var(--pl-5);text-align:center;font-size:var(--pl-xs);
  color:var(--pl-ink-3);line-height:1.85;max-width:80ch;margin-inline:auto;
}
.pl-fine b{color:var(--pl-ink-2);font-weight:800}

@media (max-width:899px){
  section.pl{padding:var(--pl-8) 0}
  .pl-card{padding:var(--pl-6) var(--pl-5) var(--pl-5)}
  .pl-flag{top:4px;transform:translate(50%,-50%)}
}
/* ═══ end of the carried block · this file's own rules follow ═══ */

.pl .pl-btn{
  border:0;
  font-family:inherit;
  cursor:pointer;
  text-align:center;
}
.pl .pl-btn:focus-visible{
  outline:2px solid var(--pl-brand-ink);
  outline-offset:3px;
}
@media (prefers-reduced-motion:reduce){
  .pl .pl-card,
  .pl .pl-card:hover,
  .pl .pl-card.is-top:hover{transition:none;transform:none}
}
`.trim(),
      }}
    />
  )
}

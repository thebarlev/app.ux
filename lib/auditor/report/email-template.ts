/**
 * The scan report as an email — and, later, as a PDF.
 *
 * Table layout, fixed 600px, inline styles, web-safe fonts, no JavaScript and no
 * external assets. That is not nostalgia: Gmail strips <style> blocks, Outlook
 * renders through Word's engine which has no flexbox or grid, and a headless
 * Chrome print-to-PDF pass wants exactly the same static markup. Building it
 * this way once means the PDF step is a render call, not a second template.
 *
 * Bars are nested tables with bgcolor rather than CSS — a div with a background
 * and a percentage width is the single most common thing to collapse in Outlook.
 *
 * What this template will not say, carried over from
 * docs/auditor-scanflow-behavior-rules.md:
 *  - nothing about competitors; that branch has no API key in production
 *  - nothing about severity or ordering; issues_overview mixes fail and warn
 *    with nothing to tell them apart, so findings are one amber tone
 *  - "ממצאים", never "בעיות"
 *  - any value that is null is omitted rather than defaulted to zero, because a
 *    zero that means "we did not measure this" is a wrong number, not a blank
 */

export type AuditorReportEmailData = {
  hostname: string | null
  scoreTotal: number | null
  scoreSearch: number | null
  scoreAi: number | null
  categoryScores: Record<string, number> | null
  /** Already fail/warn only, already locale-resolved by the caller. */
  findings: string[]
  /** The true total, which `findings` may be a truncated view of. */
  findingsCount: number | null
  pagesScanned: number | null
  /** Absolute URL to the on-screen report. */
  reportUrl: string | null
  locale: "he" | "en"
}

const C = {
  ink: "#19183B",
  ink2: "#3A4160",
  muted: "#8A90A0",
  faint: "#B9BFCC",
  brand: "#5389BB",
  brandDk: "#3F76AC",
  brandTint: "#EAF1F8",
  line: "#ECEFF4",
  line2: "#E2E7F0",
  field: "#F7F9FC",
  amber: "#B7791F",
  amberBg: "#FDF3E3",
  page: "#EEF1F6",
} as const

const T = {
  he: {
    preheader: (h: string) => `הדוח של ${h} מוכן`,
    subject: (h: string) => `הדוח של ${h} מוכן`,
    title: "הדוח שלכם מוכן",
    scoreLabel: "ציון-על",
    pages: "עמודים נסרקו",
    findings: "ממצאים",
    byCategory: "ציון לפי קטגוריה",
    findingsHead: "ממצאים",
    noFindings: "לא נמצאו ממצאים מהותיים בסריקה הראשונית.",
    more: (n: number) => `ועוד ${n} ממצאים בדוח המלא`,
    cta: "לצפייה בדוח המלא",
    footerNote: "קיבלתם את המייל הזה כי ביקשתם עותק של הדוח בעת הסריקה.",
    cats: {
      search_readiness: "גוגל SEO",
      ai_readiness: "נראות ב-AI",
      technical: "טכני",
      schema: "Schema",
      tracking: "מעקב תנועה",
    } as Record<string, string>,
  },
  en: {
    preheader: (h: string) => `Your report for ${h} is ready`,
    subject: (h: string) => `Your report for ${h} is ready`,
    title: "Your report is ready",
    scoreLabel: "Overall score",
    pages: "Pages scanned",
    findings: "Findings",
    byCategory: "Score by category",
    findingsHead: "Findings",
    noFindings: "No major findings in the initial scan.",
    more: (n: number) => `And ${n} more findings in the full report`,
    cta: "View the full report",
    footerNote: "You received this because you asked for a copy of the report during the scan.",
    cats: {
      search_readiness: "Google SEO",
      ai_readiness: "AI visibility",
      technical: "Technical",
      schema: "Schema",
      tracking: "Traffic tracking",
    } as Record<string, string>,
  },
} as const

/**
 * Either locale's string table. `as const` gives each one distinct literal
 * types, so a helper typed against T.he alone rejects T.en — the union is what
 * both actually satisfy.
 */
type Strings = (typeof T)[keyof typeof T]

/** Everything interpolated into the HTML goes through this. */
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

function toneFor(v: number): string {
  if (v >= 75) return "#167C4B"
  if (v >= 50) return C.amber
  return "#C0392B"
}

/** A percentage bar built from tables, because Outlook has no CSS bars. */
function bar(value: number): string {
  const v = clampPct(value)
  const fill = toneFor(v)
  // A zero-width cell still renders a 1px sliver in some clients, so it is
  // dropped entirely rather than emitted with width="0".
  const filled = v > 0
    ? `<td width="${v}%" bgcolor="${fill}" style="background-color:${fill};font-size:0;line-height:0;height:6px;border-radius:99px;">&nbsp;</td>`
    : ""
  const rest = 100 - v
  const empty = rest > 0
    ? `<td width="${rest}%" style="font-size:0;line-height:0;height:6px;">&nbsp;</td>`
    : ""
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;table-layout:fixed;background-color:${C.line};border-radius:99px;"><tr>${filled}${empty}</tr></table>`
}

function categoryRows(data: AuditorReportEmailData, t: Strings): string {
  const cats = data.categoryScores || {}
  const rows: string[] = []

  const push = (key: string, value: number | null) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return
    const label = t.cats[key] || key
    const v = clampPct(value)
    rows.push(
      `<tr>
        <td style="padding:9px 0 3px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:${C.ink};">${esc(label)}</td>
        <td align="left" style="padding:9px 0 3px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:${toneFor(v)};">${v}</td>
      </tr>
      <tr><td colspan="2" style="padding:0 0 6px 0;">${bar(v)}</td></tr>`
    )
  }

  // Named first so the order is stable, then anything else the engine returned.
  push("search_readiness", cats.search_readiness ?? data.scoreSearch)
  push("ai_readiness", cats.ai_readiness ?? data.scoreAi)
  for (const [k, v] of Object.entries(cats)) {
    if (k === "search_readiness" || k === "ai_readiness") continue
    push(k, typeof v === "number" ? v : null)
  }

  if (rows.length === 0) return ""
  return `
  <tr><td style="padding:22px 30px 0 30px;">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:${C.ink};padding-bottom:4px;">${esc(t.byCategory)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows.join("")}</table>
  </td></tr>`
}

function findingsBlock(data: AuditorReportEmailData, t: Strings): string {
  const list = data.findings.filter((s) => String(s || "").trim().length > 0)
  const total = typeof data.findingsCount === "number" ? data.findingsCount : list.length
  const remainder = Math.max(0, total - list.length)

  const body = list.length === 0
    ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13.5px;color:${C.muted};padding:6px 0;">${esc(t.noFindings)}</div>`
    : list
        .map(
          (text) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:7px;">
        <tr>
          <td width="26" valign="top" style="padding:9px 0 9px 10px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr><td width="18" height="18" align="center" bgcolor="${C.amberBg}" style="background-color:${C.amberBg};border-radius:5px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;color:${C.amber};line-height:18px;">!</td></tr>
            </table>
          </td>
          <td valign="top" style="padding:9px 0;font-family:Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.5;color:${C.ink2};">${esc(text)}</td>
        </tr>
      </table>`
        )
        .join("")

  const moreLine = remainder > 0
    ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:${C.muted};padding-top:4px;">${esc(t.more(remainder))}</div>`
    : ""

  return `
  <tr><td style="padding:22px 30px 0 30px;">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:${C.ink};padding-bottom:6px;">${esc(t.findingsHead)}${
      total > 0 ? ` <span style="font-weight:normal;color:${C.muted};">${total}</span>` : ""
    }</div>
    ${body}
    ${moreLine}
  </td></tr>`
}

export function renderAuditorReportEmail(data: AuditorReportEmailData): { subject: string; html: string } {
  const en = data.locale === "en"
  const t = T[en ? "en" : "he"]
  const dir = en ? "ltr" : "rtl"
  const host = data.hostname || (en ? "your site" : "האתר שלכם")

  const score = typeof data.scoreTotal === "number" && Number.isFinite(data.scoreTotal) ? clampPct(data.scoreTotal) : null

  const statCell = (value: string, label: string) => `
    <td width="50%" align="center" style="padding:0 5px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:${C.field};border:1px solid ${C.line};border-radius:11px;">
        <tr><td align="center" style="padding:11px 6px;">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:21px;font-weight:bold;color:${C.ink};line-height:1.1;">${esc(value)}</div>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;color:${C.muted};padding-top:3px;">${esc(label)}</div>
        </td></tr>
      </table>
    </td>`

  const stats: string[] = []
  if (typeof data.pagesScanned === "number") stats.push(statCell(String(data.pagesScanned), t.pages))
  if (typeof data.findingsCount === "number") stats.push(statCell(String(data.findingsCount), t.findings))

  const statsRow = stats.length
    ? `<tr><td style="padding:18px 25px 0 25px;">
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>${stats.join("")}</tr></table>
       </td></tr>`
    : ""

  const ctaRow = data.reportUrl
    ? `<tr><td align="center" style="padding:24px 30px 4px 30px;">
         <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
           <tr><td align="center" bgcolor="${C.brandDk}" style="background-color:${C.brandDk};border-radius:11px;">
             <a href="${esc(data.reportUrl)}" target="_blank" style="display:inline-block;padding:14px 34px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${esc(t.cta)}</a>
           </td></tr>
         </table>
       </td></tr>`
    : ""

  const scoreRow = score !== null
    ? `<tr><td align="center" style="padding:26px 30px 0 30px;">
         <div style="font-family:Arial,Helvetica,sans-serif;font-size:64px;line-height:1;font-weight:bold;color:${C.ink};">${score}<span style="font-size:24px;color:${C.brand};">%</span></div>
         <div style="font-family:Arial,Helvetica,sans-serif;font-size:12.5px;font-weight:bold;color:${C.muted};padding-top:6px;">${esc(t.scoreLabel)}</div>
       </td></tr>`
    : ""

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="${en ? "en" : "he"}" dir="${dir}">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(t.subject(host))}</title>
<!--[if mso]><style type="text/css">body,table,td,a{font-family:Arial,Helvetica,sans-serif !important}</style><![endif]-->
<style type="text/css">
  body{margin:0;padding:0;background-color:${C.page};}
  img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
  table{border-collapse:collapse !important;}
  a{color:${C.brandDk};}
  @media only screen and (max-width:620px){
    .wrap{width:100% !important;}
    .pad{padding-left:16px !important;padding-right:16px !important;}
  }
</style>
</head>
<body dir="${dir}" style="margin:0;padding:0;background-color:${C.page};">
<div style="display:none;font-size:1px;color:${C.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(t.preheader(host))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.page};">
  <tr><td align="center" style="padding:26px 12px;">

    <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid ${C.line};border-radius:16px;">

      <tr><td class="pad" style="padding:22px 30px 0 30px;border-bottom:1px solid ${C.line};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="${en ? "left" : "right"}" style="padding-bottom:16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:${C.ink};">UX<span style="color:${C.brand};">ellent</span></td>
            <td align="${en ? "right" : "left"}" style="padding-bottom:16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${C.ink2};direction:ltr;">${esc(host)}</td>
          </tr>
        </table>
      </td></tr>

      <tr><td class="pad" align="center" style="padding:24px 30px 0 30px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:${C.ink};">${esc(t.title)}</div>
      </td></tr>

      ${scoreRow}
      ${statsRow}
      ${categoryRows(data, t)}
      ${findingsBlock(data, t)}
      ${ctaRow}

      <tr><td class="pad" style="padding:22px 30px 24px 30px;">
        <div style="border-top:1px solid ${C.line};padding-top:14px;font-family:Arial,Helvetica,sans-serif;font-size:11.5px;line-height:1.6;color:${C.faint};">${esc(t.footerNote)}</div>
      </td></tr>

    </table>

  </td></tr>
</table>
</body>
</html>`

  return { subject: t.subject(host), html }
}

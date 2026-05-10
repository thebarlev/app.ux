// Customer Report — generated from scan data, output as Word .docx.
//
// Audience: business owner of the scanned site (non-technical).
// Tone: business-friendly, action-oriented, encouraging.
//
// Goals:
// - Demonstrate value of the service ("here's what we'll fix").
// - Be readable on mobile.
// - Easy for the admin to edit the .docx and customise per client before sending.

import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  PageBreak,
  Packer,
} from "docx"
import type { ReportData, FindingRow, RuleRow } from "./data-loader"
import { topFindings, passingHighlights, formatHebrewDate, gradeFromScore } from "./data-loader"

// Brand colours for VOW. Easy to tweak per client later.
const COLORS = {
  primary: "1e40af",
  text: "0f172a",
  muted: "64748b",
  accent: "ea580c",
  good: "16a34a",
  ok: "65a30d",
  warn: "ca8a04",
  bad: "dc2626",
  rowAlt: "f8fafc",
}

// ─── small helpers ──────────────────────────────────────────────────────────

function rtl(text: string): TextRun {
  return new TextRun({ text, rightToLeft: true })
}

function rtlBold(text: string, color?: string): TextRun {
  return new TextRun({ text, rightToLeft: true, bold: true, color })
}

function paragraph(text: string, opts: { bold?: boolean; size?: number; color?: string; align?: AlignmentType } = {}): Paragraph {
  return new Paragraph({
    bidirectional: true,
    alignment: opts.align ?? AlignmentType.RIGHT,
    children: [
      new TextRun({
        text,
        rightToLeft: true,
        bold: opts.bold,
        size: opts.size,
        color: opts.color,
      }),
    ],
  })
}

function heading(text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({
    heading: level,
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ text, rightToLeft: true })],
  })
}

function emptyParagraph(): Paragraph {
  return new Paragraph({ children: [] })
}

function shadedCell(text: string, color: string): TableCell {
  return new TableCell({
    shading: { type: ShadingType.SOLID, color, fill: color },
    width: { size: 25, type: WidthType.PERCENTAGE },
    children: [
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, color: "ffffff", bold: true, rightToLeft: true })],
      }),
    ],
  })
}

function plainCell(text: string, opts: { bold?: boolean; align?: AlignmentType } = {}): TableCell {
  return new TableCell({
    width: { size: 25, type: WidthType.PERCENTAGE },
    children: [
      new Paragraph({
        bidirectional: true,
        alignment: opts.align ?? AlignmentType.CENTER,
        children: [new TextRun({ text, bold: opts.bold, rightToLeft: true })],
      }),
    ],
  })
}

// ─── Section builders ───────────────────────────────────────────────────────

function buildCoverPage(data: ReportData): Paragraph[] {
  const host = data.scan.normalized_host || data.scan.hostname || "האתר שלך"
  const date = data.scan.finished_at ? formatHebrewDate(data.scan.finished_at) : formatHebrewDate(data.scan.created_at)

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1200, after: 400 },
      children: [new TextRun({ text: "דוח נוכחות דיגיטלית", bold: true, size: 56, color: COLORS.primary, rightToLeft: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: "VOW Auditor — סריקת SEO + AI Readiness", size: 28, color: COLORS.muted, rightToLeft: true })],
    }),
    emptyParagraph(),
    emptyParagraph(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600, after: 200 },
      children: [new TextRun({ text: host, bold: true, size: 48, color: COLORS.text, rightToLeft: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 1200 },
      children: [new TextRun({ text: `תאריך הסריקה: ${date}`, size: 24, color: COLORS.muted, rightToLeft: true })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ]
}

function scoreCard(label: string, score: number | null): Paragraph[] {
  const grade = gradeFromScore(score)
  const display = typeof score === "number" ? `${score}` : "—"
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 80 },
      children: [new TextRun({ text: label, bold: true, size: 22, color: COLORS.muted, rightToLeft: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: display, bold: true, size: 64, color: grade.hex })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [new TextRun({ text: grade.label, bold: true, size: 22, color: grade.hex, rightToLeft: true })],
    }),
  ]
}

function buildExecutiveSummary(data: ReportData): Paragraph[] {
  const m = data.pagespeed?.mobile?.scores
  const d = data.pagespeed?.desktop?.scores

  const findingsCount = data.findings.filter((f) => f.status === "fail" || f.status === "warn").length
  const passingCount = data.rules.filter((r) => r.status === "pass").length

  const summaryText =
    findingsCount === 0
      ? `האתר שלך עובר את רוב הבדיקות שלנו. זיהינו ${passingCount} מדדים שעובדים מצוין, ויש מקום לשיפור בכמה פינות. בעמודים הבאים תמצאו את הפירוט המלא ואת תוכנית העבודה שלנו לחודשים הקרובים.`
      : `זיהינו ${findingsCount} שיפורים מרכזיים שיכולים לשפר את הנוכחות הדיגיטלית של האתר שלכם, מתוך ${data.rules.length} בדיקות. בעמודים הבאים תמצאו את הפירוט המלא, ${passingCount} דברים שכבר עובדים מצוין, ותוכנית עבודה חודשית שלנו ליישום השיפורים.`

  const parts: Paragraph[] = [
    heading("תקציר מנהלים", HeadingLevel.HEADING_1),
    paragraph(summaryText, { size: 24 }),
    emptyParagraph(),
    heading("הציון הכללי שלכם", HeadingLevel.HEADING_2),
  ]

  // Score table — 4 cards in a row
  if (m || d) {
    const scoreTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: "ffffff" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "ffffff" },
        left: { style: BorderStyle.NONE, size: 0, color: "ffffff" },
        right: { style: BorderStyle.NONE, size: 0, color: "ffffff" },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "ffffff" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "ffffff" },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              children: scoreCard("מהירות (Mobile)", m?.performance ?? null),
            }),
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              children: scoreCard("מהירות (Desktop)", d?.performance ?? null),
            }),
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              children: scoreCard("SEO", m?.seo ?? d?.seo ?? null),
            }),
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              children: scoreCard("נגישות", m?.accessibility ?? d?.accessibility ?? null),
            }),
          ],
        }),
      ],
    })
    parts.push(emptyParagraph())
    parts.push(new Paragraph({ children: [], bidirectional: true }))
    // @ts-ignore — docx Document accepts mixed children including Tables in section
    parts.push(scoreTable as unknown as Paragraph)
    parts.push(emptyParagraph())
  }

  return parts
}

function buildPerformanceDetails(data: ReportData): Paragraph[] {
  if (!data.pagespeed?.mobile && !data.pagespeed?.desktop) {
    return []
  }
  const m = data.pagespeed.mobile
  const d = data.pagespeed.desktop

  const parts: Paragraph[] = [
    emptyParagraph(),
    heading("פירוט מדדי ביצועים אמיתיים מ-Google", HeadingLevel.HEADING_2),
    paragraph("המדדים הבאים נלקחים ישירות מ-Google PageSpeed Insights — אותם המדדים שמשמשים את גוגל לדירוג האתר בתוצאות החיפוש.", { size: 22, color: COLORS.muted }),
    emptyParagraph(),
  ]

  const cwvTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          shadedCell("מדד", COLORS.primary),
          shadedCell("Mobile", COLORS.primary),
          shadedCell("Desktop", COLORS.primary),
          shadedCell("יעד מומלץ", COLORS.primary),
        ],
      }),
      new TableRow({
        children: [
          plainCell("זמן טעינה (LCP)", { bold: true, align: AlignmentType.RIGHT }),
          plainCell(m?.cwv?.lcp_ms ? `${Math.round(m.cwv.lcp_ms)} ms` : "—"),
          plainCell(d?.cwv?.lcp_ms ? `${Math.round(d.cwv.lcp_ms)} ms` : "—"),
          plainCell("פחות מ-2500 ms"),
        ],
      }),
      new TableRow({
        children: [
          plainCell("יציבות פריסה (CLS)", { bold: true, align: AlignmentType.RIGHT }),
          plainCell(m?.cwv?.cls != null ? m.cwv.cls.toFixed(3) : "—"),
          plainCell(d?.cwv?.cls != null ? d.cwv.cls.toFixed(3) : "—"),
          plainCell("פחות מ-0.1"),
        ],
      }),
      new TableRow({
        children: [
          plainCell("תגובה ל-קליק (INP)", { bold: true, align: AlignmentType.RIGHT }),
          plainCell(m?.cwv?.inp_ms ? `${Math.round(m.cwv.inp_ms)} ms` : "—"),
          plainCell(d?.cwv?.inp_ms ? `${Math.round(d.cwv.inp_ms)} ms` : "—"),
          plainCell("פחות מ-200 ms"),
        ],
      }),
    ],
  })
  // @ts-ignore
  parts.push(cwvTable as unknown as Paragraph)
  parts.push(emptyParagraph())

  return parts
}

function buildWhatNeedsAttention(data: ReportData): Paragraph[] {
  const top = topFindings(data.findings, 5)
  if (top.length === 0) {
    return [
      heading("מה צריך תיקון", HeadingLevel.HEADING_2),
      paragraph("✅ לא נמצאו בעיות משמעותיות בסריקה. האתר במצב טוב!", { size: 24, color: COLORS.good }),
    ]
  }

  const parts: Paragraph[] = [
    heading("מה צריך תיקון", HeadingLevel.HEADING_2),
    paragraph("אלה 5 הסעיפים החשובים ביותר שזיהינו, מסודרים לפי דחיפות:", { size: 22, color: COLORS.muted }),
    emptyParagraph(),
  ]

  const severityBadge: Record<string, { label: string; color: string }> = {
    critical: { label: "דחוף", color: COLORS.bad },
    high: { label: "גבוה", color: COLORS.bad },
    medium: { label: "בינוני", color: COLORS.warn },
    low: { label: "נמוך", color: COLORS.ok },
  }

  let idx = 1
  for (const f of top) {
    const badge = severityBadge[f.severity] || severityBadge.medium
    parts.push(
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        spacing: { before: 200, after: 100 },
        children: [
          new TextRun({ text: `${idx}. `, bold: true, size: 26, rightToLeft: true }),
          new TextRun({ text: `[${badge.label}]`, bold: true, color: badge.color, size: 24, rightToLeft: true }),
          new TextRun({ text: " ", rightToLeft: true }),
          new TextRun({ text: f.title, bold: true, size: 26, rightToLeft: true }),
        ],
      })
    )
    parts.push(
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        spacing: { after: 80 },
        children: [
          new TextRun({ text: "מה אנחנו נעשה: ", bold: true, size: 22, color: COLORS.muted, rightToLeft: true }),
          new TextRun({ text: f.recommendation || "ננתח ונתקן בהתאם לבעיה הספציפית.", size: 22, rightToLeft: true }),
        ],
      })
    )
    idx += 1
  }

  return parts
}

function buildWhatsWorking(data: ReportData): Paragraph[] {
  const passing = passingHighlights(data.rules, 5)
  if (passing.length === 0) {
    return []
  }

  const parts: Paragraph[] = [
    emptyParagraph(),
    heading("מה כבר עובד מצוין", HeadingLevel.HEADING_2),
    paragraph("אלה דברים שהאתר שלך עושה נכון. שמרו עליהם:", { size: 22, color: COLORS.muted }),
    emptyParagraph(),
  ]

  for (const r of passing) {
    parts.push(
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        spacing: { before: 100, after: 50 },
        children: [
          new TextRun({ text: "✓  ", bold: true, color: COLORS.good, size: 24, rightToLeft: true }),
          new TextRun({ text: r.recommendation_he || r.rule_key, size: 24, rightToLeft: true }),
        ],
      })
    )
  }

  return parts
}

function buildActionPlan(data: ReportData): Paragraph[] {
  const findings = topFindings(data.findings, 12)
  if (findings.length === 0) {
    return [
      emptyParagraph(),
      heading("תוכנית עבודה", HeadingLevel.HEADING_2),
      paragraph("האתר במצב טוב. נמשיך במעקב חודשי כדי לוודא שהציונים נשמרים גבוהים.", { size: 22 }),
    ]
  }

  const month1 = findings.filter((f) => f.severity === "critical" || f.severity === "high").slice(0, 5)
  const month2 = findings.filter((f) => f.severity === "medium").slice(0, 5)
  const month3 = findings.filter((f) => f.severity === "low").slice(0, 5)

  const parts: Paragraph[] = [
    emptyParagraph(),
    heading("תוכנית עבודה — 90 ימים", HeadingLevel.HEADING_2),
    paragraph("אנחנו פותחים פריטים שונים לפי דחיפות. הנה תוכנית העבודה שלנו:", { size: 22, color: COLORS.muted }),
  ]

  const renderMonth = (label: string, items: FindingRow[]) => {
    if (items.length === 0) return
    parts.push(
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        spacing: { before: 240, after: 100 },
        children: [new TextRun({ text: label, bold: true, size: 28, color: COLORS.primary, rightToLeft: true })],
      })
    )
    for (const f of items) {
      parts.push(
        new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          spacing: { after: 50 },
          children: [
            new TextRun({ text: "• ", bold: true, size: 22, rightToLeft: true }),
            new TextRun({ text: f.title, size: 22, rightToLeft: true }),
          ],
        })
      )
    }
  }

  renderMonth("חודש 1 — שיפורים דחופים", month1)
  renderMonth("חודש 2 — שיפורים בינוניים", month2)
  renderMonth("חודש 3 — סיומים ומעקב", month3)

  return parts
}

function buildFooter(): Paragraph[] {
  return [
    emptyParagraph(),
    emptyParagraph(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
      children: [
        new TextRun({
          text: "VOW Auditor",
          bold: true,
          size: 24,
          color: COLORS.primary,
          rightToLeft: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "ליצירת קשר: support@uxellent.com",
          size: 20,
          color: COLORS.muted,
          rightToLeft: true,
        }),
      ],
    }),
  ]
}

// ─── Public entry point ─────────────────────────────────────────────────────

export async function buildCustomerReportDocx(data: ReportData): Promise<Buffer> {
  const children: Paragraph[] = [
    ...buildCoverPage(data),
    ...buildExecutiveSummary(data),
    ...buildPerformanceDetails(data),
    ...buildWhatsWorking(data),
    ...buildWhatNeedsAttention(data),
    ...buildActionPlan(data),
    ...buildFooter(),
  ]

  const doc = new Document({
    creator: "VOW Auditor",
    description: "Customer SEO + AI Readiness report",
    title: `דוח נוכחות דיגיטלית — ${data.scan.normalized_host || "site"}`,
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 22, rightToLeft: true },
          paragraph: { bidirectional: true, alignment: AlignmentType.RIGHT },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 },
          },
        },
        children,
      },
    ],
  })

  return await Packer.toBuffer(doc)
}

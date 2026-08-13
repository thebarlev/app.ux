"use client"

/**
 * Appendix 4's dialog and its printed report.
 *
 * Every line of the result screen below is on page 20 of the spec, in this order. The
 * headings, the labels and the fixed sentence are the spec's words; nothing here is
 * paraphrased, because the printed page is meant to be comparable against page 20 line by
 * line.
 *
 * ── ⛔ WHAT IS PRINTED IS THE SPEC'S REPORT, AND ONLY THAT ──────────────────
 *
 * The export also reports what it excluded and what it had to change to fit the format
 * (`excludedDocuments`, `notes`). Those are ours, not appendix 4's, and they are rendered
 * in a `no-print` block. The printed sheet is the report the registrar asked for; putting
 * our own diagnostics on it would make the deliverable something other than what page 20
 * describes.
 *
 * ── ⛔ AND THE FAILURE PATH SHOWS THE SERVER'S WORDS ────────────────────────
 *
 * On error this renders the response body as it arrived, code and all. The BKMV builder
 * throws with precise messages — a field that would ship blank, a line of the wrong length,
 * a range spanning two tax years — and rewriting those into "ההפקה נכשלה" would throw away
 * the only thing that tells you which field.
 */

import { useMemo, useState } from "react"

type Company = { id: string; name: string; taxId: string }

type ReportPayload = {
  dealerNumber: string
  businessName: string
  directory: string
  periodMode: "range" | "taxYear"
  taxYear: string | null
  from: string
  to: string
  fromDDMMYYYY: string
  toDDMMYYYY: string
  recordRows: Array<{ code: string; description: string; count: number }>
  recordCount: number
  softwareName: string
  softwareRelease: string
  registrationNumber: string
  producedAtDate: string
  producedAtTime: string
}

type ExportResponse = {
  ok?: boolean
  storageKey?: string
  report?: ReportPayload
  stats?: { totalDocs: number; docsWithoutPaymentLines: number }
  excludedDocuments?: Array<{
    documentType: string
    documentNumber: string | number
    issueDate: string
    totalAmount: number | null
  }>
  notes?: unknown
  error?: string
  code?: string
}

const PRINT_CSS = `
@media print {
  /* The printed page is the report. Chrome, nav, controls and diagnostics are not. */
  nav, aside, header.app-chrome, footer, .no-print { display: none !important }
  body { background: #fff }
  table { page-break-inside: auto }
  tr { page-break-inside: avoid }
}
`.trim()

function currentTaxYear(): string {
  return String(new Date().getFullYear())
}

export function ExportClient({ companies }: { companies: Company[] }) {
  const [companyId, setCompanyId] = useState<string>(companies[0]?.id ?? "")

  /*
   * Range by default.
   *
   * Field 1011 declares software kind 2, multi-year, and page 20 gives the range as the
   * multi-year form. A tax year is offered too because the spec offers it, but a
   * multi-year product that opened on the single-year control would be declaring one thing
   * in the file and showing another on screen.
   */
  const [periodMode, setPeriodMode] = useState<"range" | "taxYear">("range")
  const year = currentTaxYear()
  const [from, setFrom] = useState<string>(`${year}-01-01`)
  const [to, setTo] = useState<string>(`${year}-12-31`)
  const [taxYear, setTaxYear] = useState<string>(year)

  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<ExportResponse | null>(null)
  const [transportError, setTransportError] = useState<string | null>(null)

  const selected = useMemo(
    () => companies.find((c) => c.id === companyId) ?? null,
    [companies, companyId]
  )

  async function run() {
    setBusy(true)
    setRes(null)
    setTransportError(null)
    try {
      const r = await fetch("/api/regulatory/bkmv/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          periodMode === "taxYear" ? { companyId, taxYear } : { companyId, from, to }
        ),
      })
      // Parsed regardless of status: the error body is the informative part.
      const json = (await r.json().catch(() => ({ error: `HTTP ${r.status}, no JSON body` }))) as ExportResponse
      setRes(json)
    } catch (e: any) {
      // A fetch that never reached the route. Distinguished from a route that answered.
      setTransportError(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  const report = res?.ok ? res.report : undefined
  const failed = res && !res.ok

  return (
    <main dir="rtl" className="mx-auto max-w-3xl px-4 py-8 print:px-0 print:py-0">
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="no-print">
        <h1 className="text-xl font-extrabold text-[#101B31]">הפקת קבצים במבנה אחיד</h1>
        <p className="mt-1 text-[13px] text-[#3A465F]">
          מודול הפקת הקבצים לפי הוראות רשות המסים, גרסה 1.31. מפיק את INI.TXT ואת BKMVDATA
          המכווץ, בתוך עץ התיקיות שההוראות מגדירות.
        </p>

        {companies.length === 0 ? (
          <p className="mt-6 rounded border border-[#E0B64A] bg-[#FFF4D6] p-3 text-[13px]">
            אין בית עסק המשויך לחשבון הזה, ולכן אין נתונים להפיק.
          </p>
        ) : (
          <section className="mt-6 rounded-lg border border-[#E1E7F1] p-4">
            <h2 className="mb-3 text-[15px] font-extrabold text-[#101B31]">פרטי ההפקה</h2>

            <div className="grid gap-4">
              {/*
                "בית העסק הנבחר (אם אין צורך בבחירה יופיע שם בית העסק באופן אוטומטי)"
                — page 20, implemented as written.
              */}
              <div>
                <span className="block text-[13px] font-bold text-[#101B31]">בית העסק</span>
                {companies.length === 1 ? (
                  <p className="mt-1 text-[13px]">
                    {companies[0].name || "—"}{" "}
                    <span className="text-[#78859B]" dir="ltr">
                      {companies[0].taxId}
                    </span>
                  </p>
                ) : (
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="mt-1 w-full rounded border border-[#C9D3E3] px-2 py-1.5 text-[13px]"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.taxId}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/*
                ⛔ "הכונן הרצוי למיקום שמירת הנתונים" — page 20.

                The spec was written in 2009 for installed software, and offers a list of the
                drives on the machine producing the files. There is no drive here, so this is
                not an input: the browser saves the archive and the destination is chosen in
                its own download dialog. Inventing a C:\ that does not exist would put a
                fabricated value in a regulatory report.
              */}
              <div>
                <span className="block text-[13px] font-bold text-[#101B31]">
                  מיקום שמירת הנתונים
                </span>
                <p className="mt-1 text-[13px] text-[#3A465F]">
                  הקבצים נשמרים בהורדה לדפדפן, ויעד השמירה נבחר בחלון ההורדה. עץ התיקיות
                  שההוראות מגדירות נבנה בתוך קובץ ה-ZIP.
                </p>
              </div>

              {/* "טווח תאריכים ... בתוכנה רב שנתית / או שנת המס ... בתוכנה חד שנתית" */}
              <div>
                <span className="block text-[13px] font-bold text-[#101B31]">התקופה</span>
                <div className="mt-1 flex flex-wrap gap-4 text-[13px]">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="periodMode"
                      checked={periodMode === "range"}
                      onChange={() => setPeriodMode("range")}
                    />
                    <span>טווח תאריכים</span>
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="periodMode"
                      checked={periodMode === "taxYear"}
                      onChange={() => setPeriodMode("taxYear")}
                    />
                    <span>שנת מס</span>
                  </label>
                </div>

                {periodMode === "range" ? (
                  <div className="mt-2 flex flex-wrap items-end gap-3 text-[13px]">
                    <label className="flex flex-col gap-1">
                      <span className="font-bold">מתאריך</span>
                      <input
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        className="rounded border border-[#C9D3E3] px-2 py-1"
                        dir="ltr"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="font-bold">עד תאריך</span>
                      <input
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        className="rounded border border-[#C9D3E3] px-2 py-1"
                        dir="ltr"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="mt-2 text-[13px]">
                    <label className="flex flex-col gap-1">
                      <span className="font-bold">שנת המס</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={taxYear}
                        onChange={(e) => setTaxYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        className="w-24 rounded border border-[#C9D3E3] px-2 py-1"
                        dir="ltr"
                      />
                    </label>
                  </div>
                )}

                {/*
                  Field 1023 in A000 holds a single tax year, so a range crossing 31/12 is
                  refused by the builder. Said here rather than discovered as a 400.
                */}
                <p className="mt-2 text-[12px] text-[#78859B]">
                  שדה 1023 בקובץ נושא שנת מס אחת, ולכן טווח שחוצה 31/12 יידחה בהפקה. יש
                  להפיק שנת מס אחת בכל פעם.
                </p>
              </div>

              <div>
                <button
                  type="button"
                  onClick={run}
                  disabled={busy || !companyId}
                  className="rounded bg-[#2C5679] px-5 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                >
                  {busy ? "מפיק…" : "הפקת קבצים"}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>

      {transportError ? (
        <section className="no-print mt-5 rounded border border-[#C0392B] bg-[#FDECEA] p-3 text-[13px]">
          <p className="font-bold">הבקשה לא הגיעה לשרת.</p>
          <pre className="mt-1 whitespace-pre-wrap break-all text-[12px]" dir="ltr">
            {transportError}
          </pre>
        </section>
      ) : null}

      {failed ? (
        <section className="no-print mt-5 rounded border border-[#C0392B] bg-[#FDECEA] p-3 text-[13px]">
          <p className="font-bold">ההפקה נכשלה. תשובת השרת כפי שהיא:</p>
          <pre className="mt-1 whitespace-pre-wrap break-all text-[12px]" dir="ltr">
            {JSON.stringify(res, null, 2)}
          </pre>
        </section>
      ) : null}

      {report ? (
        <>
          {/* ═══ The result screen, exactly the rows page 20 prints ═══ */}
          <section className="mt-6 rounded-lg border border-[#E1E7F1] p-5 print:rounded-none print:border-0 print:p-0">
            <h2 className="text-[16px] font-extrabold text-[#101B31]">
              הפקת קבצים במבנה אחיד עבור:
            </h2>

            <dl className="mt-3 grid gap-1 text-[13px]">
              <div>
                <dt className="inline font-bold">מספר עוסק מורשה: </dt>
                <dd className="inline" dir="ltr">
                  {report.dealerNumber || "—"}
                </dd>
              </div>
              <div>
                <dt className="inline font-bold">שם בית העסק: </dt>
                <dd className="inline">{report.businessName || "—"}</dd>
              </div>
            </dl>

            {/* The fixed text, word for word. */}
            <p className="mt-4 text-[14px] font-bold text-[#1E7A4B]">
              ביצוע ממשק פתוח הסתיים בהצלחה.
            </p>

            <div className="mt-4 text-[13px]">
              <p className="font-bold">הנתונים נשמרו בנתיב הבא:</p>
              <p className="mt-1 font-mono text-[13px]" dir="ltr">
                {report.directory}
              </p>
              {/*
                The explanatory line the user asked for. The spec's own example prefixes a
                drive letter and footnotes it as the drive the user chose; there is no drive
                in a web application, so the path is stated as what it actually is.
              */}
              <p className="mt-1 text-[12px] text-[#78859B]">
                זהו הנתיב שנבנה בתוך קובץ ה-ZIP שהורד. פתיחת הארכיב אל כונן יוצרת את עץ
                התיקיות הזה תחת אותו כונן.
              </p>
            </div>

            <div className="mt-4 text-[13px]">
              {report.periodMode === "taxYear" ? (
                <p>
                  <span className="font-bold">שנת המס עליה הופקו הנתונים: </span>
                  <span dir="ltr">{report.taxYear}</span>
                </p>
              ) : (
                <p>
                  <span className="font-bold">טווח תאריכים: </span>
                  מתאריך <span dir="ltr">{report.fromDDMMYYYY}</span> ועד תאריך{" "}
                  <span dir="ltr">{report.toDDMMYYYY}</span>
                </p>
              )}
            </div>

            <div className="mt-5 text-[13px]">
              <p className="font-bold">
                פירוט סך סוגי הרשומות (*) שנוצרו בקובץ BKMVDATA.TXT:
              </p>
              <table className="mt-2 w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b-2 border-[#101B31]">
                    <th className="py-1.5 text-start font-extrabold">קוד רשומה</th>
                    <th className="py-1.5 text-start font-extrabold">תיאור רשומה</th>
                    <th className="py-1.5 text-end font-extrabold">סך רשומות</th>
                  </tr>
                </thead>
                <tbody>
                  {report.recordRows.map((r) => (
                    <tr key={r.code} className="border-b border-[#E1E7F1]">
                      <td className="py-1.5" dir="ltr">
                        {r.code}
                      </td>
                      <td className="py-1.5">{r.description}</td>
                      <td className="py-1.5 text-end tabular-nums">
                        {r.count.toLocaleString("he-IL")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Page 20's footnote, verbatim. */}
              <p className="mt-1.5 text-[12px] text-[#78859B]">
                (*) הערה: השורה תופיע במידה וקיימות רשומות מסוג זה
              </p>
            </div>

            <div className="mt-5 text-[13px]">
              <p>
                <span className="font-bold">פירוט תוכנה ותאריך הפקה: </span>
                הנתונים הופקו באמצעות תוכנת {report.softwareName}, מספר תעודת הרישום:{" "}
                <span dir="ltr">{report.registrationNumber}</span> בתאריך{" "}
                <span dir="ltr">{report.producedAtDate}</span> בשעה{" "}
                <span dir="ltr">{report.producedAtTime}</span>.
              </p>
            </div>
          </section>

          <div className="no-print mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded border-2 border-[#2C5679] px-4 py-1.5 text-[13px] font-bold text-[#2C5679]"
            >
              הדפסת הדוח
            </button>
            {res?.storageKey ? (
              <a
                href={`/api/regulatory/bkmv/download?companyId=${encodeURIComponent(
                  companyId
                )}&key=${encodeURIComponent(res.storageKey)}`}
                className="rounded bg-[#2C5679] px-4 py-1.5 text-[13px] font-bold text-white"
              >
                הורדת הקבצים
              </a>
            ) : null}
          </div>

          {/* ═══ Ours, not appendix 4's. Screen only. ═══ */}
          <section className="no-print mt-6 rounded border border-[#E1E7F1] bg-[#F7F9FC] p-3 text-[12.5px]">
            <p className="font-bold text-[#101B31]">מעבר לנדרש בנספח 4 — לבדיקה שלנו</p>
            <p className="mt-1">
              סך רשומות בקובץ: <span dir="ltr">{report.recordCount}</span> · מסמכים:{" "}
              <span dir="ltr">{res?.stats?.totalDocs ?? "—"}</span> · מסמכים ללא שורת תשלום:{" "}
              <span dir="ltr">{res?.stats?.docsWithoutPaymentLines ?? "—"}</span> · מהדורה:{" "}
              <span dir="ltr">{report.softwareRelease}</span>
            </p>
            {res?.excludedDocuments && res.excludedDocuments.length > 0 ? (
              <div className="mt-2">
                <p className="font-bold">
                  ⚠️ מסמכים סופיים בטווח שאינם בקובץ (סוג שאינו ממופה לנספח 1):
                </p>
                <pre className="mt-1 whitespace-pre-wrap text-[11.5px]" dir="ltr">
                  {JSON.stringify(res.excludedDocuments, null, 2)}
                </pre>
              </div>
            ) : null}
            {res?.notes ? (
              <div className="mt-2">
                <p className="font-bold">שינויים שההפקה נדרשה לבצע כדי להתאים לפורמט:</p>
                <pre className="mt-1 whitespace-pre-wrap text-[11.5px]" dir="ltr">
                  {JSON.stringify(res.notes, null, 2)}
                </pre>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </main>
  )
}

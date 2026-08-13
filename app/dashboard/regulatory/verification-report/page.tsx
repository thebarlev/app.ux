/**
 * Section 2.6 — "פלטים לאימות נתונים", the document-count report.
 *
 * The spec (1.31, page 9) requires, for software with a document-issuing module:
 *
 *   "דוח שיכלול לגבי כל אחד מהמסמכים הכלולים בנספח מספר 1 את כמות המסמכים ואת הסך
 *    הכספי שלהם. אם המסמך לא מנוהל על ידי התוכנה יש למלא אפס."
 *
 * Four columns and twenty-seven rows, in the spec's own order and with its own column
 * headings. Not a list of what we issue — a statement about the whole table, which is why
 * twenty-two rows read zero.
 *
 * ── PRINTABLE, BECAUSE THE SPEC ASKS FOR PRINTABLE ──────────────────────────
 * 2.6 opens with "ניתן יהיה להפיק פלט חזותי לרבות הדפסה". The print rules below drop the
 * app chrome and the controls so a printed page is the report and nothing else.
 *
 * ── THE DATE RANGE ──────────────────────────────────────────────────────────
 * By issue_date, which is the date on the document, matching what the uniform file uses
 * for field 1230 and what the export route filters on. Defaults to the current tax year
 * so the page is useful before anyone touches a control.
 *
 * ⚠️ FINAL documents only. A draft is not a document that was issued, and counting drafts
 * would inflate a figure the registrar reads as issued output.
 */
import { createServiceRoleClient } from "@/lib/supabase/server"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { BKMV_APPENDIX_1 } from "@/lib/regulatory/bkmv/appendix1"
import { PrintButton } from "./PrintButton"

type Search = Promise<{ from?: string; to?: string; company?: string }>

function taxYearBounds(): { from: string; to: string } {
  const y = new Date().getUTCFullYear()
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

export default async function VerificationReportPage({ searchParams }: { searchParams?: Search }) {
  const sp = (await searchParams) ?? {}
  const bounds = taxYearBounds()
  const from = String(sp.from || bounds.from)
  const to = String(sp.to || bounds.to)

  // Identity from the session, never from the query string — the company whose books
  // these are is not something a URL parameter gets to choose.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?returnTo=/dashboard/regulatory/verification-report")

  const { data: companyRows } = await supabase.rpc("user_company_ids")
  const first = Array.isArray(companyRows) && companyRows.length > 0 ? companyRows[0] : null
  const companyId =
    typeof first === "string" ? first : (first as { company_id?: string })?.company_id ?? null

  let companyName = ""
  let companyTaxId = ""
  const counts = new Map<string, { qty: number; total: number }>()

  if (companyId) {
    const service = createServiceRoleClient()

    const { data: company } = await service
      .from("companies")
      .select("company_name, tax_id, registration_number")
      .eq("id", companyId)
      .maybeSingle()
    companyName = String((company as any)?.company_name || "")
    companyTaxId =
      String((company as any)?.tax_id || "").trim() ||
      String((company as any)?.registration_number || "").trim()

    /*
     * One query for every type, aggregated here rather than twenty-seven queries or a
     * database function. The row count is bounded by the company's own final documents in
     * one tax year, which is the same set the export already reads.
     */
    const { data: docs } = await service
      .from("documents")
      .select("document_type, total_amount")
      .eq("company_id", companyId)
      .eq("document_status", "final")
      .gte("issue_date", from)
      .lte("issue_date", to)

    for (const d of (docs || []) as any[]) {
      const t = String(d.document_type || "")
      const cur = counts.get(t) || { qty: 0, total: 0 }
      cur.qty += 1
      cur.total += Number(d.total_amount || 0)
      counts.set(t, cur)
    }
  }

  const rows = BKMV_APPENDIX_1.map((r) => {
    let qty = 0
    let total = 0
    for (const it of r.internalTypes) {
      const c = counts.get(it)
      if (c) {
        qty += c.qty
        total += c.total
      }
    }
    return { ...r, qty, total }
  })

  /*
   * ⚠️ Anything counted under a document_type that no appendix-1 row claims. It is shown
   * rather than dropped: a final document that belongs to no code is exactly the thing a
   * silent report would hide, and the registrar would find it before we did.
   */
  const claimed = new Set(BKMV_APPENDIX_1.flatMap((r) => r.internalTypes))
  const unclaimed = [...counts.entries()].filter(([t]) => !claimed.has(t))

  const money = (n: number) =>
    n.toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  return (
    <main dir="rtl" className="mx-auto max-w-4xl px-4 py-8 print:px-0 print:py-0">
      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
@media print {
  /* The printed page is the report. Chrome, nav and controls are not part of it. */
  nav, aside, header, footer, .no-print { display: none !important }
  body { background: #fff }
  table { page-break-inside: auto }
  tr { page-break-inside: avoid }
}`.trim(),
        }}
      />

      <header className="mb-6">
        <h1 className="text-xl font-extrabold text-[#101B31]">דוח לאימות נתונים · סעיף 2.6</h1>
        <p className="mt-1 text-[13px] text-[#3A465F]">
          כמות המסמכים והסך הכספי שלהם, לכל אחד מהמסמכים הכלולים בנספח מספר 1.
        </p>
        <dl className="mt-4 grid grid-cols-1 gap-1 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="inline font-bold">שם בית העסק: </dt>
            <dd className="inline">{companyName || "—"}</dd>
          </div>
          <div>
            <dt className="inline font-bold">מספר עוסק מורשה: </dt>
            <dd className="inline" dir="ltr">{companyTaxId || "—"}</dd>
          </div>
          <div>
            <dt className="inline font-bold">טווח תאריכים: </dt>
            <dd className="inline" dir="ltr">{from} — {to}</dd>
          </div>
        </dl>
      </header>

      <form method="get" className="no-print mb-5 flex flex-wrap items-end gap-3 text-[13px]">
        <label className="flex flex-col gap-1">
          <span className="font-bold">מתאריך</span>
          <input type="date" name="from" defaultValue={from} className="rounded border px-2 py-1" dir="ltr" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-bold">עד תאריך</span>
          <input type="date" name="to" defaultValue={to} className="rounded border px-2 py-1" dir="ltr" />
        </label>
        <button type="submit" className="rounded bg-[#2C5679] px-4 py-1.5 font-bold text-white">
          הצג
        </button>
      </form>

      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b-2 border-[#101B31] text-start">
            <th className="py-2 text-start font-extrabold">מספר המסמך</th>
            <th className="py-2 text-start font-extrabold">סוג המסמך</th>
            <th className="py-2 text-end font-extrabold">סה״כ כמותי</th>
            <th className="py-2 text-end font-extrabold">סה״כ כספי (בש״ח)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className={r.managed ? "border-b border-[#E1E7F1]" : "border-b border-[#F0F3F8] text-[#78859B]"}>
              <td className="py-1.5" dir="ltr">{r.code}</td>
              <td className="py-1.5">{r.name}</td>
              <td className="py-1.5 text-end tabular-nums">{money(r.qty)}</td>
              <td className="py-1.5 text-end tabular-nums">{money(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {unclaimed.length > 0 ? (
        <section className="mt-6 rounded border border-[#E0B64A] bg-[#FFF4D6] p-3 text-[12.5px]">
          <p className="font-bold">
            ⚠️ מסמכים סופיים שאינם משויכים לאף קוד בנספח 1 — אינם נכללים בדוח ואינם נכללים בקובץ האחיד:
          </p>
          <ul className="mt-1 list-inside list-disc">
            {unclaimed.map(([t, c]) => (
              <li key={t} dir="ltr">
                {t}: {c.qty} documents, {money(c.total)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-6 text-[12px] text-[#78859B]">
        נספר לפי תאריך המסמך, מסמכים סופיים בלבד. שורה בערך אפס היא סוג מסמך שאינו מנוהל על ידי התוכנה.
      </p>

      <div className="no-print mt-5">
        <PrintButton />
      </div>
    </main>
  )
}

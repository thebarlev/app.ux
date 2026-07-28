import Link from "next/link"
import { getDashboardData } from "@/lib/dashboard/data"
import { createClient } from "@/lib/supabase/server"
import { resolveCurrentCompanyId } from "@/lib/shaam/company"
import PurchaseTracker from "./PurchaseTracker"
import DashboardChainAction from "@/components/dashboard/DashboardChainAction"
import DocumentRowActions from "@/components/documents/DocumentRowActions"
import DocumentStatusBadge from "@/components/documents/DocumentStatusBadge"

export const dynamic = "force-dynamic"

// ── formatting helpers ──
function money(n: number, decimals = 0): string {
  return new Intl.NumberFormat("he-IL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n)
}
// Keeps the minus outside the ₪ sign, so a negative month reads "-₪500", not "₪-500".
function shekel(n: number, decimals = 0) {
  return (
    <>
      {n < 0 ? "-" : ""}
      <span className="dcx-cur">₪</span>
      {money(Math.abs(n), decimals)}
    </>
  )
}
function heDate(iso: string): string {
  if (!iso) return ""
  const [y, m, d] = iso.split("-")
  return `${Number(d)}.${Number(m)}.${y}`
}
function greeting(now: Date): string {
  const h = (now.getUTCHours() + 3) % 24 // approx Israel time
  if (h < 12) return "בוקר טוב"
  if (h < 18) return "צהריים טובים"
  return "ערב טוב"
}
const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"]
const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"]

async function getFirstName(): Promise<string> {
  try {
    const companyId = await resolveCurrentCompanyId()
    const supabase = await createClient()
    const { data } = await supabase.from("companies").select("contact_first_name").eq("id", companyId).maybeSingle()
    return String((data as any)?.contact_first_name || "").trim()
  } catch {
    return ""
  }
}

// Build the revenue chart SVG paths from 7 monthly values.
// Values may be negative (credits exceeding invoices); they are floored at zero
// for plotting only, so the line stays inside the viewBox. The figures shown to
// the user come from the raw values, not from these.
function buildChart(values: number[]) {
  const W = 640
  const H = 180
  const padTop = 20
  const padBottom = 30
  const n = values.length
  const plot = values.map((v) => Math.max(0, v))
  const max = Math.max(1, ...plot)
  const xs = plot.map((_, i) => (n === 1 ? W / 2 : 20 + (i * (W - 40)) / (n - 1)))
  const ys = plot.map((v) => padTop + (1 - v / max) * (H - padTop - padBottom))
  const line = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(0)},${ys[i].toFixed(0)}`).join(" ")
  const area = `${line} L${xs[n - 1].toFixed(0)},${(H - padBottom + 20).toFixed(0)} L${xs[0].toFixed(0)},${(H - padBottom + 20).toFixed(0)} Z`
  return { W, H, xs, ys, line, area, lastX: xs[n - 1], lastY: ys[n - 1] }
}

const SHAAM_MSG = {
  ok: (dateHe: string) => (
    <>
      מחובר לרשות המסים · בתוקף עד <b>{dateHe}</b>
    </>
  ),
  warn: (days: number) => (
    <>
      בעוד <b>{days} ימים</b> נצטרך להתחבר מחדש לרשות המסים
    </>
  ),
  expired: () => (
    <>
      החיבור לרשות המסים <b>פג</b>
    </>
  ),
  none: () => <>לא מחובר לרשות המסים</>,
}

export default async function DashboardPage() {
  const now = new Date()
  const [data, firstName] = await Promise.all([getDashboardData(now), getFirstName()])
  const { kpis, revenueByMonth, docsByMonth, recentDocs, shaam } = data

  const periodTotal = revenueByMonth.reduce((a, b) => a + b.value, 0)
  const chart = buildChart(revenueByMonth.map((r) => r.value))
  const docsTotalCount = docsByMonth.reduce((a, m) => a + m.count, 0)
  const maxMonthCount = Math.max(1, ...docsByMonth.map((m) => m.count))
  const israelDate = new Date(now.getTime() + 3 * 3600 * 1000)
  const dateLine = `יום ${WEEKDAYS[israelDate.getUTCDay()]}, ${israelDate.getUTCDate()} ב${MONTHS[israelDate.getUTCMonth()]} ${israelDate.getUTCFullYear()} · תמונת המצב של העסק`
  const refreshDateHe = shaam.refreshExpiresAt ? heDate(String(shaam.refreshExpiresAt).slice(0, 10)) : ""

  return (
    <div className="dcx-dash" dir="rtl">
      <style>{DASH_CSS}</style>
      <PurchaseTracker />

      <div className="dcx-headrow">
        <div className="dcx-hello">
          <h1>
            {greeting(now)}{firstName ? `, ${firstName}` : ""} 👋
          </h1>
          <p>{dateLine}</p>
        </div>
        {/* Hidden for an osek patur: they cannot issue the documents that need an
            allocation number, so a SHAAM connection has nothing to do with them. */}
        {shaam.applies ? (
          <div className="dcx-shaam" data-state={shaam.state}>
            <span className="dcx-dot" aria-hidden="true" />
            <span className="dcx-shaam-msg">
              {shaam.state === "ok" && SHAAM_MSG.ok(refreshDateHe)}
              {shaam.state === "warn" && SHAAM_MSG.warn(shaam.daysToRefreshExpiry ?? 0)}
              {shaam.state === "expired" && SHAAM_MSG.expired()}
              {shaam.state === "none" && SHAAM_MSG.none()}
            </span>
            {(shaam.state === "expired" || shaam.state === "none") && (
              <a className="dcx-btn-conn" href="/api/shaam/oauth/start">
                התחברות מחדש
              </a>
            )}
          </div>
        ) : null}
      </div>

      {/* KPIs */}
      <div className="dcx-kpis">
        <div className="dcx-kpi">
          <div className="dcx-k-top"><div className="dcx-k-ic">₪</div></div>
          <div className="dcx-k-val">{shekel(kpis.monthRevenue)}</div>
          <div className="dcx-k-lab">הכנסות החודש</div>
        </div>
        <div className="dcx-kpi">
          <div className="dcx-k-top"><div className="dcx-k-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg></div></div>
          <div className="dcx-k-val">{kpis.docsThisMonth}</div>
          <div className="dcx-k-lab">מסמכים שהופקו החודש</div>
        </div>
        <div className="dcx-kpi">
          <div className="dcx-k-top"><div className="dcx-k-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg></div><span className="dcx-trend flat">{kpis.allocationsThisMonth} מ־{kpis.docsThisMonth}</span></div>
          <div className="dcx-k-val">{kpis.allocationsThisMonth}</div>
          <div className="dcx-k-lab">מספרי הקצאה שהתקבלו</div>
        </div>
        <div className="dcx-kpi">
          <div className="dcx-k-top"><div className="dcx-k-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg></div>{kpis.pendingCount > 0 && <span className="dcx-trend flat">{kpis.pendingCount} מסמכים</span>}</div>
          <div className="dcx-k-val">{shekel(kpis.pendingPayment)}</div>
          <div className="dcx-k-lab">ממתין לתשלום</div>
        </div>
      </div>

      {/* charts */}
      <div className="dcx-grid2">
        <div className="dcx-panel">
          <div className="dcx-panel-head">
            <div><h3>הכנסות ב־7 החודשים האחרונים</h3><div className="dcx-sub">כולל מע״מ</div></div>
            <div className="dcx-legend">סה״כ תקופה <b>{periodTotal < 0 ? "-" : ""}₪ {money(Math.abs(periodTotal))}</b></div>
          </div>
          <svg className="dcx-chart" viewBox={`0 0 ${chart.W} ${chart.H}`} preserveAspectRatio="none" role="img" aria-label="גרף הכנסות חודשי">
            <defs><linearGradient id="dcxg1" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#5389BB" stopOpacity=".35" /><stop offset="1" stopColor="#5389BB" stopOpacity="0" /></linearGradient></defs>
            <path className="dcx-area" d={chart.area} />
            <path className="dcx-line" d={chart.line} />
            <circle className="dcx-cdot" cx={chart.lastX} cy={chart.lastY} r="5" />
            <g className="dcx-xlab">
              {revenueByMonth.map((r, i) => (
                <text key={i} x={chart.xs[i]} y={chart.H - 8} textAnchor="middle">{r.label}</text>
              ))}
            </g>
          </svg>
        </div>
        <div className="dcx-panel">
          <h3>מסמכים לפי חודש</h3><div className="dcx-sub">כמות: כל המסמכים · ₪: הכנסה נטו · 7 החודשים האחרונים</div>
          <div className="dcx-mon">
            {docsTotalCount === 0 && <div className="dcx-empty">עדיין לא הופקו מסמכים</div>}
            {docsTotalCount > 0 && docsByMonth.map((m, i) => (
              <div className="dcx-mon-row" key={i}>
                <span className="dcx-mon-lab">{m.label}</span>
                <span className="dcx-mon-cnt">{m.count}</span>
                <div className="dcx-mon-track">
                  <i style={{ width: `${Math.round((m.count / maxMonthCount) * 100)}%` }} />
                </div>
                {/* credits can push a month negative — keep the sign outside the ₪ */}
                <span className="dcx-mon-amt">{m.amount < 0 ? "-" : ""}₪{money(Math.abs(m.amount))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* recent documents */}
      <div className="dcx-panel">
        <div className="dcx-panel-head"><div><h3>מסמכים אחרונים</h3><div className="dcx-sub">כולל מספרי הקצאה מרשות המסים</div></div></div>
        <div className="dcx-table-wrap">
          <table className="dcx-tbl">
            <thead><tr><th className="dcx-cust">לקוח</th><th>סוג ומספר מסמך</th><th>מספר הקצאה</th><th>סכום</th><th>סטטוס</th><th>תאריך</th><th className="dcx-act-col">פעולות</th></tr></thead>
            <tbody>
              {recentDocs.length === 0 && (
                <tr><td colSpan={7} className="dcx-empty">עדיין אין מסמכים</td></tr>
              )}
              {recentDocs.map((d) => (
                <tr key={d.id}>
                  <td className="dcx-cust">{d.customerId ? <Link className="dcx-lnk" href={`/dashboard/customers/${d.customerId}`}>{d.customerName || "—"}</Link> : <span>{d.customerName || "—"}</span>}</td>
                  <td><Link className="dcx-lnk dcx-doc-c" href={d.href || "/dashboard/documents/income"}>{d.typeLabel} {d.number}</Link></td>
                  <td className={`dcx-alloc${d.allocationNumber ? "" : " none"}`}>{d.allocationNumber || ""}</td>
                  <td className="dcx-numc">₪{money(d.total, 2)}</td>
                  <td><DocumentStatusBadge documentType={d.type} status={d.status} /></td>
                  <td className="dcx-numc">{heDate(d.date)}</td>
                  <td className="dcx-act">
                    <DocumentRowActions
                      className="dcx-act-icons"
                      viewHref={d.href}
                      downloadHref={d.pdfHref}
                      chainSlot={
                        d.chainSource ? (
                          <DashboardChainAction
                            source={d.chainSource}
                            sourceTypeLabel={d.typeLabel}
                            variant="icon"
                          />
                        ) : null
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const DASH_CSS = `
.dcx-dash{--dcx-accent:#5389BB;--dcx-accent-soft:#EAF1F8;--dcx-ink:#22283A;--dcx-ink-2:#3A4155;--dcx-muted:#8A90A0;--dcx-line:#E9ECF2;
  --dcx-ok:#2E9E6B;--dcx-ok-soft:#E7F5EE;--dcx-amber:#E0930B;--dcx-amber-soft:#FCF3E1;--dcx-red:#D64545;--dcx-red-soft:#FBEBEB;
  --dcx-radius:16px;--dcx-shadow:0 1px 2px rgba(20,24,45,.04),0 6px 18px rgba(20,24,45,.05);
  background:#fff;color:var(--dcx-ink);padding:24px 30px 56px;font-family:'Assistant',system-ui,Arial,sans-serif;line-height:1.5;max-width:100%}
.dcx-headrow{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:22px}
.dcx-hello h1{font-size:25px;font-weight:800;letter-spacing:-.02em}
.dcx-hello p{color:var(--dcx-muted);font-size:14.5px;margin-top:2px}
.dcx-shaam{display:inline-flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--dcx-line);border-radius:12px;padding:10px 14px;box-shadow:var(--dcx-shadow);font-size:13.5px;font-weight:600;max-width:360px}
.dcx-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.dcx-shaam-msg{color:var(--dcx-ink-2)}.dcx-shaam-msg b{color:var(--dcx-ink);font-weight:800}
.dcx-btn-conn{border:none;cursor:pointer;font-family:inherit;font-weight:700;font-size:13px;background:var(--dcx-accent);color:#fff;border-radius:9px;padding:8px 13px;white-space:nowrap;text-decoration:none}
.dcx-shaam[data-state="ok"]{border-color:#CDE7DA}.dcx-shaam[data-state="ok"] .dcx-dot{background:var(--dcx-ok)}
.dcx-shaam[data-state="warn"]{border-color:#F1D89C;background:var(--dcx-amber-soft)}.dcx-shaam[data-state="warn"] .dcx-dot{background:var(--dcx-amber)}
.dcx-shaam[data-state="expired"],.dcx-shaam[data-state="none"]{border-color:#F0C4C4;background:var(--dcx-red-soft)}
.dcx-shaam[data-state="expired"] .dcx-dot,.dcx-shaam[data-state="none"] .dcx-dot{background:var(--dcx-red)}
.dcx-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-bottom:20px}
.dcx-kpi{background:#fff;border:1px solid var(--dcx-line);border-radius:var(--dcx-radius);padding:16px 16px 14px;box-shadow:var(--dcx-shadow);min-width:0}
.dcx-k-top{display:flex;align-items:center;justify-content:space-between;min-height:36px}
.dcx-k-ic{width:36px;height:36px;border-radius:10px;background:var(--dcx-accent-soft);color:var(--dcx-accent);display:grid;place-items:center;font-weight:800}
.dcx-k-ic svg{width:19px;height:19px}
.dcx-k-val{font-size:26px;font-weight:800;margin-top:11px;letter-spacing:-.02em}
.dcx-cur{font-size:50%;font-weight:700;color:var(--dcx-muted);margin-inline-end:4px;vertical-align:2px}
.dcx-k-lab{color:var(--dcx-muted);font-size:13.5px;margin-top:1px}
.dcx-trend{font-size:12px;font-weight:700;padding:3px 8px;border-radius:20px;background:#EEF0F4;color:var(--dcx-muted)}
.dcx-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-bottom:20px}
.dcx-panel{background:#fff;border:1px solid var(--dcx-line);border-radius:var(--dcx-radius);padding:18px 20px;box-shadow:var(--dcx-shadow);min-width:0}
.dcx-panel h3{font-size:15.5px;font-weight:800}.dcx-panel .dcx-sub{color:var(--dcx-muted);font-size:12.5px;margin-bottom:12px}
.dcx-panel-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:10px;flex-wrap:wrap}
.dcx-legend{font-size:12px;color:var(--dcx-muted)}.dcx-legend b{color:var(--dcx-ink)}
.dcx-chart{width:100%;height:180px;overflow:visible}
.dcx-area{fill:url(#dcxg1);opacity:.5}
.dcx-line{fill:none;stroke:var(--dcx-accent);stroke-width:3;stroke-linecap:round;stroke-dasharray:1400;stroke-dashoffset:1400;animation:dcxdraw 1.6s ease forwards}
@keyframes dcxdraw{to{stroke-dashoffset:0}}
.dcx-cdot{fill:#fff;stroke:var(--dcx-accent);stroke-width:3}.dcx-xlab text{font-size:11px;fill:var(--dcx-muted)}
.dcx-mon{display:flex;flex-direction:column;gap:10px;margin-top:6px}
.dcx-mon-row{display:flex;align-items:center;gap:10px;font-size:14px}
.dcx-mon-lab{width:42px;flex-shrink:0;color:var(--dcx-ink);font-weight:600}
.dcx-mon-cnt{width:26px;flex-shrink:0;text-align:left;color:var(--dcx-ink);font-weight:800;font-variant-numeric:tabular-nums}
.dcx-mon-track{flex:1;height:10px;background:var(--dcx-line);border-radius:8px;overflow:hidden;min-width:32px}
.dcx-mon-track i{display:block;height:100%;border-radius:8px;background:var(--dcx-accent);transform-origin:right;animation:dcxgrow 1s ease}
@keyframes dcxgrow{from{transform:scaleX(0)}}
.dcx-mon-amt{width:96px;flex-shrink:0;text-align:left;color:var(--dcx-ink-2);font-weight:700;font-size:13px;
  font-variant-numeric:tabular-nums;direction:ltr;white-space:nowrap}
.dcx-empty{color:var(--dcx-muted);font-size:13.5px;padding:14px 4px;text-align:center}
.dcx-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.dcx-tbl{width:100%;border-collapse:collapse;font-size:14px;min-width:620px}
/* The header was already font-weight:600 — what made it read thin was the
   muted grey at 12.5px, not the weight. Darkened to the body-cell ink so the
   600 actually shows; revert this one colour to go back. */
.dcx-tbl th{text-align:right;color:var(--dcx-ink-2);font-weight:600;font-size:12.5px;padding:9px 12px;border-bottom:1px solid var(--dcx-line);white-space:nowrap}
/* Every cell's text is 16px. Sub-elements below that set their own size
   (the status pill) are bumped to match, so the whole row reads uniformly. */
.dcx-tbl td{padding:13px 12px;border-bottom:1px solid var(--dcx-line);color:var(--dcx-ink-2);white-space:nowrap;font-size:16px}
.dcx-tbl tr:last-child td{border-bottom:none}
.dcx-tbl tbody tr{transition:.12s}.dcx-tbl tbody tr:hover{background:#F7F9FC}
.dcx-lnk{color:var(--dcx-ink);font-weight:700;text-decoration:none}.dcx-tbl tbody tr:hover .dcx-lnk{color:var(--dcx-accent);text-decoration:underline}
/* customer column leads and gets the room long names need; doc type/number is not emphasised */
.dcx-tbl th.dcx-cust,.dcx-tbl td.dcx-cust{min-width:240px;max-width:340px;white-space:normal;word-break:break-word}
.dcx-tbl .dcx-doc-c{font-weight:500;color:var(--dcx-ink-2)}
.dcx-numc{font-variant-numeric:tabular-nums;direction:ltr;text-align:right}
.dcx-alloc{font-variant-numeric:tabular-nums;direction:ltr;text-align:right;font-weight:700;color:var(--dcx-ink)}
.dcx-alloc.none{color:var(--dcx-muted);font-weight:600}
/* The status pill comes from DocumentStatusBadge, the same element the
   ניהול שוטף list renders, so .dcx-st is gone rather than kept in parallel. */
.dcx-act{white-space:nowrap}
.dcx-act-btn{background:none;border:0;padding:0;cursor:pointer;font:inherit}
/* Icon actions, matching the documents list. Unlike that list the icons are
   always visible here: dashboard rows are not hover-revealed. */
.dcx-act-icons{display:flex;align-items:center;justify-content:flex-end;gap:8px}
/* Hairline setting the actions cluster apart from the data columns. Same
   --dcx-line as the row rules, so it reads as structure rather than emphasis.
   inline-start is the right-hand edge under RTL — the side facing the row. */
.dcx-tbl th.dcx-act-col,.dcx-tbl td.dcx-act{border-inline-start:1px solid var(--dcx-line)}
@media(max-width:900px){
  .dcx-dash{padding:16px 16px 24px}
  .dcx-hello h1{font-size:23px}
  .dcx-shaam{max-width:100%}
  .dcx-kpis{grid-template-columns:repeat(2,1fr)}
  .dcx-kpi{padding:14px 13px}.dcx-k-val{font-size:21px}
}
@media(prefers-reduced-motion:reduce){
  .dcx-line{animation:none;stroke-dashoffset:0}.dcx-mon-track i{animation:none}
}
`

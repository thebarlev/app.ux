import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { isSystemAdmin } from "@/lib/security/system-admin"
import { AuditorDashboardScanClient } from "@/components/auditor/AuditorDashboardScanClient"
import { ScanHistorySection } from "@/components/auditor/dashboard/ScanHistorySection"
import { getDashboardStrings } from "@/lib/auditor/dashboard-strings"
// ─── Inline premium UI primitives ─────────────────────────────────────────────

function ScoreRing({ value, label, color, trackColor }: { value: number; label: string; color: string; trackColor: string }) {
  const r = 28
  const circ = 2 * Math.PI * r
  const progress = Math.min(Math.max(value, 0), 100)
  const dash = (progress / 100) * circ

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex items-center justify-center" style={{ width: 76, height: 76 }}>
        <svg width="76" height="76" viewBox="0 0 76 76" fill="none" className="absolute inset-0 rotate-[-90deg]">
          <circle cx="38" cy="38" r={r} stroke={trackColor} strokeWidth="5" fill="none" />
          <circle
            cx="38" cy="38" r={r}
            stroke={color} strokeWidth="5" fill="none" strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            style={{ transition: "stroke-dasharray 1s ease" }}
          />
        </svg>
        <span className="relative z-10 font-mono text-lg font-bold tabular-nums" style={{ color }}>
          {value}
        </span>
      </div>
      <span className="text-center text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        {label}
      </span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AuditorDashboardPage() {
  const t = getDashboardStrings("he")
  const supabase = await createClient()
  const { data: companyRows } = await supabase.rpc("user_company_ids")
  const first = Array.isArray(companyRows) && companyRows.length > 0 ? companyRows[0] : null
  const companyId =
    first != null
      ? typeof first === "string"
        ? first
        : (first as { company_id?: string })?.company_id ?? null
      : null
  const canViewFullReport = await isSystemAdmin()

  let lastScan: { id: string; report_public: any; normalized_host: string } | null = null
  let scans: any[] = []

  if (companyId) {
    const { data } = await supabase
      .from("auditor_scans")
      .select("id,status,step,normalized_host,created_at,finished_at,report_public")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(50)
    scans = data || []
    lastScan = scans.find((s) => s.status === "done") ?? null
  }

  const rp = lastScan?.report_public && typeof lastScan.report_public === "object" ? lastScan.report_public : {}
  const scoreTotal  = typeof rp.score_total  === "number" ? rp.score_total  : null
  const scoreSearch = typeof rp.score_search === "number" ? rp.score_search : null
  const scoreAi     = typeof rp.score_ai     === "number" ? rp.score_ai     : null

  return (
    <div
      dir="rtl"
      className="relative min-h-screen space-y-6 px-4 py-8 sm:px-8 lg:px-12"
      style={{ background: "#f8fafc" }}
    >
      {/* Subtle top gradient accent */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-64"
        style={{ background: "linear-gradient(180deg, rgba(99,102,241,0.04) 0%, transparent 100%)" }}
      />

      {/* ── Header ── */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl"
            style={{ letterSpacing: "-0.02em" }}
          >
            {t.title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t.tagline}</p>
        </div>
        {lastScan && (
          <div
            className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium text-slate-500"
            style={{ borderColor: "#e2e8f0", background: "#ffffff" }}
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            {lastScan.normalized_host}
          </div>
        )}
      </header>

      {/* ── Scan trigger ── */}
      <section
        className="overflow-hidden rounded-xl border p-6 transition-all duration-200 hover:shadow-md"
        style={{ borderColor: "#e2e8f0", background: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
      >
        <AuditorDashboardScanClient locale="he" basePath="/auditor" />
      </section>

      {/* ── Last scan scores ── */}
      {lastScan ? (
   <section
   className="relative overflow-hidden rounded-3xl border p-8 sm:p-10 transition-all duration-300 hover:shadow-xl"
   style={{
     borderColor: "#e0e7ff",
     background:
       "linear-gradient(135deg, #f8fafc 0%, #eef2ff 40%, #ecfdf5 100%)",
     boxShadow: "0 4px 16px rgba(99,102,241,0.08)",
   }}
 >
          {/* Decorative corner blur */}
          <div
            aria-hidden
            className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(99,102,241,0.07), transparent 70%)" }}
          />

          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{t.lastScanScore}</p>
              <p className="mt-1 font-mono text-sm text-slate-500">{lastScan.normalized_host}</p>
            </div>
            <div className="flex flex-wrap items-center gap-6 sm:gap-10">
              {scoreTotal  !== null && <ScoreRing value={scoreTotal}  label={t.overallScore}     color="#6366f1" trackColor="#e0e7ff" />}
              {scoreSearch !== null && <ScoreRing value={scoreSearch} label={t.searchVisibility} color="#059669" trackColor="#d1fae5" />}
              {scoreAi     !== null && <ScoreRing value={scoreAi}     label={t.aiReadiness}      color="#d97706" trackColor="#fef3c7" />}
            </div>
          </div>

          {canViewFullReport && (
            <div className="relative mt-6 flex justify-end">
              <Link href={`/auditor/dashboard/scan/${lastScan.id}`}>
              <button
  className="group flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all duration-300 hover:shadow-xl hover:gap-3 active:scale-[0.98]"                  style={{
                    background: "linear-gradient(135deg, #6366f1, #818cf8)",
                    color: "#ffffff",
                    boxShadow: "0 2px 8px rgba(99,102,241,0.3)",
                  }}
                >
                  {t.viewFullReport}
                  <span className="transition-transform duration-200 group-hover:translate-x-0.5">←</span>
                </button>
              </Link>
            </div>
          )}
        </section>
      ) : (
        <section
          className="rounded-xl border p-8 text-center transition-all duration-200 hover:shadow-md"
          style={{ borderColor: "#e2e8f0", background: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
        >
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-2xl"
            style={{ background: "#f1f5f9" }}
          >
            🔍
          </div>
          <p className="text-sm text-slate-500">{t.noScanYet}</p>
        </section>
      )}

      {/* ── No company ── */}
      {!companyId ? (
        <section
          className="rounded-xl border p-6 transition-all duration-200"
          style={{ borderColor: "#fde68a", background: "#fffbeb" }}
        >
          <p className="mb-1 text-sm font-bold text-amber-700">{t.noActiveCompany}</p>
          <p className="text-xs text-amber-600">{t.noActiveCompanyDesc}</p>
        </section>
      ) : scans.length > 0 ? (
        <ScanHistorySection scans={scans} t={t} dir="rtl" />
      ) : null}
    </div>
  )
}
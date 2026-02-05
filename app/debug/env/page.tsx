import CopyEnvVarNamesButton from "./CopyEnvVarNamesButton"
import { notFound } from "next/navigation"
import { requireSystemAdmin } from "@/lib/security/system-admin"

function maskKey(value: string) {
  if (!value) return ""
  if (value.length <= 10) return `${value.slice(0, 2)}…${value.slice(-2)}`
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

function extractDomain(url: string) {
  try {
    const u = new URL(url)
    return u.host
  } catch {
    // best-effort: strip protocol if present
    return url.replace(/^https?:\/\//, "").split("/")[0]
  }
}

function Row({
  label,
  present,
  preview,
}: {
  label: string
  present: boolean
  preview: string
}) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-[280px_140px_1fr] md:items-center border-b border-sidebar-border py-3">
      <div className="text-right font-medium" style={{ color: "var(--fg)" }}>
        {label}
      </div>
      <div className="text-right">
        <span
          className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium"
          style={{
            backgroundColor: present ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
            color: present ? "var(--success-fg)" : "var(--danger-fg)",
          }}
        >
          {present ? "קיים" : "חסר"}
        </span>
      </div>
      <div className="text-right font-mono text-sm" style={{ color: "var(--muted-fg)" }}>
        {preview || "—"}
      </div>
    </div>
  )
}

export default async function EnvDebugPage() {
  // Hard-disable in production (no client-accessible env surfaces).
  if (process.env.NODE_ENV === "production") notFound()

  // Non-prod: system-admin only.
  await requireSystemAdmin()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

  return (
    <main dir="rtl" className="min-h-screen" style={{ backgroundColor: "var(--bg)" }}>
      <div className="ui-container pt-10">
        <div className="mb-8">
          <h1 className="text-right mb-2">Env Setup</h1>
          <p className="text-right" style={{ color: "var(--muted-fg)" }}>
            Go to Supabase Dashboard → Project Settings → API and copy Project URL, anon key, service_role key into{" "}
            <span className="font-mono">.env.local</span> (ול-Vercel Environment Variables בפרודקשן).
          </p>
        </div>

        <div
          className="mb-6 rounded-xl border p-4 text-right"
          style={{ borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", color: "var(--fg)" }}
        >
          <div className="font-semibold mb-1">אזהרה</div>
          <div style={{ color: "var(--muted-fg)" }}>
            אל תדביק מפתחות בקוד לקוח. מפתחות חייבים להישאר בקבצי env וב-Environment Variables של Vercel.
            <br />
            בעמוד הזה מוצגים רק ערכים מוסווים (לא סודות מלאים).
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-right" style={{ color: "var(--muted-fg)" }}>
            העתק שמות משתנים להדבקה מהירה:
          </div>
          <CopyEnvVarNamesButton />
        </div>

        <div className="rounded-2xl border bg-white" style={{ borderColor: "var(--sidebar-border)" }}>
          <div className="p-4 text-right font-semibold" style={{ color: "var(--fg)" }}>
            משתני סביבה
          </div>
          <div className="px-4 pb-2">
            <Row
              label="NEXT_PUBLIC_SUPABASE_URL"
              present={!!url}
              preview={url ? extractDomain(url) : ""}
            />
            <Row
              label="NEXT_PUBLIC_SUPABASE_ANON_KEY"
              present={!!anon}
              preview={anon ? maskKey(anon) : ""}
            />
            <Row
              label="SUPABASE_SERVICE_ROLE_KEY"
              present={!!service}
              preview={service ? maskKey(service) : ""}
            />
          </div>
        </div>
      </div>
    </main>
  )
}


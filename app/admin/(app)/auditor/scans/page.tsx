import { createServiceRoleClient } from "@/lib/supabase/server"
import { AdminAuditorScansTableWrapper } from "./ScansTableWrapper"

export const dynamic = "force-dynamic"

interface SearchParams {
  status?: string
  kind?: string
  cursor?: string
}

export default async function AdminAuditorScansPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const admin = createServiceRoleClient()
  const LIMIT = 50

  let q = admin
    .from("auditor_scans")
    .select("id,hostname,status,step,score_total,created_at,scan_kind,lead_email_normalized")
    .order("created_at", { ascending: false })
    .limit(LIMIT + 1) // fetch one extra to detect hasMore

  if (searchParams.status) q = q.eq("status", searchParams.status) as any
  if (searchParams.kind) q = q.eq("scan_kind", searchParams.kind) as any
  if (searchParams.cursor) q = q.lt("created_at", searchParams.cursor) as any

  const { data: rawScans, error } = await q

  const scans = (rawScans ?? []).slice(0, LIMIT)
  const hasMore = (rawScans ?? []).length > LIMIT

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Scan Explorer</h1>
        <p className="mt-1 text-slate-500">
          Browse, filter, and inspect all Auditor scans.
        </p>
        {error && (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Error loading scans: {error.message}
          </div>
        )}
      </div>

      <AdminAuditorScansTableWrapper
        scans={scans as any}
        status={searchParams.status}
        kind={searchParams.kind}
        cursor={searchParams.cursor}
        hasMore={hasMore}
      />
    </div>
  )
}

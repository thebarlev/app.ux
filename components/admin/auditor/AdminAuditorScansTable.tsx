"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { ExternalLink, RefreshCw, Trash2, XCircle } from "lucide-react"

export interface ScanRow {
  id: string
  hostname: string | null
  status: string
  step: string
  score_total: number | null
  created_at: string
  scan_kind: string
  lead_email_normalized: string | null
}

const STATUS_COLORS: Record<string, string> = {
  done: "bg-emerald-100 text-emerald-700",
  running: "bg-blue-100 text-blue-700",
  queued: "bg-slate-100 text-slate-600",
  failed: "bg-red-100 text-red-700",
}

const KIND_COLORS: Record<string, string> = {
  initial: "bg-violet-100 text-violet-700",
  verification: "bg-amber-100 text-amber-700",
  scheduled: "bg-sky-100 text-sky-700",
}

function StatusBadge({ value, map }: { value: string; map: Record<string, string> }) {
  const cls = map[value] ?? "bg-slate-100 text-slate-600"
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{value}</span>
}

export function AdminAuditorScansTable({
  scans,
  status,
  kind,
  cursor,
  hasMore,
  onRetry,
  onCancel,
  onDelete,
  onDeleteMany,
}: {
  scans: ScanRow[]
  status?: string
  kind?: string
  cursor?: string
  hasMore: boolean
  onRetry?: (scanId: string) => void
  onCancel?: (scanId: string) => void
  onDelete?: (scanId: string) => void
  onDeleteMany?: (scanIds: string[]) => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const buildUrl = useCallback(
    (params: Record<string, string | undefined>) => {
      const p = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(params)) {
        if (v == null) p.delete(k)
        else p.set(k, v)
      }
      return `${pathname}?${p.toString()}`
    },
    [pathname, searchParams],
  )

  useEffect(() => {
    setSelectedIds([])
  }, [scans])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const allVisibleSelected = scans.length > 0 && scans.every((scan) => selectedSet.has(scan.id))

  const toggleSelected = useCallback((scanId: string, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) return current.includes(scanId) ? current : [...current, scanId]
      return current.filter((id) => id !== scanId)
    })
  }, [])

  const toggleSelectAll = useCallback((checked: boolean) => {
    setSelectedIds(checked ? scans.map((scan) => scan.id) : [])
  }, [scans])

  const handleDeleteSelected = useCallback(() => {
    if (!onDeleteMany || selectedIds.length === 0) return
    if (!window.confirm(`Delete ${selectedIds.length} scan(s) from the database? This action cannot be undone.`)) return
    onDeleteMany(selectedIds)
    setSelectedIds([])
  }, [onDeleteMany, selectedIds])

  const filterOptions = {
    status: ["", "queued", "running", "done", "failed"],
    kind: ["", "initial", "verification", "scheduled"],
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <span className="text-sm font-medium text-slate-600">Filter:</span>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Status</label>
          <select
            value={status ?? ""}
            onChange={(e) => router.push(buildUrl({ status: e.target.value || undefined, cursor: undefined }))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {filterOptions.status.map((s) => (
              <option key={s} value={s}>{s || "All statuses"}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Kind</label>
          <select
            value={kind ?? ""}
            onChange={(e) => router.push(buildUrl({ kind: e.target.value || undefined, cursor: undefined }))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {filterOptions.kind.map((k) => (
              <option key={k} value={k}>{k || "All kinds"}</option>
            ))}
          </select>
        </div>
        {(status || kind) && (
          <button
            onClick={() => router.push(buildUrl({ status: undefined, kind: undefined, cursor: undefined }))}
            className="text-xs text-slate-500 underline hover:text-slate-800"
          >
            Clear filters
          </button>
        )}
        {onDeleteMany && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto h-8 gap-1 text-red-600 hover:text-red-700"
            disabled={selectedIds.length === 0}
            onClick={handleDeleteSelected}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete selected ({selectedIds.length})
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    aria-label="Select all scans"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Host</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Step</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Kind</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Score</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Created</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scans.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">No scans found</td>
                </tr>
              ) : (
                scans.map((scan) => (
                  <tr key={scan.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select scan ${scan.id}`}
                        checked={selectedSet.has(scan.id)}
                        onChange={(e) => toggleSelected(scan.id, e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{scan.hostname ?? <span className="text-slate-400">—</span>}</div>
                      {scan.lead_email_normalized && (
                        <div className="text-xs text-slate-400 mt-0.5">{scan.lead_email_normalized}</div>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusBadge value={scan.status} map={STATUS_COLORS} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{scan.step}</td>
                    <td className="px-4 py-3"><StatusBadge value={scan.scan_kind} map={KIND_COLORS} /></td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-slate-700">
                      {scan.score_total != null ? scan.score_total : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 tabular-nums">
                      {new Date(scan.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/admin/auditor/scans/${scan.id}`}>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1">
                            <ExternalLink className="h-3 w-3" />View
                          </Button>
                        </Link>
                        {scan.status === "failed" && onRetry && (
                          <Button
                            variant="outline" size="sm"
                            className="h-7 px-2 text-xs gap-1 text-blue-600 hover:text-blue-700"
                            onClick={() => onRetry(scan.id)}
                          >
                            <RefreshCw className="h-3 w-3" />Retry
                          </Button>
                        )}
                        {scan.status === "running" && onCancel && (
                          <Button
                            variant="outline" size="sm"
                            className="h-7 px-2 text-xs gap-1 text-red-600 hover:text-red-700"
                            onClick={() => onCancel(scan.id)}
                          >
                            <XCircle className="h-3 w-3" />Cancel
                          </Button>
                        )}
                        {onDelete && (
                          <Button
                            variant="outline" size="sm"
                            className="h-7 px-2 text-xs gap-1 text-red-600 hover:text-red-700"
                            onClick={() => {
                              if (!window.confirm("Delete this scan from the database? This action cannot be undone.")) return
                              onDelete(scan.id)
                            }}
                          >
                            <Trash2 className="h-3 w-3" />Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{scans.length} scans shown</p>
        <div className="flex gap-2">
          {cursor && (
            <Link href={buildUrl({ cursor: undefined })}>
              <Button variant="outline" size="sm">← First page</Button>
            </Link>
          )}
          {hasMore && scans.length > 0 && (
            <Link href={buildUrl({ cursor: scans[scans.length - 1].created_at })}>
              <Button variant="outline" size="sm">Next page →</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

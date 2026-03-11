"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

export interface PageRow {
  id: string
  url: string
  state: string
  status_code: number | null
  title: string | null
  content_bytes: number | null
  fetch_ms: number | null
  error: string | null
  html?: string | null
  meta_description?: string | null
  canonical?: string | null
  lang?: string | null
  has_og?: boolean | null
  has_twitter?: boolean | null
}

const STATE_COLORS: Record<string, string> = {
  fetched: "bg-emerald-100 text-emerald-700",
  extracted: "bg-blue-100 text-blue-700",
  queued: "bg-slate-100 text-slate-500",
  skipped: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
}

function formatBytes(b: number | null): string {
  if (b == null) return "—"
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function PageDetail({ page }: { page: PageRow }) {
  return (
    <div className="px-4 pb-4 pt-2 bg-slate-50 space-y-3 text-xs">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {page.meta_description && (
          <div className="col-span-2"><span className="text-slate-400 block">Meta description</span><p className="text-slate-700">{page.meta_description}</p></div>
        )}
        {page.canonical && (
          <div><span className="text-slate-400 block">Canonical</span><p className="font-mono text-slate-700 break-all">{page.canonical}</p></div>
        )}
        <div><span className="text-slate-400 block">Lang</span><p className="text-slate-700">{page.lang ?? "—"}</p></div>
        <div><span className="text-slate-400 block">OG tags</span><p className="text-slate-700">{page.has_og ? "Yes" : "No"}</p></div>
        <div><span className="text-slate-400 block">Twitter tags</span><p className="text-slate-700">{page.has_twitter ? "Yes" : "No"}</p></div>
      </div>
      {page.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-700">{page.error}</div>
      )}
    </div>
  )
}

export function AdminAuditorPagesTable({ pages }: { pages: PageRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (pages.length === 0) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400 text-sm">No pages found for this scan.</div>
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="w-8 px-2 py-3" />
              <th className="px-4 py-3 text-left font-semibold text-slate-600">URL</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">State</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">HTTP</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Title</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Size</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Fetch ms</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pages.map((page) => (
              <>
                <tr
                  key={page.id}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => toggle(page.id)}
                >
                  <td className="px-2 py-3 text-slate-400">
                    {expanded.has(page.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700 max-w-xs truncate">{page.url}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATE_COLORS[page.state] ?? "bg-slate-100 text-slate-500"}`}>{page.state}</span>
                  </td>
                  <td className="px-4 py-3 tabular-nums font-medium text-slate-700">{page.status_code ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{page.title ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-500">{formatBytes(page.content_bytes)}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-500">{page.fetch_ms != null ? `${page.fetch_ms}ms` : "—"}</td>
                </tr>
                {expanded.has(page.id) && (
                  <tr key={`${page.id}-detail`}>
                    <td colSpan={7} className="p-0"><PageDetail page={page} /></td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

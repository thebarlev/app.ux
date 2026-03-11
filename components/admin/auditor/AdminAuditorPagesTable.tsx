"use client"

import { Fragment, type ReactNode, useMemo, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

export interface PageAnalysisLink {
  href: string
  text: string
}

export interface PageAnalysisImage {
  src: string
  alt: string | null
}

export interface PageAnalysis {
  headings: {
    h1: string[]
    h2: string[]
    h3: string[]
  }
  links: {
    internal: PageAnalysisLink[]
    external: PageAnalysisLink[]
    anchors: string[]
  }
  images: PageAnalysisImage[]
  accessibility: {
    aria_labels: string[]
    aria_labelledby: string[]
    roles: string[]
  }
}

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
  jsonld_types?: string[] | null
  tracking?: {
    hasGtm?: boolean
    hasGa4?: boolean
    gtmIds?: string[]
    ga4Ids?: string[]
  } | null
  analysis?: PageAnalysis | null
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

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : []
}

function toLinkArray(value: unknown): PageAnalysisLink[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      const record = toRecord(item)
      const href = String(record.href || "").trim()
      const text = String(record.text || "").trim()
      if (!href) return null
      return { href, text: text || href }
    })
    .filter((item): item is PageAnalysisLink => Boolean(item))
}

function toImageArray(value: unknown): PageAnalysisImage[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      const record = toRecord(item)
      const src = String(record.src || "").trim()
      if (!src) return null
      const alt = String(record.alt || "").trim() || null
      return { src, alt }
    })
    .filter((item): item is PageAnalysisImage => Boolean(item))
}

function getPageAnalysis(value: unknown): PageAnalysis {
  const record = toRecord(value)
  const headings = toRecord(record.headings)
  const links = toRecord(record.links)
  const accessibility = toRecord(record.accessibility)

  return {
    headings: {
      h1: toStringArray(headings.h1),
      h2: toStringArray(headings.h2),
      h3: toStringArray(headings.h3),
    },
    links: {
      internal: toLinkArray(links.internal),
      external: toLinkArray(links.external),
      anchors: toStringArray(links.anchors),
    },
    images: toImageArray(record.images),
    accessibility: {
      aria_labels: toStringArray(accessibility.aria_labels),
      aria_labelledby: toStringArray(accessibility.aria_labelledby),
      roles: toStringArray(accessibility.roles),
    },
  }
}

function PreviewList({ items, empty = "—" }: { items: ReactNode[]; empty?: string }) {
  if (items.length === 0) return <p className="text-slate-400">{empty}</p>
  return <div className="space-y-1.5">{items}</div>
}

function DetailSection({
  title,
  summary,
  children,
}: {
  title: string
  summary?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
        {summary ? <div className="text-[11px] text-slate-400">{summary}</div> : null}
      </div>
      {children}
    </section>
  )
}

function SubSection({
  label,
  count,
  children,
}: {
  label: string
  count: number
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium text-slate-500">
        {label} <span className="text-slate-400">({count})</span>
      </div>
      {children}
    </div>
  )
}

function PageDetail({ page }: { page: PageRow }) {
  const analysis = useMemo(() => getPageAnalysis(page.analysis), [page.analysis])
  const jsonldTypes = toStringArray(page.jsonld_types)
  const tracking = toRecord(page.tracking)
  const gtmIds = toStringArray(tracking.gtmIds)
  const ga4Ids = toStringArray(tracking.ga4Ids)

  return (
    <div className="px-4 pb-4 pt-2 bg-slate-50 space-y-3 text-xs">
      <div className="grid gap-3 lg:grid-cols-2">
        <DetailSection
          title="Metadata"
          summary={`${jsonldTypes.length} schema · ${gtmIds.length + ga4Ids.length} tracking IDs`}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <span className="text-slate-400 block">Meta description</span>
              <p className="text-slate-700">{page.meta_description ?? "—"}</p>
            </div>
            <div className="space-y-1.5">
              <span className="text-slate-400 block">Canonical</span>
              <p className="font-mono text-slate-700 break-all">{page.canonical ?? "—"}</p>
            </div>
            <div><span className="text-slate-400 block">Lang</span><p className="text-slate-700">{page.lang ?? "—"}</p></div>
            <div><span className="text-slate-400 block">OG tags</span><p className="text-slate-700">{page.has_og ? "Yes" : "No"}</p></div>
            <div><span className="text-slate-400 block">Twitter tags</span><p className="text-slate-700">{page.has_twitter ? "Yes" : "No"}</p></div>
            <div><span className="text-slate-400 block">Structured data</span><p className="text-slate-700">{jsonldTypes.length > 0 ? jsonldTypes.slice(0, 3).join(", ") : "—"}</p></div>
            <div><span className="text-slate-400 block">GTM IDs</span><p className="text-slate-700">{gtmIds.length > 0 ? gtmIds.slice(0, 3).join(", ") : "—"}</p></div>
            <div><span className="text-slate-400 block">GA4 IDs</span><p className="text-slate-700">{ga4Ids.length > 0 ? ga4Ids.slice(0, 3).join(", ") : "—"}</p></div>
          </div>
        </DetailSection>

        <DetailSection
          title="Headings"
          summary={`${analysis.headings.h1.length + analysis.headings.h2.length + analysis.headings.h3.length} total`}
        >
          <div className="grid gap-3 md:grid-cols-3">
            <SubSection label="H1" count={analysis.headings.h1.length}>
              <PreviewList items={analysis.headings.h1.slice(0, 3).map((item) => <p key={item} className="text-slate-700">{item}</p>)} />
            </SubSection>
            <SubSection label="H2" count={analysis.headings.h2.length}>
              <PreviewList items={analysis.headings.h2.slice(0, 3).map((item) => <p key={item} className="text-slate-700">{item}</p>)} />
            </SubSection>
            <SubSection label="H3" count={analysis.headings.h3.length}>
              <PreviewList items={analysis.headings.h3.slice(0, 3).map((item) => <p key={item} className="text-slate-700">{item}</p>)} />
            </SubSection>
          </div>
        </DetailSection>

        <DetailSection
          title="Links"
          summary={`${analysis.links.internal.length + analysis.links.external.length} links · ${analysis.links.anchors.length} anchors`}
        >
          <div className="grid gap-3 md:grid-cols-3">
            <SubSection label="Internal" count={analysis.links.internal.length}>
              <PreviewList
                items={analysis.links.internal.slice(0, 3).map((link) => (
                  <div key={`${link.href}-${link.text}`} className="space-y-0.5">
                    <p className="text-slate-700">{link.text}</p>
                    <p className="font-mono text-[11px] text-slate-500 break-all">{link.href}</p>
                  </div>
                ))}
              />
            </SubSection>
            <SubSection label="External" count={analysis.links.external.length}>
              <PreviewList
                items={analysis.links.external.slice(0, 3).map((link) => (
                  <div key={`${link.href}-${link.text}`} className="space-y-0.5">
                    <p className="text-slate-700">{link.text}</p>
                    <p className="font-mono text-[11px] text-slate-500 break-all">{link.href}</p>
                  </div>
                ))}
              />
            </SubSection>
            <SubSection label="Anchor text" count={analysis.links.anchors.length}>
              <PreviewList items={analysis.links.anchors.slice(0, 5).map((anchor) => <p key={anchor} className="text-slate-700">{anchor}</p>)} />
            </SubSection>
          </div>
        </DetailSection>

        <DetailSection title="Images" summary={`${analysis.images.length} images`}>
          <PreviewList
            items={analysis.images.slice(0, 4).map((image) => (
              <div key={`${image.src}-${image.alt ?? ""}`} className="space-y-0.5">
                <p className="font-mono text-[11px] text-slate-500 break-all">{image.src}</p>
                <p className="text-slate-700">Alt: {image.alt ?? "—"}</p>
              </div>
            ))}
          />
        </DetailSection>

        <DetailSection
          title="Accessibility"
          summary={`${analysis.accessibility.aria_labels.length + analysis.accessibility.aria_labelledby.length + analysis.accessibility.roles.length} attributes`}
        >
          <div className="grid gap-3 md:grid-cols-3">
            <SubSection label="Aria label" count={analysis.accessibility.aria_labels.length}>
              <PreviewList items={analysis.accessibility.aria_labels.slice(0, 5).map((item) => <p key={item} className="text-slate-700">{item}</p>)} />
            </SubSection>
            <SubSection label="Aria labelledby" count={analysis.accessibility.aria_labelledby.length}>
              <PreviewList items={analysis.accessibility.aria_labelledby.slice(0, 5).map((item) => <p key={item} className="text-slate-700">{item}</p>)} />
            </SubSection>
            <SubSection label="Roles" count={analysis.accessibility.roles.length}>
              <PreviewList items={analysis.accessibility.roles.slice(0, 5).map((item) => <p key={item} className="text-slate-700">{item}</p>)} />
            </SubSection>
          </div>
        </DetailSection>
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
              <Fragment key={page.id}>
                <tr
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
                  <tr>
                    <td colSpan={7} className="p-0"><PageDetail page={page} /></td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

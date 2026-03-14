"use client"

import { useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { getPageAnalysis, type PageRow } from "./AdminAuditorPagesTable"

type HeadingTag = "H1" | "H2" | "H3"

type HeadingResult = {
  text: string
  tag: HeadingTag
  url: string
}

const RESULT_LIMIT = 200

const TAG_BADGE_STYLES: Record<HeadingTag, string> = {
  H1: "bg-blue-100 text-blue-700",
  H2: "bg-purple-100 text-purple-700",
  H3: "bg-slate-100 text-slate-700",
}

const TAG_ORDER: Record<HeadingTag, number> = {
  H1: 0,
  H2: 1,
  H3: 2,
}

function compareHeadingResults(a: HeadingResult, b: HeadingResult) {
  const tagDiff = TAG_ORDER[a.tag] - TAG_ORDER[b.tag]
  if (tagDiff !== 0) return tagDiff

  const textDiff = a.text.localeCompare(b.text, undefined, { sensitivity: "base" })
  if (textDiff !== 0) return textDiff

  return a.url.localeCompare(b.url, undefined, { sensitivity: "base" })
}

export function AdminAuditorHeadingSearch({ pages }: { pages: PageRow[] }) {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)

    return () => clearTimeout(timeout)
  }, [query])

  const headings = useMemo(() => {
    const results: HeadingResult[] = []

    for (const page of pages) {
      const analysis = getPageAnalysis(page.analysis)

      analysis.headings.h1.forEach((text) => {
        results.push({ text, tag: "H1", url: page.url })
      })
      analysis.headings.h2.forEach((text) => {
        results.push({ text, tag: "H2", url: page.url })
      })
      analysis.headings.h3.forEach((text) => {
        results.push({ text, tag: "H3", url: page.url })
      })
    }

    return results.sort(compareHeadingResults)
  }, [pages])

  const normalizedQuery = debouncedQuery.trim().toLowerCase()

  const filteredResults = useMemo(() => {
    if (!normalizedQuery) return headings
    return headings.filter((heading) => heading.text.toLowerCase().includes(normalizedQuery))
  }, [headings, normalizedQuery])

  const visibleResults = filteredResults.slice(0, RESULT_LIMIT)
  const hiddenCount = Math.max(0, filteredResults.length - RESULT_LIMIT)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="space-y-3">
        <div>
          <label htmlFor="heading-search" className="text-sm font-semibold text-slate-800">
            Search headings
          </label>
        </div>

        <div className="relative">
          <Search dir="ltr" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            id="heading-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search H1 / H2 / H3…"
            className="w-full pl-9 text-left"
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Heading</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Tag</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Page URL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleResults.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                      No headings found.
                    </td>
                  </tr>
                ) : (
                  visibleResults.map((result, index) => (
                    <tr key={`${result.tag}-${result.text}-${result.url}-${index}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700">{result.text}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TAG_BADGE_STYLES[result.tag]}`}>
                          {result.tag}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-blue-600 hover:text-blue-700 hover:underline break-all"
                        >
                          {result.url}
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {hiddenCount > 0 ? (
          <p className="text-xs text-slate-500">+ more results</p>
        ) : null}
      </div>
    </div>
  )
}

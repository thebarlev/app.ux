"use client"

import { useMemo, useState } from "react"
import { ArrowUpDown, Copy, Download, ExternalLink, Play, Search } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import type { CrawlError, CrawlSkipped, ExtractedRow } from "@/lib/admin/index-extractor/types"

type SortKey = "source_domain" | "status" | "confidence_score" | "extracted_at"
type SortDirection = "asc" | "desc"

type RunResponse = {
  ok: boolean
  error?: string
  rows: ExtractedRow[]
  errors: CrawlError[]
  skipped: CrawlSkipped[]
  search_diagnostics?: {
    mode: "manual" | "google_search"
    query?: string
    engine_requested?: "google_cse"
    engine_used?: "google_cse" | "serper" | "none"
    candidate_count_raw?: number
    candidate_count_normalized?: number
    candidate_count_deduped?: number
    candidate_count_filtered_in?: number
    candidate_count_filtered_out?: number
    crawl_seed_count?: number
    candidate_count?: number
    deduped_count?: number
    fallback_used?: boolean
    warnings?: string[]
    errors?: string[]
    candidates?: Array<{
      url: string
      domain: string
      rank: number | null
      search_engine: "google_cse" | "serper"
      search_source: "google_query"
      relevance_score: number
      filtered_out: boolean
      filtered_out_reason?: string
    }>
  }
  summary: {
    total_sources: number
    total_pages_attempted: number
    total_rows: number
    total_skipped: number
    total_errors: number
    stopped_reason?: "runtime_limit" | "page_limit"
  }
}

type PhoneInventoryItem = {
  phoneNumberRaw: string
  phoneNumberFormatted: string
  isVisibleInHtml: boolean
  sourceFile: string
  details: string
}

type PhoneInventoryResponse = {
  ok: boolean
  error?: string
  inventory: PhoneInventoryItem[]
  detectedPhoneRegex: string[]
  summary: {
    totalMatches: number
    visibleCount: number
    hiddenCount: number
    filesScanned: number
  }
  footerIntegrationSuggestions?: string[]
}

const DEFAULT_CRAWL_LIMIT = "10"
const DEFAULT_MAX_PAGES = "100"
const DEFAULT_SEARCH_RESULT_LIMIT = "10"
const DEFAULT_INTERNAL_LINK_MAX_DEPTH = "1"
const DEFAULT_INTERNAL_LINK_MAX_PAGES_PER_DOMAIN = "2"

function parseSeedLines(seedText: string, crawlLimitPerSource?: number) {
  return seedText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((sourceUrl) => ({ sourceUrl, crawlLimitPerSource }))
}

export default function IndexExtractorClient() {
  const [inputMode, setInputMode] = useState<"manual" | "google_search">("manual")
  const [seedUrls, setSeedUrls] = useState("")
  const [googleQuery, setGoogleQuery] = useState("")
  const [googleResultLimit, setGoogleResultLimit] = useState(DEFAULT_SEARCH_RESULT_LIMIT)
  const [googleCountry, setGoogleCountry] = useState("il")
  const [googleLanguage, setGoogleLanguage] = useState("he")
  const [internalLinkMaxDepth, setInternalLinkMaxDepth] = useState(DEFAULT_INTERNAL_LINK_MAX_DEPTH)
  const [internalLinkMaxPagesPerDomain, setInternalLinkMaxPagesPerDomain] = useState(DEFAULT_INTERNAL_LINK_MAX_PAGES_PER_DOMAIN)
  const [sourceLabel, setSourceLabel] = useState("")
  const [crawlLimitPerSource, setCrawlLimitPerSource] = useState(DEFAULT_CRAWL_LIMIT)
  const [maxPagesToVisit, setMaxPagesToVisit] = useState(DEFAULT_MAX_PAGES)
  const [followInternalLinks, setFollowInternalLinks] = useState(false)
  const [useRenderedFallback, setUseRenderedFallback] = useState(false)
  const [loading, setLoading] = useState(false)

  const [rows, setRows] = useState<ExtractedRow[]>([])
  const [errors, setErrors] = useState<CrawlError[]>([])
  const [skipped, setSkipped] = useState<CrawlSkipped[]>([])
  const [summaryText, setSummaryText] = useState("No run yet")
  const [searchDiagnostics, setSearchDiagnostics] = useState<RunResponse["search_diagnostics"] | null>(null)
  const [rawRow, setRawRow] = useState<ExtractedRow | null>(null)
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [phoneInventory, setPhoneInventory] = useState<PhoneInventoryItem[]>([])
  const [phoneRegexes, setPhoneRegexes] = useState<string[]>([])
  const [phoneInventorySummary, setPhoneInventorySummary] = useState<PhoneInventoryResponse["summary"] | null>(null)
  const [footerSuggestions, setFooterSuggestions] = useState<string[]>([])

  const [domainFilter, setDomainFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortKey, setSortKey] = useState<SortKey>("confidence_score")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")

  const uniqueDomains = useMemo(() => Array.from(new Set(rows.map((r) => r.source_domain))).sort(), [rows])

  const filteredRows = useMemo(() => {
    let out = [...rows]
    if (domainFilter !== "all") out = out.filter((row) => row.source_domain === domainFilter)
    if (statusFilter !== "all") out = out.filter((row) => row.status === statusFilter)

    out.sort((a, b) => {
      let cmp = 0
      if (sortKey === "confidence_score") {
        cmp = Number(a.confidence_score || "0") - Number(b.confidence_score || "0")
      } else {
        cmp = String(a[sortKey]).localeCompare(String(b[sortKey]))
      }
      return sortDirection === "asc" ? cmp : -cmp
    })

    return out
  }, [rows, domainFilter, statusFilter, sortKey, sortDirection])

  const topSkippedReason = useMemo(() => {
    if (!skipped.length) return ""
    const counts = new Map<string, number>()
    for (const item of skipped) {
      const reason = String(item.reason || "unknown").trim() || "unknown"
      counts.set(reason, (counts.get(reason) || 0) + 1)
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
    const winner = sorted[0]
    if (!winner) return ""
    return `${winner[0]} (${winner[1]})`
  }, [skipped])

  const topErrorCode = useMemo(() => {
    if (!errors.length) return ""
    const counts = new Map<string, number>()
    for (const item of errors) {
      const code = String(item.code || "unknown").trim() || "unknown"
      counts.set(code, (counts.get(code) || 0) + 1)
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
    const winner = sorted[0]
    if (!winner) return ""
    return `${winner[0]} (${winner[1]})`
  }, [errors])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(key)
    setSortDirection("desc")
  }

  const copyValue = async (value: string, label: string) => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copied`)
  }

  const handleRun = async () => {
    const parsedLimit = Number.parseInt(crawlLimitPerSource, 10)
    const parsedMaxPages = Number.parseInt(maxPagesToVisit, 10)
    const parsedGoogleResultLimit = Number.parseInt(googleResultLimit, 10)
    const parsedInternalDepth = Number.parseInt(internalLinkMaxDepth, 10)
    const parsedInternalMaxPages = Number.parseInt(internalLinkMaxPagesPerDomain, 10)
    const sources = parseSeedLines(seedUrls, Number.isFinite(parsedLimit) ? parsedLimit : undefined)

    if (inputMode === "manual" && sources.length === 0) {
      toast.error("Please add at least one URL")
      return
    }
    if (inputMode === "google_search" && !googleQuery.trim()) {
      toast.error("Please enter a business name or category query")
      return
    }

    setLoading(true)
    setSummaryText("Running extraction...")
    setSearchDiagnostics(null)
    setRawRow(null)

    try {
      const res = await fetch("/api/admin/index-extractor/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: inputMode,
          sources:
            inputMode === "manual" ? sources.map((source) => ({ ...source, sourceLabel: sourceLabel || undefined })) : undefined,
          googleQuery: inputMode === "google_search" ? googleQuery.trim() : undefined,
          googleResultLimit:
            inputMode === "google_search" && Number.isFinite(parsedGoogleResultLimit) ? parsedGoogleResultLimit : undefined,
          googleCountry: inputMode === "google_search" ? googleCountry.trim().toLowerCase() || undefined : undefined,
          googleLanguage: inputMode === "google_search" ? googleLanguage.trim().toLowerCase() || undefined : undefined,
          internalLinkMaxDepth: inputMode === "google_search" && Number.isFinite(parsedInternalDepth) ? parsedInternalDepth : undefined,
          internalLinkMaxPagesPerDomain:
            inputMode === "google_search" && Number.isFinite(parsedInternalMaxPages) ? parsedInternalMaxPages : undefined,
          maxPagesToVisit: Number.isFinite(parsedMaxPages) ? parsedMaxPages : undefined,
          followInternalLinks,
          useRenderedFallback,
        }),
      })
      const data = (await res.json()) as RunResponse
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Run failed")
      }

      setRows(data.rows || [])
      setErrors(data.errors || [])
      setSkipped(data.skipped || [])
      setSearchDiagnostics(data.search_diagnostics || null)
      const reason = data.summary?.stopped_reason ? `, stopped: ${data.summary.stopped_reason}` : ""
      const searchInfo =
        data.search_diagnostics?.mode === "google_search"
          ? `, search_engine: ${data.search_diagnostics.engine_used || "none"}, filtered_in: ${data.search_diagnostics.candidate_count_filtered_in || 0}`
          : ""
      setSummaryText(
        `Sources: ${data.summary.total_sources}, pages: ${data.summary.total_pages_attempted}, rows: ${data.summary.total_rows}, skipped: ${data.summary.total_skipped}, errors: ${data.summary.total_errors}${searchInfo}${reason}`
      )
      toast.success("Extraction completed")
    } catch (e: unknown) {
      toast.error(String(e instanceof Error ? e.message : e))
      setSummaryText("Extraction failed")
    } finally {
      setLoading(false)
    }
  }

  const handleExportCsv = async () => {
    if (rows.length === 0) {
      toast.error("No results to export")
      return
    }
    const res = await fetch("/api/admin/index-extractor/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(String((body as { error?: string }).error || "CSV export failed"))
      return
    }

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `index-data-extractor-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("CSV exported")
  }

  const handleScanPhoneInventory = async () => {
    setInventoryLoading(true)
    try {
      const res = await fetch("/api/admin/index-extractor/phone-inventory", {
        method: "POST",
        headers: { "content-type": "application/json" },
      })
      const data = (await res.json()) as PhoneInventoryResponse
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Phone inventory scan failed")
      }
      setPhoneInventory(data.inventory || [])
      setPhoneRegexes(data.detectedPhoneRegex || [])
      setPhoneInventorySummary(data.summary || null)
      setFooterSuggestions(data.footerIntegrationSuggestions || [])
      toast.success("Phone inventory scan completed")
    } catch (e: unknown) {
      toast.error(String(e instanceof Error ? e.message : e))
    } finally {
      setInventoryLoading(false)
    }
  }

  const handleExportPhoneInventoryJson = () => {
    if (phoneInventory.length === 0 && phoneRegexes.length === 0) {
      toast.error("No phone inventory data to export")
      return
    }
    const payload = {
      inventory: phoneInventory,
      detectedPhoneRegex: phoneRegexes,
      summary: phoneInventorySummary,
      footerIntegrationSuggestions: footerSuggestions,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `index-extractor-phone-inventory-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Phone inventory JSON exported")
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Index Data Extractor</h1>
        <p className="mt-2 text-muted-foreground">
          Internal admin tool for extracting public contact and business details from approved index URLs.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run extraction</CardTitle>
          <CardDescription>Public pages only. Robots and domain policy are enforced server-side.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Input mode</label>
            <Select value={inputMode} onValueChange={(v: "manual" | "google_search") => setInputMode(v)}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Choose mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual URLs</SelectItem>
                <SelectItem value="google_search">Google Search</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {inputMode === "manual" ? (
          <div className="space-y-2">
            <label className="text-sm font-medium">Seed URLs (one per line)</label>
            <Textarea
              value={seedUrls}
              onChange={(e) => setSeedUrls(e.target.value)}
              placeholder={"https://example.com/index\nhttps://directory.example.org"}
              className="min-h-[140px]"
            />
          </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Google query (business name or category)</label>
                <Input
                  value={googleQuery}
                  onChange={(e) => setGoogleQuery(e.target.value)}
                  placeholder='e.g. "רואה חשבון תל אביב"'
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Search result limit</label>
                <Input value={googleResultLimit} onChange={(e) => setGoogleResultLimit(e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Country code</label>
                <Input value={googleCountry} onChange={(e) => setGoogleCountry(e.target.value)} placeholder="il" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Language code</label>
                <Input value={googleLanguage} onChange={(e) => setGoogleLanguage(e.target.value)} placeholder="he" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Internal link max depth (0-2)</label>
                <Input value={internalLinkMaxDepth} onChange={(e) => setInternalLinkMaxDepth(e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Internal max pages/domain (0-5)</label>
                <Input
                  value={internalLinkMaxPagesPerDomain}
                  onChange={(e) => setInternalLinkMaxPagesPerDomain(e.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Domain/source label (optional)</label>
              <Input value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} placeholder="e.g. IL public index" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Crawl limit per source (optional)</label>
              <Input value={crawlLimitPerSource} onChange={(e) => setCrawlLimitPerSource(e.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Max pages to visit (optional)</label>
              <Input value={maxPagesToVisit} onChange={(e) => setMaxPagesToVisit(e.target.value)} inputMode="numeric" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex items-center justify-between rounded-md border p-3">
              <span className="text-sm">Follow internal links from seed page</span>
              <Switch checked={followInternalLinks} onCheckedChange={setFollowInternalLinks} />
            </label>
            <label className="flex items-center justify-between rounded-md border p-3">
              <span className="text-sm">Use rendered browser only if static fetch fails</span>
              <Switch checked={useRenderedFallback} onCheckedChange={setUseRenderedFallback} />
            </label>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleRun} disabled={loading}>
              <Play className="mr-2 h-4 w-4" />
              {loading ? "Running..." : "Start extraction"}
            </Button>
            <Button variant="outline" onClick={handleExportCsv} disabled={loading || rows.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={handleScanPhoneInventory} disabled={inventoryLoading}>
              <Search className="mr-2 h-4 w-4" />
              {inventoryLoading ? "Scanning phones..." : "Scan Phone Inventory"}
            </Button>
            <Button variant="outline" onClick={handleExportPhoneInventoryJson} disabled={phoneInventory.length === 0 && phoneRegexes.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export Inventory JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex items-center justify-between">
            <CardTitle>Results ({filteredRows.length})</CardTitle>
            <div className="flex gap-2">
              <Select value={domainFilter} onValueChange={setDomainFilter}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Filter by domain" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All domains</SelectItem>
                  {uniqueDomains.map((domain) => (
                    <SelectItem key={domain} value={domain}>
                      {domain}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button variant="ghost" size="sm" onClick={() => toggleSort("source_domain")} className="-ml-3">
                    Domain <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>Name / Business</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" onClick={() => toggleSort("status")} className="-ml-3">
                    Status <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" onClick={() => toggleSort("confidence_score")} className="-ml-3">
                    Confidence <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    No rows yet
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row) => (
                  <TableRow key={`${row.page_url}:${row.email}:${row.phone}`}>
                    <TableCell>{row.source_domain}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div>{row.full_name || row.business_name || "-"}</div>
                        <div className="text-xs text-muted-foreground">{row.page_title || "-"}</div>
                      </div>
                    </TableCell>
                    <TableCell>{row.email || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{row.mobile || row.phone || "-"}</span>
                        {row.mobile ? (
                          <Button size="sm" variant="ghost" onClick={() => copyValue(row.mobile, "Mobile")}>
                            Copy mobile
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === "success" ? "default" : "secondary"}>{row.status}</Badge>
                    </TableCell>
                    <TableCell>{row.confidence_score}</TableCell>
                    <TableCell>
                      {row.lead_grade ? (
                        <div className="space-y-1">
                          <Badge variant={row.lead_grade === "A" ? "default" : "secondary"}>{`${row.lead_grade} (${row.lead_score ?? 0})`}</Badge>
                          <div className="text-xs text-muted-foreground">{row.lead_summary || "-"}</div>
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => copyValue(row.email, "Email")} disabled={!row.email}>
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyValue(row.mobile || row.phone, "Phone")}
                          disabled={!row.mobile && !row.phone}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => window.open(row.page_url, "_blank", "noopener,noreferrer")}>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRawRow(row)}>
                          Raw
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>{summaryText}</div>
          {topSkippedReason ? <div className="text-muted-foreground">{`Top skipped reason: ${topSkippedReason}`}</div> : null}
          {topErrorCode ? <div className="text-muted-foreground">{`Top error code: ${topErrorCode}`}</div> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Phone Inventory</CardTitle>
          <CardDescription>Code-scan results for index-extractor scoped files only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {phoneInventorySummary ? (
            <div className="text-sm text-muted-foreground">
              {`Matches: ${phoneInventorySummary.totalMatches}, visible: ${phoneInventorySummary.visibleCount}, hidden: ${phoneInventorySummary.hiddenCount}, files: ${phoneInventorySummary.filesScanned}`}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No phone inventory scan yet.</div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Raw</TableHead>
                <TableHead>Formatted</TableHead>
                <TableHead>Visible</TableHead>
                <TableHead>Source File</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {phoneInventory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                    No phone inventory rows
                  </TableCell>
                </TableRow>
              ) : (
                phoneInventory.map((item, idx) => (
                  <TableRow key={`${item.sourceFile}:${item.phoneNumberRaw}:${idx}`}>
                    <TableCell>{item.phoneNumberRaw}</TableCell>
                    <TableCell>{item.phoneNumberFormatted}</TableCell>
                    <TableCell>{item.isVisibleInHtml ? "true" : "false"}</TableCell>
                    <TableCell>{item.sourceFile}</TableCell>
                    <TableCell className="max-w-[480px] truncate" title={item.details}>
                      {item.details}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="space-y-2">
            <div className="text-sm font-medium">Detected phone regex patterns</div>
            <div className="max-h-44 overflow-auto rounded border p-2 font-mono text-xs">
              {phoneRegexes.length === 0 ? "No phone regex patterns detected yet." : phoneRegexes.join("\n")}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Footer integration suggestions</div>
            <div className="rounded border p-2 text-sm">
              {footerSuggestions.length === 0 ? (
                <div className="text-muted-foreground">No suggestions yet.</div>
              ) : (
                footerSuggestions.map((suggestion, idx) => <div key={`${suggestion}-${idx}`}>{`- ${suggestion}`}</div>)
              )}
            </div>
          </div>

          {(phoneInventory.length > 0 || phoneRegexes.length > 0) ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">Raw phone inventory JSON</div>
              <pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs">
                {JSON.stringify(
                  {
                    inventory: phoneInventory,
                    detectedPhoneRegex: phoneRegexes,
                    summary: phoneInventorySummary,
                    footerIntegrationSuggestions: footerSuggestions,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {inputMode === "google_search" && searchDiagnostics ? (
        <Card>
          <CardHeader>
            <CardTitle>Search diagnostics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>{`Engine requested: ${searchDiagnostics.engine_requested || "google_cse"}, engine used: ${searchDiagnostics.engine_used || "none"}`}</div>
            <div>{`Fallback used: ${searchDiagnostics.fallback_used ? "yes" : "no"}`}</div>
            <div>{`Raw: ${searchDiagnostics.candidate_count_raw || 0}, normalized: ${searchDiagnostics.candidate_count_normalized || 0}, deduped: ${searchDiagnostics.candidate_count_deduped || 0}`}</div>
            <div>{`Filtered-in: ${searchDiagnostics.candidate_count_filtered_in || 0}, filtered-out: ${searchDiagnostics.candidate_count_filtered_out || 0}, crawl seeds: ${searchDiagnostics.crawl_seed_count || 0}`}</div>
            {searchDiagnostics.warnings?.length ? (
              <div className="rounded border p-2 font-mono text-xs">{searchDiagnostics.warnings.join("\n")}</div>
            ) : null}
            {searchDiagnostics.errors?.length ? (
              <div className="rounded border p-2 font-mono text-xs">{searchDiagnostics.errors.join("\n")}</div>
            ) : null}
            {searchDiagnostics.candidates?.length ? (
              <details className="rounded border p-2 text-xs">
                <summary className="cursor-pointer font-medium">Candidate breakdown ({searchDiagnostics.candidates.length})</summary>
                <div className="mt-2 max-h-56 overflow-auto space-y-1 font-mono">
                  {searchDiagnostics.candidates.map((candidate) => (
                    <div key={`${candidate.url}:${candidate.rank}`}>
                      {`[${candidate.filtered_out ? "OUT" : "IN"}] score=${candidate.relevance_score} rank=${candidate.rank ?? "-"} domain=${candidate.domain} reason=${candidate.filtered_out_reason || "ok"}`}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </CardContent>
        </Card>
      ) : null}


      <Card>
        <CardHeader>
          <CardTitle>Error log / skipped pages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="mb-1 font-medium">Errors ({errors.length})</div>
            <div className="max-h-44 overflow-auto rounded border p-2 font-mono text-xs">
              {errors.length === 0
                ? "No errors"
                : errors.map((e, idx) => <div key={`${e.source_url}-${idx}`}>{`${e.code}: ${e.message}`}</div>)}
            </div>
          </div>
          <div>
            <div className="mb-1 font-medium">Skipped ({skipped.length})</div>
            <div className="max-h-44 overflow-auto rounded border p-2 font-mono text-xs">
              {skipped.length === 0
                ? "No skipped pages"
                : skipped.map((s, idx) => <div key={`${s.source_url}-${idx}`}>{`${s.reason} | ${s.page_url || s.source_url}`}</div>)}
            </div>
          </div>
        </CardContent>
      </Card>

      {rawRow ? (
        <Card>
          <CardHeader>
            <CardTitle>Raw extracted fields</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(rawRow, null, 2)}</pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

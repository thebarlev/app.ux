"use client"

import { useState } from "react"
import { Download, Play } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ArchitectureLead } from "@/lib/admin/architecture-crawler/types"

type RunResponse = {
  ok: boolean
  error?: string
  leads: ArchitectureLead[]
  summary: {
    target_count: number
    candidate_urls: number
    candidate_domains: number
    crawled_domains: number
    leads_found: number
    saved_to_db: number
    filtered_enterprise: number
    stopped_reason?: "target_reached" | "runtime_limit" | "domain_limit"
  }
  warnings: string[]
}

function downloadJson(leads: ArchitectureLead[]) {
  const blob = new Blob([JSON.stringify(leads, null, 2)], { type: "application/json;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `architecture-leads-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export default function ArchitectureCrawlerClient() {
  const [targetCount, setTargetCount] = useState("1000")
  const [loading, setLoading] = useState(false)
  const [leads, setLeads] = useState<ArchitectureLead[]>([])
  const [summaryText, setSummaryText] = useState("No run yet")
  const [warnings, setWarnings] = useState<string[]>([])

  const runCrawler = async () => {
    const parsedTarget = Number.parseInt(targetCount, 10)
    setLoading(true)
    setSummaryText("Running architecture crawl...")
    setWarnings([])
    try {
      const res = await fetch("/api/admin/architecture-crawler/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetCount: Number.isFinite(parsedTarget) ? parsedTarget : 1000,
        }),
      })
      const data = (await res.json()) as RunResponse
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Run failed")
      }
      setLeads(data.leads || [])
      setWarnings(data.warnings || [])
      setSummaryText(
        `Target: ${data.summary.target_count}, candidates: ${data.summary.candidate_domains}, leads: ${data.summary.leads_found}, saved: ${data.summary.saved_to_db}, enterprise filtered: ${data.summary.filtered_enterprise}${data.summary.stopped_reason ? `, stopped: ${data.summary.stopped_reason}` : ""}`
      )
      toast.success("Architecture crawl completed")
    } catch (e: unknown) {
      toast.error(String(e instanceof Error ? e.message : e))
      setSummaryText("Run failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Architecture Firm Crawler</h1>
        <p className="mt-2 text-muted-foreground">
          Admin-only lead crawler for architecture firms in USA, Canada, Australia, and New Zealand.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run crawler</CardTitle>
          <CardDescription>
            Seeds are collected from Architizer, ArchDaily offices and Google. Crawl is limited to max 3 pages/domain and 10s/domain.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-2">
            <label className="text-sm font-medium">Target leads</label>
            <Input value={targetCount} onChange={(e) => setTargetCount(e.target.value)} inputMode="numeric" />
          </div>
          <div className="flex gap-3">
            <Button onClick={runCrawler} disabled={loading}>
              <Play className="mr-2 h-4 w-4" />
              {loading ? "Running..." : "Start crawl"}
            </Button>
            <Button variant="outline" onClick={() => downloadJson(leads)} disabled={loading || leads.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>{summaryText}</div>
          {warnings.length > 0 ? <div className="font-mono text-xs text-muted-foreground">{warnings.join(" | ")}</div> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leads ({leads.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                    No leads yet
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <TableRow key={lead.domain}>
                    <TableCell>{lead.domain}</TableCell>
                    <TableCell>{lead.company_name || "-"}</TableCell>
                    <TableCell>{lead.email || "-"}</TableCell>
                    <TableCell>{lead.phone || "-"}</TableCell>
                    <TableCell>{lead.location || "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

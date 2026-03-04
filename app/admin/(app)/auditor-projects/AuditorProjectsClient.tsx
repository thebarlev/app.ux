"use client"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Project = {
  id: string
  domain: string | null
  website_url: string | null
  status: string
  created_at: string
  customer_id: string | null
  auditor_customers: {
    id: string
    customer_status: string
    last_payment_at: string | null
    next_charge_at: string | null
    last_charge_status: string | null
    last_charge_error: string | null
    lead_id: string | null
    auditor_leads: { full_name: string; email: string; phone: string } | null
  } | null
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-500/20 text-green-700",
    past_due: "bg-amber-500/20 text-amber-700",
    canceled: "bg-muted text-muted-fg",
    inactive: "bg-red-500/20 text-red-700",
  }
  const s = styles[status] || "bg-muted text-muted-fg"
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${s}`}>
      {status}
    </span>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    return d.toLocaleDateString("he-IL", { dateStyle: "short" })
  } catch {
    return "—"
  }
}

function truncate(s: string | null, max = 50): string {
  if (!s) return "—"
  return s.length > max ? s.slice(0, max) + "…" : s
}

export default function AuditorProjectsClient({ projects }: { projects: Project[] }) {
  if (projects.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No projects yet. Projects appear here after payment success.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {projects.map((p) => {
        const cust = p.auditor_customers
        const lead = cust?.auditor_leads
        const isActive = cust?.customer_status === "active"

        return (
          <Link key={p.id} href={`/admin/auditor-projects/${p.id}`}>
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-lg">
                  {p.domain || p.website_url || "Project"}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <StatusBadge status={cust?.customer_status || "—"} />
                  {!isActive && (
                    <span className="text-xs text-amber-600">
                      Scans blocked
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <span className="text-muted-foreground">Contact</span>
                  <div className="font-medium">{lead?.full_name || "—"}</div>
                  <div className="text-xs text-muted-fg">{lead?.email || "—"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Last payment</span>
                  <div className="font-medium">{formatDate(cust?.last_payment_at ?? null)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Charge status</span>
                  <div className="font-medium">{cust?.last_charge_status || "—"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Error</span>
                  <div className="font-medium truncate max-w-[200px]" title={cust?.last_charge_error || ""}>
                    {truncate(cust?.last_charge_error ?? null, 30)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          </Link>
        )
      })}
    </div>
  )
}

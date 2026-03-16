"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Building2, ExternalLink, Mail, Search, Trash2 } from "lucide-react"

export type AuditorClientRow = {
  companyId: string
  companyName: string
  fullName: string | null
  email: string | null
  joinedAt: string
  plan: string | null
  subscriptionStatus: string | null
  intakeCompleted: boolean
  lastScanAt: string | null
}

function formatDate(value: string | null) {
  if (!value) return "—"
  return new Date(value).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })
}

function statusBadgeClass(value: string | null) {
  switch (value) {
    case "active":
      return "bg-emerald-100 text-emerald-700"
    case "pending":
      return "bg-amber-100 text-amber-700"
    case "past_due":
      return "bg-red-100 text-red-700"
    case "blocked":
      return "bg-red-100 text-red-700"
    case "canceled":
      return "bg-slate-100 text-slate-600"
    default:
      return "bg-slate-100 text-slate-600"
  }
}

function isActiveSubscription(value: string | null) {
  return value === "active"
}

export function AdminAuditorClientsTable({
  rows,
  query,
  activeOnly,
  onDisable,
  onDelete,
  onDeleteMany,
}: {
  rows: AuditorClientRow[]
  query?: string
  activeOnly?: boolean
  onDisable?: (companyId: string) => void
  onDelete?: (companyId: string) => void
  onDeleteMany?: (companyIds: string[]) => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const buildUrl = useCallback(
    (params: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(params)) {
        if (!value) next.delete(key)
        else next.set(key, value)
      }
      const qs = next.toString()
      return qs ? `${pathname}?${qs}` : pathname
    },
    [pathname, searchParams],
  )

  useEffect(() => {
    setSelectedIds([])
  }, [rows])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const deletableRows = useMemo(() => rows.filter((row) => !isActiveSubscription(row.subscriptionStatus)), [rows])
  const allVisibleSelected = deletableRows.length > 0 && deletableRows.every((row) => selectedSet.has(row.companyId))

  const toggleSelected = useCallback((companyId: string, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) return current.includes(companyId) ? current : [...current, companyId]
      return current.filter((id) => id !== companyId)
    })
  }, [])

  const toggleSelectAll = useCallback((checked: boolean) => {
    setSelectedIds(checked ? deletableRows.map((row) => row.companyId) : [])
  }, [deletableRows])

  const handleDeleteSelected = useCallback(() => {
    if (!onDeleteMany || selectedIds.length === 0) return
    if (!window.confirm(`Delete ${selectedIds.length} client(s) from the database? This action cannot be undone.`)) return
    onDeleteMany(selectedIds)
    setSelectedIds([])
  }, [onDeleteMany, selectedIds])

  const handleDeleteOne = useCallback((companyId: string) => {
    if (!onDelete) return
    if (!window.confirm("Delete this client from the database? This action cannot be undone.")) return
    onDelete(companyId)
    setSelectedIds((current) => current.filter((id) => id !== companyId))
  }, [onDelete])

  const handleDisableOne = useCallback((companyId: string) => {
    if (!onDisable) return
    if (!window.confirm("Disable this active client? You can delete it afterwards.")) return
    onDisable(companyId)
    setSelectedIds((current) => current.filter((id) => id !== companyId))
  }, [onDisable])

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Clients</CardTitle>
              <CardDescription>All Auditor customers and their onboarding status</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  defaultValue={query ?? ""}
                  placeholder="Search name, email, company..."
                  className="w-[220px] pl-9 sm:w-[280px]"
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return
                    const target = e.target as HTMLInputElement
                    router.push(buildUrl({ q: target.value.trim() || undefined }))
                  }}
                />
              </div>
              <Select
                value={activeOnly ? "active" : "all"}
                onValueChange={(value) => router.push(buildUrl({ active: value === "active" ? "1" : undefined }))}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Subscription filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All subscriptions</SelectItem>
                  <SelectItem value="active">Active only</SelectItem>
                </SelectContent>
              </Select>
              {onDeleteMany ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1 text-red-600 hover:text-red-700"
                  disabled={selectedIds.length === 0}
                  onClick={handleDeleteSelected}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete selected ({selectedIds.length})
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      aria-label="Select all deletable clients"
                      checked={allVisibleSelected}
                      disabled={deletableRows.length === 0}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Company name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Full name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Email</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Joined date</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Plan</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Subscription status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Intake completed</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Last scan date</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-2">
                        <Building2 className="h-8 w-8" />
                        <p>No Auditor clients found</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const deleteDisabled = isActiveSubscription(row.subscriptionStatus)

                    return (
                    <tr key={row.companyId} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select client ${row.companyName}`}
                          checked={selectedSet.has(row.companyId)}
                          disabled={deleteDisabled}
                          onChange={(e) => toggleSelected(row.companyId, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{row.companyName}</td>
                      <td className="px-4 py-3 text-slate-700">{row.fullName || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.email ? (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3.5 w-3.5" />
                            {row.email}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-500">{formatDate(row.joinedAt)}</td>
                      <td className="px-4 py-3 text-slate-700">{row.plan || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={statusBadgeClass(row.subscriptionStatus)}>
                          {row.subscriptionStatus || "none"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={row.intakeCompleted ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}>
                          {row.intakeCompleted ? "Yes" : "No"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-500">{formatDate(row.lastScanAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link href={`/admin/companies/${row.companyId}`}>
                            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                              <ExternalLink className="h-3 w-3" />
                              View
                            </Button>
                          </Link>
                          {deleteDisabled && onDisable ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 text-xs text-amber-700 hover:text-amber-800"
                              onClick={() => handleDisableOne(row.companyId)}
                            >
                              Disable
                            </Button>
                          ) : null}
                          {onDelete ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 text-xs text-red-600 hover:text-red-700"
                              disabled={deleteDisabled}
                              onClick={() => handleDeleteOne(row.companyId)}
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )})
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

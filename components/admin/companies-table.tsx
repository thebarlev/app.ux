"use client"

import { useState, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Search,
  MoreHorizontal,
  Eye,
  UserCheck,
  UserX,
  ArrowUpDown,
  FileText,
  Mail,
  Phone,
  Building2,
} from "lucide-react"
import type { Company } from "@/lib/types/admin"

interface CompaniesTableProps {
  companies: Company[]
  onStatusChange: (companyId: string, newStatus: "active" | "suspended") => void
}

type SortField = "created_at" | "last_login_at" | "documents"
type SortOrder = "asc" | "desc"

export function CompaniesTable({ companies, onStatusChange }: CompaniesTableProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [sortField, setSortField] = useState<SortField>("created_at")
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")
  const [isUpdating, setIsUpdating] = useState<string | null>(null)

  const filteredAndSortedCompanies = useMemo(() => {
    let result = [...companies]

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.company_name.toLowerCase().includes(query) ||
          c.email.toLowerCase().includes(query) ||
          c.contact_full_name.toLowerCase().includes(query),
      )
    }

    // Filter by status
    if (statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter)
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case "created_at":
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
        case "last_login_at":
          const aLogin = a.last_login_at ? new Date(a.last_login_at).getTime() : 0
          const bLogin = b.last_login_at ? new Date(b.last_login_at).getTime() : 0
          comparison = aLogin - bLogin
          break
        case "documents":
          const aCount = a.documents?.[0]?.count || 0
          const bCount = b.documents?.[0]?.count || 0
          comparison = aCount - bCount
          break
      }
      return sortOrder === "asc" ? comparison : -comparison
    })

    return result
  }, [companies, searchQuery, statusFilter, sortField, sortOrder])

  const handleStatusToggle = async (company: Company) => {
    const newStatus = company.status === "active" ? "suspended" : "active"
    setIsUpdating(company.id)

    try {
      const supabase = createClient()
      const { error } = await supabase.from("companies").update({ status: newStatus }).eq("id", company.id)

      if (error) throw error

      onStatusChange(company.id, newStatus)
    } catch (error) {
      console.error("Failed to update status:", error)
    } finally {
      setIsUpdating(null)
    }
  }

  const formatDate = (date: string | null) => {
    if (!date) return "Never"
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatDateTime = (date: string | null) => {
    if (!date) return "Never"
    // Using toLocaleString is safe - executes same on server and client for same date string
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getActiveDuration = (createdAt: string) => {
    const start = new Date(createdAt)
    // Calculate duration from createdAt to now
    const now = new Date()
    const diffMs = now.getTime() - start.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays < 30) {
      return `${diffDays} days`
    }
    const months = Math.floor(diffDays / 30)
    const days = diffDays % 30
    return `${months}m ${days}d`
  }

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortOrder("desc")
    }
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">Companies</CardTitle>
            <CardDescription>Manage all registered companies and their accounts</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search companies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-[200px] pl-9 sm:w-[260px]"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort("created_at")}
                    className="-ml-3 h-8 gap-1 font-medium"
                  >
                    Started
                    <ArrowUpDown className="h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort("last_login_at")}
                    className="-ml-3 h-8 gap-1 font-medium"
                  >
                    Last Login
                    <ArrowUpDown className="h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort("documents")}
                    className="-ml-3 h-8 gap-1 font-medium"
                  >
                    Documents
                    <ArrowUpDown className="h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead className="pr-6 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedCompanies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Building2 className="h-8 w-8" />
                      <p>No companies found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedCompanies.map((company) => (
                  <TableRow key={company.id} className="group">
                    <TableCell className="pl-6">
                      <div className="flex flex-col">
                        <span className="font-medium">{company.company_name}</span>
                        <span className="text-xs text-muted-foreground">{getActiveDuration(company.created_at)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm">{company.contact_full_name}</span>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {company.email}
                          </span>
                          {company.mobile_phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {company.mobile_phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={company.status === "active" ? "default" : "secondary"}
                        className={
                          company.status === "active"
                            ? "bg-chart-2/10 text-chart-2 hover:bg-chart-2/20"
                            : "bg-destructive/10 text-destructive hover:bg-destructive/20"
                        }
                      >
                        {company.status === "active" ? "Active" : "Suspended"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(company.created_at)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(company.last_login_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{company.documents?.[0]?.count || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => router.push(`/admin/companies/${company.id}`)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleStatusToggle(company)}
                            disabled={isUpdating === company.id}
                            className={company.status === "active" ? "text-destructive focus:text-destructive" : ""}
                          >
                            {company.status === "active" ? (
                              <>
                                <UserX className="mr-2 h-4 w-4" />
                                Suspend Account
                              </>
                            ) : (
                              <>
                                <UserCheck className="mr-2 h-4 w-4" />
                                Activate Account
                              </>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

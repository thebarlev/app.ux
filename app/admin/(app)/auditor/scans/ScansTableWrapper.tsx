"use client"

import { useTransition } from "react"
import { AdminAuditorScansTable, type ScanRow } from "@/components/admin/auditor/AdminAuditorScansTable"
import { retryScan, cancelScan, deleteScan, deleteScans } from "./actions"

export function AdminAuditorScansTableWrapper({
  scans,
  status,
  kind,
  cursor,
  hasMore,
}: {
  scans: ScanRow[]
  status?: string
  kind?: string
  cursor?: string
  hasMore: boolean
}) {
  const [, startTransition] = useTransition()

  return (
    <AdminAuditorScansTable
      scans={scans}
      status={status}
      kind={kind}
      cursor={cursor}
      hasMore={hasMore}
      onRetry={(scanId) => startTransition(() => { retryScan(scanId) })}
      onCancel={(scanId) => startTransition(() => { cancelScan(scanId) })}
      onDelete={(scanId) => startTransition(() => { deleteScan(scanId) })}
      onDeleteMany={(scanIds) => startTransition(() => { deleteScans(scanIds) })}
    />
  )
}

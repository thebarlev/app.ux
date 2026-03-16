"use client"

import { useTransition } from "react"
import { AdminAuditorClientsTable, type AuditorClientRow } from "@/components/admin/auditor/AdminAuditorClientsTable"
import { deleteAuditorClient, deleteAuditorClients, disableAuditorClient } from "./actions"

export function ClientsTableWrapper({
  rows,
  query,
  activeOnly,
}: {
  rows: AuditorClientRow[]
  query?: string
  activeOnly?: boolean
}) {
  const [, startTransition] = useTransition()

  const runDelete = (action: () => Promise<{ ok: boolean; error?: string }>) => {
    startTransition(() => {
      void (async () => {
        const result = await action()
        if (!result.ok && result.error) {
          window.alert(result.error)
        }
      })()
    })
  }

  return (
    <AdminAuditorClientsTable
      rows={rows}
      query={query}
      activeOnly={activeOnly}
      onDisable={(companyId) => {
        runDelete(() => disableAuditorClient(companyId))
      }}
      onDelete={(companyId) => {
        runDelete(() => deleteAuditorClient(companyId))
      }}
      onDeleteMany={(companyIds) => {
        runDelete(() => deleteAuditorClients(companyIds))
      }}
    />
  )
}

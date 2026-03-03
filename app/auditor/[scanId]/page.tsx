import { notFound, redirect } from "next/navigation"
import { isSystemAdmin } from "@/lib/security/system-admin"

export default async function AuditorScanPage({
  params,
  searchParams,
}: {
  params: Promise<{ scanId: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { scanId } = await params
  const { token } = await searchParams
  const t = typeof token === "string" ? token.trim() : ""
  if (!t) notFound()

  const isAdmin = await isSystemAdmin()
  if (!isAdmin) redirect("/auditor/dashboard")

  redirect(`/auditor?scanId=${encodeURIComponent(scanId)}&token=${encodeURIComponent(t)}`)
}


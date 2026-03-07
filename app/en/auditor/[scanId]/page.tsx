import { notFound, redirect } from "next/navigation"
import { isSystemAdmin } from "@/lib/security/system-admin"

export default async function EnAuditorScanPage({
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
  if (!isAdmin) redirect("/en/auditor/dashboard")

  redirect(`/en/auditor?scanId=${encodeURIComponent(scanId)}&token=${encodeURIComponent(t)}`)
}

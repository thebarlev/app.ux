import { notFound, redirect } from "next/navigation"

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
  redirect(`/auditor?scanId=${encodeURIComponent(scanId)}&token=${encodeURIComponent(t)}`)
}


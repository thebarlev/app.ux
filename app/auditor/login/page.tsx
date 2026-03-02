"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { LoginForm } from "@/components/auth/LoginForm"

function AuditorLoginInner() {
  const sp = useSearchParams()
  const linkId = String(sp.get("link_id") || "").trim()
  const after = linkId ? `/auditor/checkout?link_id=${encodeURIComponent(linkId)}` : "/auditor/checkout"
  const registerHref = linkId ? `/auditor/register?link_id=${encodeURIComponent(linkId)}` : "/auditor/register"

  return <LoginForm afterLoginRedirectTo={after} registerHref={registerHref} />
}

export default function AuditorLoginPage() {
  return (
    <Suspense fallback={null}>
      <AuditorLoginInner />
    </Suspense>
  )
}


"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { LoginForm } from "@/components/auth/LoginForm"

const BASE = "/en/auditor"

function EnAuditorLoginInner() {
  const sp = useSearchParams()
  const linkId = String(sp.get("link_id") || "").trim()
  const scanId = String(sp.get("scanId") || "").trim()
  const token = String(sp.get("token") || "").trim()
  const returnTo = String(sp.get("returnTo") || "").trim()
  const checkoutParams = new URLSearchParams()
  if (linkId) checkoutParams.set("link_id", linkId)
  if (scanId) checkoutParams.set("scanId", scanId)
  if (token) checkoutParams.set("token", token)
  const qs = checkoutParams.toString()
  const after = returnTo || (qs ? `${BASE}/checkout?${qs}` : `${BASE}/checkout`)
  const registerParams = new URLSearchParams()
  if (linkId) registerParams.set("link_id", linkId)
  if (scanId) registerParams.set("scanId", scanId)
  if (token) registerParams.set("token", token)
  const registerQs = registerParams.toString()
  const registerHref = registerQs ? `${BASE}/register?${registerQs}` : `${BASE}/register`

  return (
    <LoginForm
      afterLoginRedirectTo={after}
      registerHref={registerHref}
      titleText="Sign in to Auditor"
      descriptionText="Enter your credentials to continue to secure payment"
      locale="en"
    />
  )
}

export default function EnAuditorLoginPage() {
  return (
    <Suspense fallback={null}>
      <EnAuditorLoginInner />
    </Suspense>
  )
}

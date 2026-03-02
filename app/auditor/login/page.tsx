"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { LoginForm } from "@/components/auth/LoginForm"

function AuditorLoginInner() {
  const sp = useSearchParams()
  const linkId = String(sp.get("link_id") || "").trim()
  const scanId = String(sp.get("scanId") || "").trim()
  const token = String(sp.get("token") || "").trim()
  const checkoutParams = new URLSearchParams()
  if (linkId) checkoutParams.set("link_id", linkId)
  if (scanId) checkoutParams.set("scanId", scanId)
  if (token) checkoutParams.set("token", token)
  const qs = checkoutParams.toString()
  const after = qs ? `/auditor/checkout?${qs}` : "/auditor/checkout"
  const registerParams = new URLSearchParams()
  if (linkId) registerParams.set("link_id", linkId)
  if (scanId) registerParams.set("scanId", scanId)
  if (token) registerParams.set("token", token)
  const registerQs = registerParams.toString()
  const registerHref = registerQs ? `/auditor/register?${registerQs}` : "/auditor/register"

  return (
    <LoginForm
      afterLoginRedirectTo={after}
      registerHref={registerHref}
      titleText="התחברות ל‑Auditor"
      descriptionText="הזן את פרטי ההתחברות שלך כדי להמשיך לתשלום מאובטח"
    />
  )
}

export default function AuditorLoginPage() {
  return (
    <Suspense fallback={null}>
      <AuditorLoginInner />
    </Suspense>
  )
}


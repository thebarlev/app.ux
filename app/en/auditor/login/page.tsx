"use client"

import { Suspense } from "react"
import { useSearchParams, notFound } from "next/navigation"
import { LoginForm } from "@/components/auth/LoginForm"

// ── AUDITOR BLOCKED ───────────────────────────────────────────────────────────
// Hard-coded, not configurable. An env-var gate that is unset fails open, which
// is exactly the failure mode fixed in S1.3, so the value is a literal here.
// Annotated `: boolean` on purpose — without the annotation TypeScript narrows the
// code below to unreachable and re-reports the whole body, which fails the build
// (next.config.mjs ignoreBuildErrors:false). To restore auditor access, revert the
// security/auditor-block commits.
const AUDITOR_BLOCKED: boolean = true


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
  const after = returnTo || (qs ? `${BASE}/checkout?${qs}` : `${BASE}/dashboard`)
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
  // AUDITOR BLOCKED — first statement executed in this component.
  if (AUDITOR_BLOCKED) notFound()

  return (
    <Suspense fallback={null}>
      <EnAuditorLoginInner />
    </Suspense>
  )
}

"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react"
import { pushEvent } from "@/lib/tracking/events"
import {
  AUDITOR_PURCHASE_TRACKED_KEY,
  moveAuditorCheckoutContextToPendingPurchase,
  readAuditorPendingPurchase,
  trackPurchase,
} from "@/lib/tracking/purchase"
import { captureInvoicePaid, groupPosthogCompany, identifyPosthogUser } from "@/lib/analytics/posthog-events"

type PurchasePayload = {
  transaction_id?: string | null
  checkout_session_id?: string | null
  charge_id?: string | null
  company_id?: string | null
  value?: number | null
  currency?: string | null
  plan?: string | null
  billing_provider?: string | null
  document_id?: string | null
  user_id?: string | null
}

type StatusResponse = {
  ok?: boolean
  has_subscription?: boolean
  status?: string | null
  purchase?: PurchasePayload | null
}

export function AuditorSuccessClient({ basePath }: { basePath: string }) {
  const router = useRouter()
  const [status, setStatus] = useState<"confirming" | "ready" | "error">("confirming")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const pending = readAuditorPendingPurchase() || moveAuditorCheckoutContextToPendingPurchase()
    if (!pending) {
      router.replace(`${basePath}/dashboard`)
      return
    }

    let cancelled = false
    let attempts = 0
    let interval: number | null = null

    const confirmPayment = async () => {
      if (cancelled) return true
      attempts += 1

      try {
        const response = await fetch("/api/auditor/billing/subscription/status", {
          method: "GET",
          cache: "no-store",
        })
        const json = (await response.json().catch(() => null)) as StatusResponse | null

        if (!response.ok || !json?.ok || json?.has_subscription !== true || json?.status !== "active") {
          if (attempts >= 15) {
            setStatus("error")
            setErrorMessage("We couldn't confirm your payment yet. Please open your dashboard in a moment.")
            return true
          }
          return false
        }

        const purchase = json.purchase || null
        const transactionId = String(
          purchase?.transaction_id || purchase?.checkout_session_id || pending.checkout_session_id || ""
        ).trim()
        const value = Number(purchase?.value ?? pending.value)
        const plan = String(purchase?.plan || pending.plan || "").trim()
        const trackedTransactionId = String(window.sessionStorage.getItem(AUDITOR_PURCHASE_TRACKED_KEY) || "").trim()

        if (!transactionId || !Number.isFinite(value) || !plan) {
          if (attempts >= 15) {
            setStatus("error")
            setErrorMessage("Your payment was received, but we are still preparing your onboarding.")
            return true
          }
          return false
        }

        if (trackedTransactionId !== transactionId) {
          trackPurchase(value, plan, transactionId)
          captureInvoicePaid({
            charge_id: String(purchase?.charge_id || "").trim() || null,
            company_id: String(purchase?.company_id || "").trim() || null,
            amount: Number.isFinite(value) ? value : null,
            currency: String(purchase?.currency || "").trim() || null,
            plan: plan || null,
            billing_provider: String(purchase?.billing_provider || "").trim() || null,
            document_id: String(purchase?.document_id || "").trim() || null,
            user_id: String(purchase?.user_id || "").trim() || null,
          })
          const userId = String(purchase?.user_id || "").trim()
          const companyId = String(purchase?.company_id || "").trim()
          if (userId) identifyPosthogUser(userId)
          if (companyId) groupPosthogCompany(companyId)
          pushEvent("onboarding_step", {
            step: "payment_complete",
          })
          window.sessionStorage.setItem(AUDITOR_PURCHASE_TRACKED_KEY, transactionId)
        }

        setStatus("ready")
        return true
      } catch {
        if (attempts >= 15) {
          setStatus("error")
          setErrorMessage("We couldn't confirm your payment yet. Please try again from your dashboard.")
          return true
        }
        return false
      }
    }

    void confirmPayment().then((done) => {
      if (done || cancelled) return
      interval = window.setInterval(async () => {
        const shouldStop = await confirmPayment()
        if (shouldStop && interval !== null) {
          window.clearInterval(interval)
        }
      }, 2000)
    })

    return () => {
      cancelled = true
      if (interval !== null) {
        window.clearInterval(interval)
      }
    }
  }, [basePath, router])

  if (status === "confirming") {
    return (
      <main className="min-h-[70vh] px-4 py-10 sm:px-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 text-left shadow-sm sm:p-12">
          <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Confirming your payment</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            Please wait a moment while we verify your payment and prepare your onboarding.
          </p>
        </div>
      </main>
    )
  }

  if (status === "error") {
    return (
      <main className="min-h-[70vh] px-4 py-10 sm:px-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-amber-50 p-8 text-left shadow-sm sm:p-12">
          <h1 className="text-3xl font-black tracking-tight text-amber-950">Payment confirmation in progress</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-amber-800">
            {errorMessage}
          </p>
          <div className="mt-6">
            <Link
              href={`${basePath}/dashboard`}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Go to dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-[70vh] px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <section className="overflow-hidden rounded-3xl border border-emerald-100 bg-white p-8 shadow-sm sm:p-12">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Thank you for joining VOW
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            We&apos;re excited to help you grow. Our team will contact you shortly.
          </p>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Onboarding progress</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">What happens next</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-emerald-900">Step 1</p>
                <p className="mt-1 text-sm text-emerald-800">Payment complete</p>
              </div>
            </div>

            <div id="business-details-step" className="flex items-start gap-4 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4">
              <ArrowRight className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
              <div>
                <p className="text-sm font-semibold text-blue-900">Step 2</p>
                <p className="mt-1 text-sm text-blue-800">Complete business details</p>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
              <ArrowRight className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Step 3</p>
                <p className="mt-1 text-sm text-slate-600">Start your first scan</p>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <Link
              href={`${basePath}/settings?tab=business#business-details`}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Complete your business details
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}

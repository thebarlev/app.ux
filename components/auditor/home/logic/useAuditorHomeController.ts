"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { captureAuditorScanCompleted, captureAuditorScanStarted, resolvePageLocale } from "@/lib/analytics/posthog-events"
import type { AuditorLocale } from "@/lib/auditor/locale"
import { normalizeTrackedPlan, planFromLinkId, pushEvent } from "@/lib/tracking/events"
import { detectDomain, isScanFinished, isScanRunning } from "@/components/auditor/home/logic/auditor-home-utils"
import type { StatusResponse, Step } from "@/components/auditor/home/logic/auditor-home-types"

/** How long the scan animation holds before the lead form opens. */
const SCAN_TEASER_MS = 5000

export function useAuditorHomeController(params: { locale: AuditorLocale; basePath: string }) {
  const { locale, basePath } = params
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const linkId = String(sp.get("link_id") || "").trim() || "a_basic"

  const [step, setStep] = useState<Step>(1)
  const [siteUrl, setSiteUrl] = useState("")
  const [scanId, setScanId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState<"basic" | "pro" | "premium">("pro")
  const [isStartingCheckout, setIsStartingCheckout] = useState(false)
  const [hasActiveSubscription, setHasActiveSubscription] = useState<boolean | null>(null)
  const [showChangePlanModal, setShowChangePlanModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [changePlanTarget, setChangePlanTarget] = useState<"basic" | "pro">("pro")
  const [isChangingPlan, setIsChangingPlan] = useState(false)
  const [isCanceling, setIsCanceling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmittingLead, setIsSubmittingLead] = useState(false)
  const [leadCaptured, setLeadCaptured] = useState(false)
  /** Ticked marketing consent — decides whether the report is also emailed. */
  const [leadEmailCopy, setLeadEmailCopy] = useState(false)

  const continuingRef = useRef(false)
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const completedTrackedScanRef = useRef<string | null>(null)

  const canGoToDetails = useMemo(() => siteUrl.trim().length > 0 && !isSubmitting, [siteUrl, isSubmitting])

  const step2OkStatus = useMemo(() => (step === 2 && status && status.ok === true ? status : null), [step, status])
  const step2HasScreenshot = Boolean(step2OkStatus?.screenshot_url)
  const step2ScoreReady = step2OkStatus?.score_ready === true
  const step2IsFailed = Boolean(step2OkStatus && step2OkStatus.status === "failed")
  const step2IsDone = Boolean(step2OkStatus && (step2OkStatus.done === true || step2OkStatus.status === "done" || step2OkStatus.status === "failed"))
  const step2IsWorking = step === 2 && Boolean(scanId && token) && !step2IsFailed && !step2IsDone && (!step2HasScreenshot || !step2ScoreReady)

  const localeCtx = resolvePageLocale(pathname || basePath)

  const trackCompletedOnce = (sid: string, next: StatusResponse) => {
    if (!next || next.ok !== true) return
    if (completedTrackedScanRef.current === sid) return

    completedTrackedScanRef.current = sid
    captureAuditorScanCompleted({
      scan_id: sid,
      domain: String(next.hostname || "").trim() || detectDomain(siteUrl),
      score_overall: typeof next.score_total === "number" ? next.score_total : null,
      score_seo: typeof next.score_search === "number" ? next.score_search : null,
      score_ai: typeof next.score_ai === "number" ? next.score_ai : null,
      pages_scanned: typeof next.pages_scanned === "number" ? next.pages_scanned : null,
      page_language: localeCtx.page_language,
      page_dir: localeCtx.page_dir,
      user_id: null,
    })
  }

  useEffect(() => {
    const qsScanId = String(sp.get("scanId") || "").trim()
    const qsToken = String(sp.get("token") || "").trim()
    if (qsScanId && qsToken) {
      setScanId(qsScanId)
      setToken(qsToken)
      setStep(3)
    }
  }, [sp])

  const loadStatus = async (sid: string, t: string): Promise<StatusResponse> => {
    const r = await fetch(`/api/auditor/status?scanId=${encodeURIComponent(sid)}&token=${encodeURIComponent(t)}`, { method: "GET" })
    const j = (await r.json().catch(() => null)) as any
    if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`)
    const next = j as StatusResponse
    setStatus(next)
    return next
  }

  const triggerContinue = async (sid: string, t: string) => {
    if (continuingRef.current) return
    continuingRef.current = true
    try {
      const r = await fetch("/api/auditor/continue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scanId: sid, scanAccessToken: t }),
      })
      if (r.status === 409) return
    } finally {
      continuingRef.current = false
    }
  }

  const onStart = async () => {
    setError(null)
    if (!siteUrl.trim()) return

    const trackedPlan = planFromLinkId(linkId) || normalizeTrackedPlan(selectedPlanId)
    if (trackedPlan) pushEvent("scan_started", { plan: trackedPlan })

    setIsSubmitting(true)
    try {
      const r = await fetch("/api/auditor/pre-scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: siteUrl.trim() }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`)
      const sid = String(j?.scanId || "").trim()
      const t = String(j?.scanAccessToken || "").trim()
      if (!sid || !t) throw new Error("Missing scanId/token")

      setScanId(sid)
      setToken(t)
      setStep(2)

      captureAuditorScanStarted({
        scan_id: sid,
        domain: detectDomain(siteUrl),
        page_language: localeCtx.page_language,
        page_dir: localeCtx.page_dir,
        source_page: pathname || basePath,
        is_logged_in: false,
        user_id: null,
      })

      // Move to progress UI immediately; polling effect continues the pipeline.
      // This avoids blocking the start action on long /continue calls.
      void triggerContinue(sid, t)
      void loadStatus(sid, t)
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setIsSubmitting(false)
    }
  }

  /**
   * The lead form opens on a timer, not on scan completion.
   *
   * A quick scan usually lands well inside this, but not always — and the form
   * is what the visitor is here to be asked, so it must not wait on a slow site
   * or a failed scan to appear. The scan keeps advancing underneath either way.
   */
  useEffect(() => {
    if (step !== 2 || leadCaptured) return
    const t = setTimeout(() => setStep("gate"), SCAN_TEASER_MS)
    return () => clearTimeout(t)
  }, [step, leadCaptured])

  /**
   * Hand the details to the scan already running, rather than starting another.
   * lead-and-scan adopts a pre-scan when given its id and token — it verifies the
   * token and refuses a scan that some company already owns.
   */
  const submitLead = async (lead: {
    full_name: string
    phone: string
    email: string
    consent_terms: boolean
    consent_contact: boolean
  }) => {
    setError(null)
    if (!scanId || !token) {
      setError(locale === "en" ? "Missing scan. Please scan again." : "חסר מזהה סריקה. נסו לסרוק מחדש.")
      return
    }

    setIsSubmittingLead(true)
    try {
      const r = await fetch("/api/auditor/lead-and-scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...lead, url: siteUrl.trim(), scanId, scanAccessToken: token }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`)

      // The endpoint may hand back an earlier scan for this host and email —
      // one initial scan per pair — so follow whatever it returns.
      const sid = String(j?.scanId || "").trim() || scanId
      const t = String(j?.scanAccessToken || "").trim() || token
      setScanId(sid)
      setToken(t)
      setLeadCaptured(true)
      setLeadEmailCopy(Boolean(lead.consent_contact))
      setStep(3)
      void loadStatus(sid, t)
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setIsSubmittingLead(false)
    }
  }

  const startCheckout = async () => {
    setError(null)
    if (!scanId || !token) {
      setError(locale === "en" ? "Missing scan or token. Try scanning again." : "חסר מזהה סריקה/טוקן. נסו לבצע סריקה מחדש.")
      return
    }

    setIsStartingCheckout(true)
    try {
      const r = await fetch("/api/auditor/billing/checkout/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan_id: selectedPlanId, scanId, token, base_path: locale === "en" ? "/en/auditor" : undefined }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`)
      const redirectUrl = String(j?.redirect_url || "").trim()
      if (!redirectUrl) throw new Error("Missing redirect_url")
      window.location.href = redirectUrl
    } catch (e: any) {
      setError(String(e?.message || e))
      setIsStartingCheckout(false)
    }
  }

  /**
   * Drive the scan for as long as a scan is on screen — the animation, the lead
   * form, and the report.
   *
   * This was two byte-identical effects differing only in the step they checked,
   * which is why "gate" had to be added here rather than as a third copy: while
   * the visitor fills in the form the pipeline has to keep advancing, otherwise
   * the scan stalls for exactly as long as they take to type and the report they
   * were promised is not ready when they arrive.
   */
  useEffect(() => {
    const scanOnScreen = step === 2 || step === "gate" || step === 3
    if (!scanOnScreen || !scanId || !token) return
    let cancelled = false
    const stopPolling = () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
    const tick = async () => {
      let next: StatusResponse
      try {
        next = await loadStatus(scanId, token)
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message || e))
        return
      }
      if (cancelled) return
      if (isScanFinished(next)) {
        trackCompletedOnce(scanId, next)
        stopPolling()
        return
      }
      if (isScanRunning(next)) await triggerContinue(scanId, token)
    }
    tick()
    pollingIntervalRef.current = setInterval(tick, 1200)
    return () => {
      cancelled = true
      stopPolling()
    }
  }, [step, scanId, token])

  useEffect(() => {
    if (step !== 3) return
    let cancelled = false
    fetch("/api/auditor/billing/subscription/status", { method: "GET" })
      .then((r) => r.json().catch(() => null))
      .then((j: any) => {
        if (cancelled) return
        const hasSub = j?.ok === true && j?.has_subscription === true
        const active = String(j?.status || "").trim() === "active"
        setHasActiveSubscription(hasSub && active)
      })
      .catch(() => {
        if (!cancelled) setHasActiveSubscription(false)
      })
    return () => {
      cancelled = true
    }
  }, [step])

  const handleChangePlan = async () => {
    setIsChangingPlan(true)
    setError(null)
    try {
      const r = await fetch("/api/auditor/billing/subscription/change-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan_id: changePlanTarget }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || "שגיאה בהחלפת חבילה")
      setShowChangePlanModal(false)
      setHasActiveSubscription(true)
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setIsChangingPlan(false)
    }
  }

  const handleCancelSubscription = async () => {
    setIsCanceling(true)
    setError(null)
    try {
      const r = await fetch("/api/auditor/billing/subscription/cancel", { method: "POST" })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || "שגיאה בביטול")
      setShowCancelModal(false)
      setHasActiveSubscription(false)
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setIsCanceling(false)
    }
  }

  const resetToNewScan = () => {
    setStep(1)
    setError(null)
    setStatus(null)
    setScanId(null)
    setToken(null)
    router.replace(basePath)
  }

  return {
    router,
    pathname,
    linkId,
    localeCtx,
    step,
    siteUrl,
    scanId,
    token,
    status,
    selectedPlanId,
    isStartingCheckout,
    hasActiveSubscription,
    showChangePlanModal,
    showCancelModal,
    changePlanTarget,
    isChangingPlan,
    isCanceling,
    error,
    isSubmitting,
    canGoToDetails,
    step2IsWorking,
    isSubmittingLead,
    leadCaptured,
    leadEmailCopy,
    submitLead,
    setSiteUrl,
    setStep,
    setSelectedPlanId,
    setShowChangePlanModal,
    setShowCancelModal,
    setChangePlanTarget,
    onStart,
    startCheckout,
    handleChangePlan,
    handleCancelSubscription,
    resetToNewScan,
  }
}

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { captureAuditorScanCompleted, captureAuditorScanStarted, resolvePageLocale } from "@/lib/analytics/posthog-events"
import type { AuditorLocale } from "@/lib/auditor/locale"
import { normalizeTrackedPlan, planFromLinkId, pushEvent } from "@/lib/tracking/events"
import { trackAuditStarted, trackLead } from "@/lib/analytics/meta-pixel"
import { detectDomain, isScanFinished, isScanRunning } from "@/components/auditor/home/logic/auditor-home-utils"
import { isScanTerminalWithoutScore, type StatusResponse, type Step } from "@/components/auditor/home/logic/auditor-home-types"

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
  /**
   * The lead was submitted against a scan that produced no score.
   *
   * Sticky on purpose, and separate from scanEndedWithoutScore: after submit the
   * flow moves to step 3, and step 3 has to know it owes this visitor a callback
   * rather than a report. Reading the live scan state there would be wrong — the
   * adopted scan restarts as "initial" and its status changes underneath.
   */
  const [leadWithoutScore, setLeadWithoutScore] = useState(false)
  /** Ticked marketing consent — decides whether the report is also emailed. */
  const [leadEmailCopy, setLeadEmailCopy] = useState(false)

  /**
   * One scan per press, however fast the presses come.
   *
   * A ref rather than the isSubmitting state, for the same reason
   * continuingRef below is one: state updates are asynchronous, so two Enter
   * keydowns in the same frame both read isSubmitting as false and both get
   * through. The arrow button is already covered — canGoToDetails disables it
   * on isSubmitting — but the field's onKeyDown has no such guard, and Enter is
   * the input a visitor can repeat fastest.
   *
   * Cleared in onStart's finally, so a failed pre-scan can be retried.
   */
  const startingRef = useRef(false)
  const continuingRef = useRef(false)
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const completedTrackedScanRef = useRef<string | null>(null)

  const canGoToDetails = useMemo(() => siteUrl.trim().length > 0 && !isSubmitting, [siteUrl, isSubmitting])

  const okStatus = useMemo(() => (status && status.ok === true ? status : null), [status])
  const step2OkStatus = useMemo(() => (step === 2 ? okStatus : null), [step, okStatus])

  /** Rule 5: a score that exists. Nothing else opens the gate. */
  const scoreReady = okStatus?.score_ready === true
  /**
   * Rule 5's other half: a scan that ended with no score to show.
   *
   * This was `status === "failed"`, which missed the case that actually happens.
   * A blocked crawler (Cloudflare 403 on every page, say) does not fail the
   * scan — fetch_pages finalizes it through buildMinimalReport() and the row
   * ends up status "done" with score_total null. That fell between both
   * branches: not "failed", so no failure screen; no score, so the gate never
   * opened; and step2IsDone true, so the animation stopped. The visitor sat on
   * a frozen scan screen with no message and no way forward.
   */
  const scanEndedWithoutScore = isScanTerminalWithoutScore(status)

  const step2IsDone = Boolean(step2OkStatus && (step2OkStatus.done === true || step2OkStatus.status === "done" || step2OkStatus.status === "failed"))
  // The screenshot used to be half of this condition. It is always null in
  // production — AUDITOR_SCREENSHOT_ENABLED is empty there — so the scan card
  // now reports on the score alone.
  const step2IsWorking = step === 2 && Boolean(scanId && token) && !scanEndedWithoutScore && !step2IsDone && !scoreReady

  /** What the gate states out loud. Real counts or nothing. */
  const pagesScanned = typeof okStatus?.pages_scanned === "number" ? okStatus.pages_scanned : 0
  const issuesCount =
    typeof okStatus?.issues_count === "number"
      ? okStatus.issues_count
      : Array.isArray(okStatus?.issues_overview)
        ? okStatus.issues_overview.length
        : 0

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

  /*
   * The locale has to travel with the request, not just with the page.
   *
   * The pipeline stores both issues_overview and issues_overview_en, and the
   * status route already picks between them — but only when asked, and this
   * call never asked. The English page therefore rendered an English shell
   * around Hebrew findings. One parameter, no new endpoint, no engine change.
   */
  const loadStatus = async (sid: string, t: string): Promise<StatusResponse> => {
    const r = await fetch(
      `/api/auditor/status?scanId=${encodeURIComponent(sid)}&token=${encodeURIComponent(t)}&locale=${encodeURIComponent(locale)}`,
      { method: "GET" }
    )
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
    if (startingRef.current) return
    setError(null)
    if (!siteUrl.trim()) return
    startingRef.current = true

    /*
      Fires for everyone now.

      It was `if (trackedPlan) pushEvent(...)`, and trackedPlan comes from
      link_id or a chosen plan — so a visitor arriving straight at /auditor,
      organically or by typing the address, started a scan that was never
      counted. Only traffic from the marketing site's tagged CTAs was. The plan
      falls back to "organic" so the dimension stays populated instead of the
      event disappearing.
    */
    const trackedPlan = planFromLinkId(linkId) || normalizeTrackedPlan(selectedPlanId)
    const plan = trackedPlan ?? "organic"
    pushEvent("scan_started", { plan })

    /*
      The top of the funnel, reported to both destinations.

      Meta had no signal before the lead form was submitted, so campaigns were
      optimising against a conversion that only a fraction of the visitors who
      actually started a scan ever reached. AuditStarted is spelled exactly as
      the custom conversion registered in Events Manager — trackCustom, because
      it is not one of Meta's standard event names — and audit_started is the
      GA4 side of the same moment.

      Both sit under startingRef with scan_started, so a doubled press counts
      once. The payload is the plan dimension and nothing else: the visitor is
      anonymous at this point in the flow and stays that way.
    */
    trackAuditStarted({ plan })
    pushEvent("audit_started", { plan })

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
      startingRef.current = false
    }
  }

  /**
   * The lead form opens on a conclusion, not on a timer and not on a score.
   *
   * It was a flat 5 second setTimeout once, then `scoreReady` alone. Neither is
   * right. A timer shows the form while the scan is still running, so every
   * promise on it is unverified. `scoreReady` alone goes too far the other way:
   * a site that blocks the crawler produces no score at all, and those visitors
   * were shown a dead end instead of being asked for details — while their site
   * is exactly the one worth a human looking at.
   *
   * The condition is therefore "the scan reached a conclusion", with or without
   * a number behind it. Rule 5's substance is intact: nothing opens before there
   * is an answer, and the gate states which answer it got — see the noScore
   * copy in AuditorLeadGate, which drops the report promise and the counters
   * rather than showing "הדוח מוכן" over 0 pages and 0 findings.
   */
  useEffect(() => {
    if (step !== 2) return
    if (!scoreReady && !scanEndedWithoutScore) return

    /*
      A visitor who already left details is not asked again — but they were
      also never let through. The old guard returned on leadCaptured and
      nothing else moved the step, so somebody who submitted once and then ran
      a second scan sat on a finished scan screen indefinitely, success or
      failure. Send them to the result instead of to the form.
    */
    if (leadCaptured) {
      setLeadWithoutScore(!scoreReady)
      setStep(3)
      return
    }
    setStep("gate")
  }, [step, leadCaptured, scoreReady, scanEndedWithoutScore])

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
        body: JSON.stringify({ ...lead, url: siteUrl.trim(), scanId, scanAccessToken: token, locale }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`)

      // The endpoint may hand back an earlier scan for this host and email —
      // one initial scan per pair — so follow whatever it returns.
      const sid = String(j?.scanId || "").trim() || scanId
      const t = String(j?.scanAccessToken || "").trim() || token
      setScanId(sid)
      setToken(t)
      /*
        The lead, to both platforms, at the one moment it is real.

        This is the most valuable step in the funnel and until now it was
        measured nowhere: trackLead existed but was only called from the account
        register page, so a visitor who left details at the gate and never signed
        up converted silently. Fired here, after r.ok and after the row exists
        server-side, so a failed submit cannot report a lead.

        Two platforms, deliberately: Lead is Meta's standard event, generate_lead
        is GA4's, and each is what its own reporting is built around.
      */
      /*
        scan_outcome rides both events because the gate now opens on a scan that
        produced nothing as well. Without it "Lead" and "generate_lead" would
        blend a lead that can open its report immediately with one that needs a
        person to call back, and the ad reporting would read the second as the
        first at a better cost per lead.

        Captured before setLeadCaptured so it describes the scan the visitor
        actually submitted against.
      */
      const scanOutcome: "scored" | "no_score" = scoreReady ? "scored" : "no_score"
      trackLead({ source: "auditor_lead_gate", scanOutcome })
      pushEvent("generate_lead", { plan: planFromLinkId(linkId) ?? "organic", scan_outcome: scanOutcome })

      setLeadWithoutScore(scanOutcome === "no_score")
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
    /*
      The address field is cleared too.

      It never was, because the only caller used to be a retry on the same
      site. The no-score screen's button says "לסרוק כתובת אחרת", and landing
      back on step 1 with the previous address still in the box contradicts it —
      and, since the field is prefilled, invites appending to it rather than
      replacing it.

      leadCaptured is deliberately NOT cleared: the visitor already gave their
      details and asking twice in one session would be worse than not asking.
      The gate effect sends them straight to the result instead.
    */
    setSiteUrl("")
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
    scoreReady,
    scanEndedWithoutScore,
    leadWithoutScore,
    pagesScanned,
    issuesCount,
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

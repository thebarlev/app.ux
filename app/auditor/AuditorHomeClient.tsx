"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight, ChevronDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import ConfirmDialog from "@/components/ConfirmDialog"
import { IssueCard } from "@/components/auditor/scan-results/IssueCard"
import { IssueChecklist } from "@/components/auditor/scan-results/IssueChecklist"
import { ScanProgress } from "@/components/auditor/scan-progress/ScanProgress"
import { ScanHistoryAccordion } from "@/components/auditor/scan-history/ScanHistoryAccordion"
import type { AuditorLocale } from "@/lib/auditor/locale"
import { PLAN_PRICES_USD } from "@/lib/auditor/pricing"
import { normalizeTrackedPlan, planFromLinkId, pushEvent } from "@/lib/tracking/events"

type Step = 1 | 2 | 3

const SCAN_MESSAGES_HE = [
  "בודק מבנה דפים…", "מנתח תוכן לכלי AI…", "בודק schema markup…", "מעריך נראות ב-ChatGPT…",
  "סורק מטא-דאטה…", "בודק structured data…", "מנתח ביצועי טעינה…", "בוחן קישורים פנימיים…",
  "בודק נגישות תוכן…", "מחשב ציון AI…",
]
const SCAN_MESSAGES_EN = [
  "Checking page structure…", "Analyzing AI content…", "Checking schema…", "Evaluating visibility…",
  "Scanning metadata…", "Checking structured data…", "Analyzing performance…", "Checking links…",
  "Checking accessibility…", "Computing AI score…",
]

const WHATSAPP_PHONE = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_AUDITOR_WHATSAPP_PHONE) || "972545215193"
const WHATSAPP_URL = `https://wa.me/${String(WHATSAPP_PHONE).replace(/^0+/, "")}`

type StatusResponse =
  | {
      ok: true
      status: string
      step: string
      screenshot_url?: string | null
      score_total: number | null
      score_search: number | null
      score_ai: number | null
      category_scores: Record<string, number>
      issues_overview: string[]
      confidence_level: string | null
      warning: string | null
      done: boolean
      report_public: any | null
      updated_at: string
      finished_at: string | null
    }
  | { ok: false; error: string }

// ─── AI Score Hero Component ──────────────────────────────────────────────
const AI_SCORE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&display=swap');
@keyframes scoreReveal {
  from { opacity:0; transform: scale(.72) translateY(8px); }
  to   { opacity:1; transform: scale(1) translateY(0); }
}
@keyframes badgeIn {
  from { opacity:0; transform: translateY(6px); }
  to   { opacity:1; transform: translateY(0); }
}
@keyframes counterFlicker {
  0%  { opacity: 1; }
  48% { opacity: 1; }
  50% { opacity: .3; }
  52% { opacity: 1; }
  100%{ opacity: 1; }
}
@keyframes scanLine {
  0%   { transform: translateY(-100%); opacity: .6; }
  100% { transform: translateY(400%); opacity: 0; }
}
@keyframes msgFade {
  0%   { opacity: 0; transform: translateY(4px); }
  15%  { opacity: 1; transform: translateY(0); }
  80%  { opacity: 1; }
  100% { opacity: 0; }
}
.aisc-wrap { width: 100%; }
.aisc-card {
  border-radius: 20px;
  padding: 44px 28px 38px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  background: #faf8f5;
  border: 1px solid rgba(0,0,0,.08);
  box-shadow: 0 4px 32px rgba(0,0,0,.07);
  position: relative;
  overflow: hidden;
  font-family: 'Syne', sans-serif;
}
.aisc-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255,255,255,.18) 0%, transparent 60%);
  pointer-events: none;
}
.aisc-scanline {
  position: absolute;
  left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(45,90,78,.18), transparent);
  animation: scanLine 2.2s ease-in-out infinite;
  pointer-events: none;
}
.aisc-eyebrow {
  font-size: .7rem;
  font-weight: 700;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: #9b8e82;
  display: flex;
  align-items: center;
  gap: 10px;
  position: relative;
  z-index: 1;
}
.aisc-eyebrow::before, .aisc-eyebrow::after {
  content: '';
  display: block;
  width: 32px;
  height: 1px;
  background: #c8bfb6;
}
.aisc-number-wrap {
  position: relative;
  z-index: 1;
  line-height: 1;
}
.aisc-number-final {
  font-size: 8rem;
  font-weight: 800;
  letter-spacing: -.05em;
  font-variant-numeric: tabular-nums;
  animation: scoreReveal .55s cubic-bezier(.22,.68,0,1.3) both;
  line-height: 1;
}
.aisc-number-counter {
  font-size: 8rem;
  font-weight: 800;
  letter-spacing: -.05em;
  font-variant-numeric: tabular-nums;
  color: #c8bfb6;
  animation: counterFlicker 1.8s ease-in-out infinite;
  line-height: 1;
  font-family: 'DM Mono', monospace;
}
.aisc-badge {
  font-size: .84rem;
  font-weight: 700;
  border-radius: 99px;
  padding: 5px 18px;
  letter-spacing: .03em;
  animation: badgeIn .4s .12s ease both;
  position: relative;
  z-index: 1;
}
.aisc-desc {
  font-size: .9rem;
  color: #6b6359;
  max-width: 290px;
  text-align: center;
  line-height: 1.55;
  animation: badgeIn .4s .22s ease both;
  position: relative;
  z-index: 1;
}
.aisc-scanning-msg {
  font-size: .8rem;
  color: #9b8e82;
  animation: msgFade 2.8s ease both;
  min-height: 1.2em;
  position: relative;
  z-index: 1;
  font-family: 'DM Mono', monospace;
  letter-spacing: .02em;
}
`

type Grade = { label: string; desc: string; color: string; bg: string; border: string; scoreColor: string }

function getGrade(score: number, locale: AuditorLocale): Grade {
  if (locale === "en") {
    if (score < 25) return { label: "Poor", desc: "Your site is nearly invisible to AI — act now.", color: "#b91c1c", bg: "#fef2f2", border: "#fca5a5", scoreColor: "#b91c1c" }
    if (score < 50) return { label: "Weak", desc: "Minimal AI presence — competitors are ahead.", color: "#b45309", bg: "#fffbeb", border: "#fcd34d", scoreColor: "#c2740a" }
    if (score < 75) return { label: "Fair", desc: "Good base, but not enough for AI to find you.", color: "#1d4ed8", bg: "#eff6ff", border: "#93c5fd", scoreColor: "#1d4ed8" }
    return { label: "Excellent", desc: "Your site is ready for the AI era.", color: "#15803d", bg: "#f0fdf4", border: "#86efac", scoreColor: "#15803d" }
  }
  if (score < 25) return { label: "גרוע", desc: "האתר שלך כמעט בלתי נראה לכלי AI — דחוף לטפל בזה", color: "#b91c1c", bg: "#fef2f2", border: "#fca5a5", scoreColor: "#b91c1c" }
  if (score < 50) return { label: "חלש", desc: "נוכחות AI מינימלית — המתחרים שלכם כבר שם", color: "#b45309", bg: "#fffbeb", border: "#fcd34d", scoreColor: "#c2740a" }
  if (score < 75) return { label: "לא סביר", desc: "יש בסיס טוב, אבל עדיין לא מספיק כדי שה-AI ימצא אתכם", color: "#1d4ed8", bg: "#eff6ff", border: "#93c5fd", scoreColor: "#1d4ed8" }
  return { label: "מעולה", desc: "האתר שלך מוכן היטב לעידן ה-AI", color: "#15803d", bg: "#f0fdf4", border: "#86efac", scoreColor: "#15803d" }
}

function AiScoreHero({ status, locale }: { status: StatusResponse | null; locale: AuditorLocale }) {
  const okStatus = status && status.ok === true ? status : null
  const finalScore = okStatus && typeof okStatus.score_ai === "number" ? okStatus.score_ai : null
  const isReady = finalScore !== null

  const [counter, setCounter] = useState(0)
  const [msgIdx, setMsgIdx] = useState(0)

  // Random counter effect while scanning
  useEffect(() => {
    if (isReady) return
    const id = setInterval(() => {
      setCounter(prev => {
        // Drift upward slowly with random jumps — feels like scanning
        const jump = Math.floor(Math.random() * 12) - 3
        const next = prev + jump
        return Math.max(1, Math.min(next, 89)) // cap at 89 so real score is always a reveal
      })
    }, 160)
    return () => clearInterval(id)
  }, [isReady])

  const scanMessages = locale === "en" ? SCAN_MESSAGES_EN : SCAN_MESSAGES_HE
  useEffect(() => {
    if (isReady) return
    const id = setInterval(() => {
      setMsgIdx(i => (i + 1) % scanMessages.length)
    }, 2800)
    return () => clearInterval(id)
  }, [isReady, scanMessages])

  const grade = isReady ? getGrade(finalScore!, locale) : null

  return (
    <div className="aisc-wrap">
      <style>{AI_SCORE_CSS}</style>
      <div className="aisc-card">
        {!isReady && <div className="aisc-scanline" />}

        <div className="aisc-eyebrow" dir={locale === "en" ? "ltr" : "rtl"}>
          {locale === "en" ? "AI presence score" : "ציון נוכחות AI"}
        </div>

        <div className="aisc-number-wrap">
          {isReady ? (
            <div className="aisc-number-final" dir="ltr" style={{ color: grade!.scoreColor }}>
              {finalScore}
            </div>
          ) : (
            <div className="aisc-number-counter" dir="ltr">{counter}</div>
          )}
        </div>

        {isReady ? (
          <>
            <div
              className="aisc-badge"
              style={{ color: grade!.color, background: grade!.bg, border: `1px solid ${grade!.border}` }}
            >
              {grade!.label}
            </div>
            <div className="aisc-desc">{grade!.desc}</div>
          </>
        ) : (
          <div className="aisc-scanning-msg" key={msgIdx}>
            {scanMessages[msgIdx]}
          </div>
        )}
      </div>
    </div>
  )
}

export default function AuditorHomeClient(props?: { locale?: AuditorLocale; basePath?: string }) {
  const locale = props?.locale ?? "he"
  const basePath = props?.basePath ?? "/auditor"
  const router = useRouter()
  const sp = useSearchParams()
  const linkId = String(sp.get("link_id") || "").trim() || "a_basic"

  const [step, setStep] = useState<Step>(1)

  // Step 1
  const [siteUrl, setSiteUrl] = useState("")

  // Step 2: no lead form — user goes to /auditor/register

  // Step 3
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
  const continuingRef = useRef(false)
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const canGoToDetails = useMemo(() => siteUrl.trim().length > 0 && !isSubmitting, [siteUrl, isSubmitting])

  const step2OkStatus = useMemo(() => (step === 2 && status && status.ok === true ? status : null), [step, status])
  const step2HasScreenshot = Boolean(step2OkStatus?.screenshot_url)
  const step2HasAllScores =
    typeof step2OkStatus?.score_total === "number" &&
    typeof step2OkStatus?.score_search === "number" &&
    typeof step2OkStatus?.score_ai === "number"
  const step2IsFailed = Boolean(step2OkStatus && step2OkStatus.status === "failed")
  const step2IsDone = Boolean(
    step2OkStatus && (step2OkStatus.done === true || step2OkStatus.status === "done" || step2OkStatus.status === "failed")
  )
  const step2IsWorking =
    step === 2 && Boolean(scanId && token) && !step2IsFailed && !step2IsDone && (!step2HasScreenshot || !step2HasAllScores)

  // Resume from query params: /auditor?scanId=...&token=...
  useEffect(() => {
    const qsScanId = String(sp.get("scanId") || "").trim()
    const qsToken = String(sp.get("token") || "").trim()
    if (qsScanId && qsToken) {
      setScanId(qsScanId)
      setToken(qsToken)
      setStep(3)
    }
  }, [sp])

  const onStart = async () => {
    setError(null)
    if (!siteUrl.trim()) return

    const trackedPlan = planFromLinkId(linkId) || normalizeTrackedPlan(selectedPlanId)
    if (trackedPlan) {
      pushEvent("scan_started", {
        plan: trackedPlan,
      })
    }

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

      for (let i = 0; i < 3; i++) {
        await triggerContinue(sid, t)
        await new Promise((res) => setTimeout(res, 500))
        const st = await loadStatus(sid, t)
        if ((st as any)?.ok === true && (st as any).screenshot_url) break
      }
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setIsSubmitting(false)
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

  const loadStatus = async (sid: string, t: string): Promise<StatusResponse> => {
    const r = await fetch(`/api/auditor/status?scanId=${encodeURIComponent(sid)}&token=${encodeURIComponent(t)}`, {
      method: "GET",
    })
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

  // Helper: scan is finished (stop polling)
  const isScanFinished = (s: StatusResponse | null) => {
    if (!s || (s as any).ok !== true) return false
    const status = String((s as any).status || "").toLowerCase()
    const done = (s as any).done === true || ["done", "failed", "completed", "finished"].includes(status)
    return done
  }
  // Helper: scan is still running (continue polling + triggerContinue)
  const isScanRunning = (s: StatusResponse | null) => {
    if (!s || (s as any).ok !== true) return false
    const status = String((s as any).status || "").toLowerCase()
    return status === "running" || status === "queued"
  }

  // Step 3 polling: only while status is running. Stop when finished, redirect EN to checkout.
  useEffect(() => {
    if (step !== 3) return
    if (!scanId || !token) return

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

  // Step 2: poll only while status is running. Stop when scan is finished.
  useEffect(() => {
    if (step !== 2) return
    if (!scanId || !token) return

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

  // Step 3: fetch subscription status when entering step 3
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

  // ─── Step 3 dashboard ─────────────────────────────────────────────────────
  const renderStep3 = () => {
    const okStatus = status && status.ok === true ? status : null
    const issueCount = okStatus?.done ? (okStatus.issues_overview?.length ?? 0) : 0

    const isRtl = locale !== "en"
    const textAlign = "text-start"

    return (
      <div className="space-y-6" dir={isRtl ? "rtl" : "ltr"}>
        {/* Subscriber header */}
        {hasActiveSubscription && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <Link href={basePath} className="shrink-0">
                <Image src="/brand/vow.svg" alt="VOW" width={100} height={36} />
              </Link>
              <div className="flex flex-wrap items-center gap-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      {locale === "en" ? "My account" : "החשבון שלי"}
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[200px]">
                    <DropdownMenuItem asChild>
                      <Link href={`${basePath}/invoices`}>{locale === "en" ? "View & download invoices" : "צפייה והורדת חשבוניות"}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`${basePath}/settings`}>{locale === "en" ? "Update profile" : "עדכון פרטים אישיים"}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowChangePlanModal(true)}>
                      {locale === "en" ? "Change plan" : "מעביר חבילה"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowCancelModal(true)} variant="destructive">
                      {locale === "en" ? "Cancel plan" : "ביטול חבילה"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-[var(--radius)] border border-[#25D366]/40 bg-[#25D366]/10 px-3 py-2 text-sm font-medium text-[#25D366] hover:bg-[#25D366]/20"
                >
                  <span>WhatsApp</span>
                  <span>{locale === "en" ? "Contact" : "צור קשר"}</span>
                </a>
              </div>
            </div>
          )}

        {/* Main card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {/* Header */}
          <div className={`mb-6 flex flex-wrap items-center justify-between gap-4 ${textAlign}`}>
            <h2 className="text-xl font-bold text-slate-800">{locale === "en" ? "Audit report" : "דוח ביקורת"}</h2>
            <span className="font-mono text-xs text-slate-500">
              {scanId ? `# ${scanId}` : (locale === "en" ? "Generating scan…" : "מייצר סריקה…")}
            </span>
          </div>

          {/* Loading — no API response yet */}
          {!okStatus && (
            <ScanProgress
              currentStep=""
              isDone={false}
              locale={locale === "en" ? "en" : "he"}
            />
          )}

          {/* In-progress — API responded but scan not done yet */}
          {okStatus && !okStatus.done && (
            <ScanProgress
              currentStep={String(okStatus.step ?? "")}
              isDone={false}
              locale={locale === "en" ? "en" : "he"}
            />
          )}

          {/* Done — unified SaaS layout */}
          {okStatus?.done && (
            <div className="space-y-6">
              {okStatus.warning && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
                  <span className="shrink-0">⚠</span>
                  <span className="text-sm">{okStatus.warning}</span>
                </div>
              )}

              {/* Issues | Score — grid (matches AuditorScanResults, EnAuditorScanResultsCard) */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="space-y-3 lg:col-span-8">
                  <div className={textAlign}>
                    <h3 className="text-base font-semibold text-slate-800">
                      {locale === "en" ? "Areas to improve" : "דברים שכדאי לשפר"}
                    </h3>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {locale === "en" ? "Prioritized by severity" : "ממויין לפי חומרה והשפעה"}
                    </p>
                  </div>
                  {issueCount === 0 ? (
                    <div className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-500 ${textAlign}`}>
                      {locale === "en" ? "No significant issues found" : "לא נמצאו בעיות כלליות משמעותיות"}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(okStatus.issues_overview || []).map((issue: string, idx: number) => (
                        <IssueCard
                          key={idx}
                          severity="WARN"
                          text={String(issue)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-4 ${textAlign}`}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                    {locale === "en" ? "Audit score" : "ציון כללי"}
                  </p>
                  <div className={`mt-2 text-4xl font-bold text-[var(--primary)] ${textAlign}`}>
                    {typeof (okStatus as any).score_total === "number" ? (okStatus as any).score_total : "—"}
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    <div className={textAlign}>
                      {locale === "en" ? "AI Readiness" : "מוכנות AI"}: {typeof (okStatus as any).score_ai === "number" ? (okStatus as any).score_ai : "—"}
                    </div>
                    <div className={textAlign}>
                      {locale === "en" ? "SEO Readiness" : "חשיפה בחיפוש"}: {typeof (okStatus as any).score_search === "number" ? (okStatus as any).score_search : "—"}
                    </div>
                  </div>
                </div>
              </div>

              {/* What's Missing — checklist */}
              <IssueChecklist
                items={(okStatus.issues_overview || []).map((s: unknown) => String(s))}
                title={locale === "en" ? "What's missing" : "מה חסר"}
                description={locale === "en" ? "Items to address for better AI & SEO visibility" : "מה צריך לעשות"}
                emptyMessage={locale === "en" ? "No major issues found." : "לא נמצאו בעיות מהותיות."}
              />

              {/* Pricing — hide when has active subscription */}
              {!hasActiveSubscription && (
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className={textAlign}>
                    <h3 className="text-base font-bold text-slate-800">
                      {locale === "en" ? "Pricing — SEO / AI" : "מחירון — SEO / AI אורגני"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {locale === "en" ? "Choose a plan for the full report & improvement plan. Monthly billing, cancel anytime." : "בחרו חבילה כדי לראות את הדוח המלא ולקבל תכנית שיפור. החיוב חודשי ומתחדש, וכולל מע״מ."}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {(["basic", "pro", "premium"] as const).map((plan) => (
                      <div
                        key={plan}
                        className={`cursor-pointer rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all ${
                          selectedPlanId === plan ? "ring-2 ring-primary ring-offset-2" : ""
                        }`}
                        onClick={() => setSelectedPlanId(plan)}
                        role="button"
                        tabIndex={0}
                      >
                        {plan === "pro" && (
                          <span className="mb-2 inline-block rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] font-bold text-white">
                            {locale === "en" ? "Most popular" : "המומלץ ביותר"}
                          </span>
                        )}
                        <h4 className="font-bold text-slate-800">
                          {plan === "basic" && (locale === "en" ? "Basic" : "בסיסי")}
                          {plan === "pro" && (locale === "en" ? "Pro" : "מקצועי")}
                          {plan === "premium" && (locale === "en" ? "Premium" : "מומחים")}
                        </h4>
                        <div className="mt-1 text-sm text-slate-600">
                          {plan === "basic" && (locale === "en" ? <>${PLAN_PRICES_USD.basic}/mo</> : <>97 ₪/חודש</>)}
                          {plan === "pro" && (locale === "en" ? <>${PLAN_PRICES_USD.pro}/mo</> : <>197 ₪/חודש</>)}
                          {plan === "premium" && (locale === "en" ? <>From ${PLAN_PRICES_USD.premium}/mo</> : <>החל מ־997 ₪/חודש</>)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <p className="text-xs text-slate-500">
                      {locale === "en" ? "After payment you'll get an email with login link." : "מיד לאחר התשלום נשלח אליכם מייל עם קישור להתחברות ולהמשך."}
                    </p>
                    <Button onClick={startCheckout} disabled={isStartingCheckout} className="gap-2">
                      {isStartingCheckout ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {locale === "en" ? "Processing…" : "ממשיכים לתשלום…"}
                        </>
                      ) : (
                        locale === "en" ? "Continue to payment" : "המשך לתשלום"
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-6">
                <a
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                  href={scanId && token ? `${basePath}/${encodeURIComponent(scanId)}?token=${encodeURIComponent(token)}` : basePath}
                >
                  <span>🔗</span>
                  {locale === "en" ? "Share report" : "שיתוף הדוח"}
                </a>
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep(1)
                    setError(null)
                    setStatus(null)
                    setScanId(null)
                    setToken(null)
                    router.replace(basePath)
                  }}
                >
                  <span className={locale === "en" ? "mr-2" : "ml-2"}>＋</span>
                  {locale === "en" ? "New scan" : "סריקה חדשה"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Scan history — always visible, collapsed by default ── */}
        <ScanHistoryAccordion
          locale={locale === "en" ? "en" : "he"}
          currentScanId={scanId}
        />
      </div>
    )
  }

  // ─── Main render ───────────────────────────────────────────────────────────
  return (
    <div dir={locale === "en" ? "ltr" : "rtl"} className="space-y-6">
      {error ? (
        <div className="rounded-ui border border-danger/40 bg-danger/5 p-3 text-sm text-danger text-start">{error}</div>
      ) : null}

      {/* ── Step 1 ── */}
      {step === 1 && (
        <div className="mx-auto flex min-h-[70svh] w-full max-w-2xl flex-col items-center justify-center gap-10 text-center">
          <Image src="/brand/vow.svg" alt="VOW" width={140} height={48} priority />

          <h1 className="text-balance text-3xl font-semibold leading-tight md:text-4xl">
            {locale === "en" ? (
              <>How visible is your site in Google & AI search?</>
            ) : (
              <>
                כמה סיכוי יש לאתר שלך להופיע
                <br />
                בגוגל ובחיפוש AI?
              </>
            )}
          </h1>

          <div className={`w-full max-w-xl ${locale === "en" ? "flex flex-row" : ""}`} dir={locale === "en" ? "ltr" : undefined}>
            <div className="relative w-full">
              {locale === "en" ? (
                <>
                  <Input
                    value={siteUrl}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") onStart() }}
                    placeholder="Website URL / landing page"
                    dir="ltr"
                    style={{ direction: "ltr" }}
                    className="h-12 rounded-full bg-white pr-12 pl-5 !text-left placeholder:!text-left shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={onStart}
                    disabled={!canGoToDetails}
                    aria-label="Continue"
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground transition hover:text-fg disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onStart}
                    disabled={!canGoToDetails}
                    aria-label="המשך"
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground transition hover:text-fg disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
                  </button>
                  <Input
                    value={siteUrl}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") onStart() }}
                    placeholder="כתובת אתר / עמוד נחיתה"
                    dir="ltr"
                    style={{ direction: "ltr" }}
                    className="h-12 rounded-full bg-white pr-12 pl-5 !text-left placeholder:!text-left shadow-sm"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2 ── */}
      {step === 2 && (
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 text-center">
          <Image src="/brand/vow.svg" alt="VOW" width={140} height={48} priority={false} />

          <div className="space-y-2">
            <h1 className="text-3xl font-semibold md:text-4xl">{locale === "en" ? "Get your site score" : "קבלו ציון לאתר"}</h1>
            <p className="text-sm font-medium text-muted-foreground md:text-base">
              {locale === "en" ? "How visible is your site in Google & AI?" : "מהם הסיכויים של האתר שלכם להופיע בגוגל ו-AI"}
            </p>
          </div>

          {/* Screenshot preview */}
          <div className="w-full">
            <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-ui border border-border bg-white shadow-sm">
              {status && status.ok === true && status.screenshot_url ? (
                <Image
                  src={status.screenshot_url}
                  alt="Site preview"
                  width={1440}
                  height={900}
                  className="h-auto w-full"
                />
              ) : (
                <div className="aspect-[16/9] w-full bg-gradient-to-b from-white to-muted" />
              )}
              {step2IsWorking && (
                <div className="absolute right-3 top-3 rounded-full border border-border bg-white/80 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur-[1px]">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {locale === "en" ? "Scanning…" : "סורקים…"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* AI Score Hero */}
          <AiScoreHero status={status} locale={locale} />

          <div className="w-full max-w-md space-y-1 text-center">
            <h2 className="">{locale === "en" ? "Want the full report?" : "רוצים לראות את הדוח המלא?"}</h2>
            <h3 className="text-[18px]">
              {locale === "en" ? "Sign up, pay & get instant access to the full report." : "הירשמו, שלמו ותעברו ישר לדוח המלא עם כל התוצאות וההמלצות."}
            </h3>
          </div>

          {/* CTA: go to register → payment → Step 3 */}
          <div className="w-full max-w-md">
            <Link
              href={
                scanId && token
                  ? `${basePath}/register?link_id=${encodeURIComponent(linkId)}&scanId=${encodeURIComponent(scanId)}&token=${encodeURIComponent(token)}`
                  : `${basePath}/register?link_id=${encodeURIComponent(linkId)}`
              }
              className="inline-flex h-14 w-full items-center justify-center rounded-none bg-black text-base text-white hover:bg-black/90"
            >
              {locale === "en" ? "Sign up & continue to payment" : "הרשמה והמשך לתשלום"}
            </Link>
          </div>
        </div>
      )}

      {/* ── Step 3 ── */}
      {step === 3 && renderStep3()}

      {/* Change plan modal */}
      <Dialog open={showChangePlanModal} onOpenChange={setShowChangePlanModal}>
        <DialogContent className="max-w-md bg-white text-gray-900 [&_.text-muted-foreground]:text-gray-600" dir={locale === "en" ? "ltr" : "rtl"}>
          <DialogHeader>
            <DialogTitle>{locale === "en" ? "Change plan" : "מעביר חבילה"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{locale === "en" ? "Choose a new plan. Change takes effect at next billing cycle." : "בחרו חבילה חדשה. השינוי ייכנס לתוקף בתחילת תקופת החיוב הבאה."}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setChangePlanTarget("basic")}
                className={`flex-1 rounded-ui border p-4 ${locale === "en" ? "text-left" : "text-right"} transition ${
                  changePlanTarget === "basic" ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <div className="font-semibold">{locale === "en" ? "Basic" : "בסיסי"}</div>
                <div className="text-sm text-muted-foreground">{locale === "en" ? `$${PLAN_PRICES_USD.basic}/mo` : "97 ₪/חודש"}</div>
              </button>
              <button
                type="button"
                onClick={() => setChangePlanTarget("pro")}
                className={`flex-1 rounded-ui border p-4 ${locale === "en" ? "text-left" : "text-right"} transition ${
                  changePlanTarget === "pro" ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <div className="font-semibold">{locale === "en" ? "Pro" : "מקצועי"}</div>
                <div className="text-sm text-muted-foreground">{locale === "en" ? `$${PLAN_PRICES_USD.pro}/mo` : "497 ₪/חודש"}</div>
              </button>
            </div>
            <div className={`flex gap-2 ${locale === "en" ? "justify-end" : "justify-end"}`}>
              <Button variant="outline" onClick={() => setShowChangePlanModal(false)}>
                {locale === "en" ? "Cancel" : "ביטול"}
              </Button>
              <Button onClick={handleChangePlan} disabled={isChangingPlan}>
                {isChangingPlan ? (
                  <>
                    <Loader2 className={`h-4 w-4 animate-spin ${locale === "en" ? "mr-2" : "ml-2"}`} />
                    {locale === "en" ? "Updating…" : "מעדכן…"}
                  </>
                ) : (
                  locale === "en" ? "Confirm" : "אישור"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel subscription modal */}
      <ConfirmDialog
        open={showCancelModal}
        onOpenChange={setShowCancelModal}
        title={locale === "en" ? "Cancel subscription" : "ביטול מנוי"}
        message={locale === "en" ? "Subscription ends at current billing period. No further charges." : "המנוי יסתיים בסוף תקופת החיוב הנוכחית. לא יגבה חיוב נוסף."}
        confirmText={locale === "en" ? "Confirm cancel" : "אשר ביטול"}
        cancelText={locale === "en" ? "Back" : "חזור"}
        destructive
        onConfirm={handleCancelSubscription}
      />
    </div>
  )
}
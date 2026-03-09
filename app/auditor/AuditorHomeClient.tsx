"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ChevronDown, Loader2 } from "lucide-react"
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
import type { AuditorLocale } from "@/lib/auditor/locale"
import { PLAN_PRICES_USD } from "@/lib/auditor/pricing"

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

        <div className="aisc-eyebrow">ציון נוכחות AI</div>

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

// ─── Step 3 Dashboard styles ───────────────────────────────────────────────
const dashboardCss = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;500&display=swap');

.audit-root {
  --bg: #f4f1ed;
  --surface: #faf8f5;
  --surface-2: #ede9e3;
  --border: rgba(0,0,0,0.09);
  --accent: #2d5a4e;
  --accent-dim: rgba(45,90,78,0.09);
  --amber: #b45309;
  --amber-dim: rgba(180,83,9,0.09);
  --red: #c0392b;
  --text-1: #1a1714;
  --text-2: #6b6359;
  --radius: 14px;
  font-family: 'Syne', sans-serif;
  color: var(--text-1);
  background: var(--bg);
  min-height: 100vh;
  padding: 2rem 1rem;
  direction: rtl;
}

.audit-card {
  max-width: 780px;
  margin: 0 auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0,0,0,.04), 0 12px 40px rgba(0,0,0,.08);
  animation: fadeUp .45s cubic-bezier(.22,.68,0,1.2) both;
}

@keyframes fadeUp {
  from { opacity:0; transform: translateY(24px) scale(.98); }
  to   { opacity:1; transform: translateY(0) scale(1); }
}

.audit-header {
  position: relative;
  padding: 28px 28px 24px;
  background: linear-gradient(135deg, #ede9e3 0%, #e8e3dc 100%);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.audit-header::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 60% 100% at 90% 50%, rgba(45,90,78,.06), transparent);
  pointer-events: none;
}

.audit-title {
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -.02em;
  color: var(--text-1);
  margin: 0;
}

.audit-scan-id {
  font-family: 'DM Mono', monospace;
  font-size: .7rem;
  color: var(--accent);
  background: var(--accent-dim);
  border: 1px solid rgba(45,90,78,.2);
  border-radius: 6px;
  padding: 3px 10px;
  white-space: nowrap;
  letter-spacing: .04em;
  align-self: flex-start;
}

.audit-scan-id.generating {
  color: var(--text-2);
  background: rgba(0,0,0,.04);
  border-color: var(--border);
  animation: blink 1.4s ease-in-out infinite;
}

@keyframes blink { 0%,100%{opacity:1} 50%{opacity:.4} }

.audit-body {
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.audit-loading {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-2);
  font-size: .875rem;
}

.spinner {
  width: 16px; height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin .7s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

.audit-progress-block {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: .8rem;
}

.progress-label { color: var(--text-2); }

.progress-step {
  font-family: 'DM Mono', monospace;
  font-size: .72rem;
  color: var(--accent);
  background: var(--accent-dim);
  border-radius: 4px;
  padding: 2px 8px;
  direction: ltr;
}

.progress-bar-track {
  height: 4px;
  background: var(--border);
  border-radius: 99px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), #3d7a6a);
  border-radius: 99px;
  animation: shimmer 1.8s ease-in-out infinite;
}

@keyframes shimmer {
  0%   { width: 15%; opacity: .7; }
  50%  { width: 72%; opacity: 1; }
  100% { width: 15%; opacity: .7; }
}

.audit-warning {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: var(--amber-dim);
  border: 1px solid rgba(245,166,35,.22);
  border-radius: 10px;
  padding: 14px 16px;
  font-size: .84rem;
  color: var(--amber);
  line-height: 1.55;
}

.audit-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.stat-cell {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px 14px 13px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.stat-value {
  font-size: 1.65rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.stat-value.teal  { color: var(--accent);  }
.stat-value.amber { color: var(--amber); }
.stat-value.red   { color: var(--red);   }
.stat-value.muted { color: var(--text-2); font-size: .9rem; font-family: 'DM Mono', monospace; margin-top: 4px; }

.stat-label {
  font-size: .68rem;
  color: var(--text-2);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.audit-divider {
  height: 1px;
  background: var(--border);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.section-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}

.section-title {
  font-size: .76rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: var(--text-2);
}

.audit-empty {
  background: var(--surface-2);
  border: 1px dashed rgba(255,255,255,.07);
  border-radius: 10px;
  padding: 24px 20px;
  text-align: center;
  color: var(--text-2);
  font-size: .84rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.audit-empty-icon { font-size: 1.5rem; opacity: .5; }

.audit-issues {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.audit-issue-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 13px 16px;
  font-size: .84rem;
  line-height: 1.55;
  color: var(--text-1);
  animation: fadeItem .3s ease both;
}

.audit-issue-item:nth-child(1){ animation-delay:.05s }
.audit-issue-item:nth-child(2){ animation-delay:.10s }
.audit-issue-item:nth-child(3){ animation-delay:.15s }
.audit-issue-item:nth-child(4){ animation-delay:.20s }
.audit-issue-item:nth-child(5){ animation-delay:.25s }

@keyframes fadeItem {
  from { opacity:0; transform: translateX(8px); }
  to   { opacity:1; transform: translateX(0); }
}

.issue-number {
  font-family: 'DM Mono', monospace;
  font-size: .68rem;
  color: var(--accent);
  background: var(--accent-dim);
  border-radius: 5px;
  padding: 2px 7px;
  flex-shrink: 0;
  margin-top: 2px;
}

.audit-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-new-scan {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--accent);
  color: #f4f1ed;
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: .84rem;
  border: none;
  border-radius: 8px;
  padding: 10px 22px;
  cursor: pointer;
  transition: opacity .18s, transform .18s;
  white-space: nowrap;
}

.btn-new-scan:hover { opacity:.88; transform: translateY(-1px); }
.btn-new-scan:active { transform: translateY(0); }

.btn-share {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: 'Syne', sans-serif;
  font-size: .82rem;
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
  border: 1px solid rgba(45,90,78,.25);
  border-radius: 8px;
  padding: 9px 18px;
  transition: background .18s, transform .18s;
}

.btn-share:hover { background: var(--accent-dim); transform: translateY(-1px); }

.pricing-wrap {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px;
}

.pricing-title {
  font-size: 1.15rem;
  font-weight: 800;
  margin: 0;
}

.pricing-subtitle {
  margin-top: 6px;
  font-size: .85rem;
  color: var(--text-2);
  line-height: 1.45;
}

.pricing-grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.plan-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px 16px 14px;
  text-align: right;
  position: relative;
  cursor: pointer;
  transition: transform .18s, border-color .18s, box-shadow .18s;
}

.plan-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 26px rgba(0,0,0,.06);
}

.plan-card.selected {
  border-color: rgba(45,90,78,.5);
  box-shadow: 0 0 0 3px rgba(45,90,78,.10);
}

.plan-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  font-size: .72rem;
  font-weight: 700;
  color: #fff;
  background: #2d5a4e;
  padding: 4px 10px;
  border-radius: 999px;
}

.plan-name {
  font-weight: 800;
  font-size: 1rem;
  margin: 0;
}

.plan-price {
  margin-top: 6px;
  font-size: .9rem;
  color: var(--text-2);
}

.plan-price strong {
  font-size: 1.05rem;
  color: var(--text-1);
}

.plan-radio {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}

.plan-features {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  display: grid;
  gap: 8px;
  font-size: .82rem;
  color: var(--text-2);
}

.plan-feature {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  line-height: 1.35;
}

.plan-feature .check {
  color: var(--accent);
  font-weight: 800;
}

.pricing-cta-row {
  margin-top: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.pricing-note {
  font-size: .78rem;
  color: var(--text-2);
}

.btn-checkout {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: 10px;
  padding: 12px 18px;
  background: #000;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  transition: opacity .18s, transform .18s;
}

.btn-checkout:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.btn-checkout:active { transform: translateY(1px); }

@media (max-width: 520px) {
  .audit-stats { grid-template-columns: repeat(2, 1fr); }
  .audit-footer { flex-direction: column-reverse; align-items: stretch; }
  .btn-new-scan, .btn-share { justify-content: center; }
}

@media (max-width: 860px) {
  .pricing-grid { grid-template-columns: 1fr; }
}
`

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onStart = async () => {
    setError(null)
    if (!siteUrl.trim()) return
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
        await new Promise((res) => setTimeout(res, 1200))
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

  // Step 3 polling + gentle self-continue.
  useEffect(() => {
    if (step !== 3) return
    if (!scanId || !token) return

    let cancelled = false
    let interval: ReturnType<typeof setInterval> | null = null
    const stop = () => {
      if (interval) clearInterval(interval)
      interval = null
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
      const done =
        (next as any)?.ok === true &&
        ((next as any).done === true || (next as any).status === "done" || (next as any).status === "failed")
      if (done) {
        stop()
        return
      }

      await triggerContinue(scanId, token)
    }

    tick()
    interval = setInterval(tick, 2000)
    return () => {
      cancelled = true
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, scanId, token])

  // Step 2: keep progressing scan so score strip can populate.
  useEffect(() => {
    if (step !== 2) return
    if (!scanId || !token) return

    let cancelled = false
    let interval: ReturnType<typeof setInterval> | null = null
    const stop = () => {
      if (interval) clearInterval(interval)
      interval = null
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

      const okStatus = next && (next as any).ok === true ? (next as any) : null
      const done = okStatus && (okStatus.done === true || okStatus.status === "done" || okStatus.status === "failed")
      const hasAllScores =
        okStatus &&
        typeof okStatus.score_total === "number" &&
        typeof okStatus.score_search === "number" &&
        typeof okStatus.score_ai === "number"
      const hasScreenshot = okStatus && typeof okStatus.screenshot_url === "string" && okStatus.screenshot_url.trim().length > 0

      // Stop polling once we can render the "Step 2" preview (or once scan is terminal).
      if (done || (hasAllScores && hasScreenshot)) {
        stop()
        // EN onboarding: redirect to dashboard after 2s so user sees completion
        if (
          basePath.startsWith("/en") &&
          okStatus.status === "done" &&
          scanId &&
          token
        ) {
          setTimeout(() => {
            const params = new URLSearchParams({ scan_id: scanId, token })
            if (linkId) params.set("link_id", linkId)
            router.replace(`${basePath}/dashboard?${params.toString()}`)
          }, 2000)
        }
        return
      }

      await triggerContinue(scanId, token)
    }

    tick()
    interval = setInterval(tick, 2500)
    return () => {
      cancelled = true
      stop()
    }
  }, [step, scanId, token, basePath, router, linkId])

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

    return (
      <>
        <style>{dashboardCss}</style>
        <div className="audit-root">
          {/* Subscriber header: logo + account menu + WhatsApp */}
          {hasActiveSubscription && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
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

          <div className="audit-card">

            {/* Header */}
            <div className="audit-header">
              <h2 className="audit-title">{locale === "en" ? "Audit report" : "דוח ביקורת"}</h2>
              {scanId
                ? <span className="audit-scan-id"># {scanId}</span>
                : <span className="audit-scan-id generating">{locale === "en" ? "Generating scan…" : "מייצר סריקה…"}</span>
              }
            </div>

            {/* Body */}
            <div className="audit-body">

              {/* Loading — no status yet */}
              {!okStatus && (
                <div className="audit-loading">
                  <div className="spinner" />
                  <span>{locale === "en" ? "Loading scan status…" : "טוען סטטוס סריקה…"}</span>
                </div>
              )}

              {/* In-progress */}
              {okStatus && !okStatus.done && (
                <div className="audit-progress-block">
                  <div className="progress-meta">
                    <span className="progress-label">{locale === "en" ? "Scan in progress" : "סריקה פעילה"}</span>
                    <span className="progress-step" dir="ltr">{okStatus.status} · {okStatus.step}</span>
                  </div>
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" />
                  </div>
                </div>
              )}

              {/* Done */}
              {okStatus?.done && (
                <>
                  {/* Warning banner */}
                  {okStatus.warning && (
                    <div className="audit-warning">
                      <span style={{ flexShrink: 0 }}>⚠</span>
                      <span>{okStatus.warning}</span>
                    </div>
                  )}

                  {/* Stats row — AI + SEO + Total */}
                  <div className="audit-stats">
                    <div className="stat-cell">
                      <span className="stat-label">AI Readiness</span>
                      <span className={`stat-value ${
                        typeof (okStatus as any).score_ai === "number"
                          ? (okStatus as any).score_ai < 25 ? "red"
                          : (okStatus as any).score_ai < 50 ? "amber"
                          : "teal"
                          : "muted"
                      }`}>
                        {typeof (okStatus as any).score_ai === "number" ? (okStatus as any).score_ai : "—"}
                      </span>
                    </div>
                    <div className="stat-cell">
                      <span className="stat-label">SEO Readiness</span>
                      <span className={`stat-value ${
                        typeof (okStatus as any).score_search === "number"
                          ? (okStatus as any).score_search < 25 ? "red"
                          : (okStatus as any).score_search < 50 ? "amber"
                          : "teal"
                          : "muted"
                      }`}>
                        {typeof (okStatus as any).score_search === "number" ? (okStatus as any).score_search : "—"}
                      </span>
                    </div>
                    <div className="stat-cell">
                      <span className="stat-label">{locale === "en" ? "Overall score" : "ציון כללי"}</span>
                      <span className={`stat-value ${
                        typeof (okStatus as any).score_total === "number"
                          ? (okStatus as any).score_total < 25 ? "red"
                          : (okStatus as any).score_total < 50 ? "amber"
                          : "teal"
                          : "muted"
                      }`}>
                        {typeof (okStatus as any).score_total === "number" ? (okStatus as any).score_total : "—"}
                      </span>
                    </div>
                  </div>

                  <div className="audit-divider" />

                  {/* Issues section */}
                  <div>
                    <div className="section-header">
                      <div className="section-dot" />
                      <span className="section-title">{locale === "en" ? "Areas to improve" : "דברים שכדאי לשפר"}</span>
                    </div>

                    {issueCount === 0 ? (
                      <div className="audit-empty">
                        <span className="audit-empty-icon">🟢</span>
                        <span>{locale === "en" ? "No significant issues found" : "לא נמצאו בעיות כלליות משמעותיות"}</span>
                      </div>
                    ) : (
                      <div className="audit-issues">
                        {okStatus.issues_overview.map((issue, idx) => (
                          <div className="audit-issue-item" key={idx}>
                            <span className="issue-number">{String(idx + 1).padStart(2, "0")}</span>
                            <span>{issue}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="audit-divider" />

                  {/* Footer actions — hide when user has active subscription */}
                  {!hasActiveSubscription && (
                  <div className="pricing-wrap" aria-label="Pricing">
                    <h3 className="pricing-title">{locale === "en" ? "Pricing — SEO / AI" : "מחירון — SEO / AI אורגני"}</h3>
                    <div className="pricing-subtitle">
                      {locale === "en" ? "Choose a plan for the full report & improvement plan. Monthly billing, cancel anytime." : "בחרו חבילה כדי לראות את הדוח המלא ולקבל תכנית שיפור. החיוב חודשי ומתחדש, וכולל מע״מ."}
                    </div>

                    <div className="pricing-grid">
                      <div
                        className={`plan-card ${selectedPlanId === "basic" ? "selected" : ""}`}
                        onClick={() => setSelectedPlanId("basic")}
                        role="button"
                        tabIndex={0}
                      >
                        <input className="plan-radio" type="radio" checked={selectedPlanId === "basic"} readOnly />
                        <h4 className="plan-name">{locale === "en" ? "Basic" : "בסיסי"}</h4>
                        <div className="plan-price">
                          {locale === "en" ? <><strong>${PLAN_PRICES_USD.basic}</strong>/mo</> : <><strong>97 ₪</strong> לחודש</>}
                        </div>
                        <div className="plan-features">
                          <div className="plan-feature"><span className="check">✓</span><span>{locale === "en" ? "Auto scan (up to 20 pages)" : "סריקה אוטומטית (עד 20 עמודים)"}</span></div>
                          <div className="plan-feature"><span className="check">✓</span><span>{locale === "en" ? "Standard SEO score (0–100)" : "ציון SEO תקני (0–100)"}</span></div>
                          <div className="plan-feature"><span className="check">✓</span><span>{locale === "en" ? "Robots + sitemap checks" : "בדיקות robots + sitemap"}</span></div>
                          <div className="plan-feature"><span className="check">✓</span><span>{locale === "en" ? "Basic schema" : "Schema בסיסית"}</span></div>
                        </div>
                      </div>

                      <div
                        className={`plan-card ${selectedPlanId === "pro" ? "selected" : ""}`}
                        onClick={() => setSelectedPlanId("pro")}
                        role="button"
                        tabIndex={0}
                      >
                        <span className="plan-badge">{locale === "en" ? "Most popular" : "המומלץ ביותר"}</span>
                        <input className="plan-radio" type="radio" checked={selectedPlanId === "pro"} readOnly />
                        <h4 className="plan-name">{locale === "en" ? "Pro" : "מקצועי"}</h4>
                        <div className="plan-price">
                          {locale === "en" ? <><strong>${PLAN_PRICES_USD.pro}</strong>/mo</> : <><strong>197 ₪</strong> לחודש</>}
                        </div>
                        <div className="plan-features">
                          <div className="plan-feature"><span className="check">✓</span><span>{locale === "en" ? "Everything in Basic" : "כולל את כל מה שקיים בבסיסי"}</span></div>
                          <div className="plan-feature"><span className="check">✓</span><span>{locale === "en" ? "Title/Description analysis" : "ניתוח מבנה Titles/Descriptions"}</span></div>
                          <div className="plan-feature"><span className="check">✓</span><span>{locale === "en" ? "Meta Titles/Descriptions audit" : "אבחון Meta Titles/Descriptions"}</span></div>
                          <div className="plan-feature"><span className="check">✓</span><span>{locale === "en" ? "FAQ + Q&A" : "FAQ + שאלות ותשובות"}</span></div>
                        </div>
                      </div>

                      <div
                        className={`plan-card ${selectedPlanId === "premium" ? "selected" : ""}`}
                        onClick={() => setSelectedPlanId("premium")}
                        role="button"
                        tabIndex={0}
                      >
                        <input className="plan-radio" type="radio" checked={selectedPlanId === "premium"} readOnly />
                        <h4 className="plan-name">{locale === "en" ? "Premium" : "מומחים"}</h4>
                        <div className="plan-price">
                          {locale === "en" ? <>From <strong>${PLAN_PRICES_USD.premium}</strong>/mo</> : <>החל מ־<strong>997 ₪</strong> לחודש</>}
                        </div>
                        <div className="plan-features">
                          <div className="plan-feature"><span className="check">✓</span><span>{locale === "en" ? "Everything + human support" : "כולל הכל + ליווי אנושי"}</span></div>
                          <div className="plan-feature"><span className="check">✓</span><span>{locale === "en" ? "Deep page analysis" : "ניתוח עומק של עמודי האתר"}</span></div>
                          <div className="plan-feature"><span className="check">✓</span><span>{locale === "en" ? "1:1 strategy call" : "שיחת אסטרטגיה 1:1"}</span></div>
                          <div className="plan-feature"><span className="check">✓</span><span>{locale === "en" ? "AI visibility optimization" : "התאמה לחשיפה ב‑AI"}</span></div>
                        </div>
                      </div>
                    </div>

                    <div className="pricing-cta-row">
                      <div className="pricing-note">{locale === "en" ? "After payment you'll get an email with login link." : "מיד לאחר התשלום נשלח אליכם מייל עם קישור להתחברות ולהמשך."}</div>
                      <button className="btn-checkout" onClick={startCheckout} disabled={isStartingCheckout}>
                        {isStartingCheckout ? (
                          <>
                            <span className="spinner" />
                            {locale === "en" ? "Processing…" : "ממשיכים לתשלום…"}
                          </>
                        ) : (
                          <>{locale === "en" ? "Continue to payment" : "המשך לתשלום"}</>
                        )}
                      </button>
                    </div>
                  </div>
                  )}

                  <div className="audit-divider" />

                  <div className="audit-footer">
                    <a
                      className="btn-share"
                      href={
                        scanId && token
                          ? `${basePath}/${encodeURIComponent(scanId)}?token=${encodeURIComponent(token)}`
                          : basePath
                      }
                    >
                      <span>🔗</span>
                      {locale === "en" ? "Share report" : "שיתוף הדוח"}
                    </a>
                    <button
                      className="btn-new-scan"
                      onClick={() => {
                        setStep(1)
                        setError(null)
                        setStatus(null)
                        setScanId(null)
                        setToken(null)
                        router.replace(basePath)
                      }}
                    >
                      <span>＋</span>
                      {locale === "en" ? "New scan" : "סריקה חדשה"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </>
    )
  }

  // ─── Main render ───────────────────────────────────────────────────────────
  return (
    <div dir={locale === "en" ? "ltr" : "rtl"} className="space-y-6">
      {error ? (
        <div className={`rounded-ui border border-danger/40 bg-danger/5 p-3 text-sm text-danger ${locale === "en" ? "text-left" : "text-right"}`}>{error}</div>
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

          <div className="w-full max-w-xl">
            <div className="relative">
              <button
                type="button"
                onClick={onStart}
                disabled={!canGoToDetails}
                aria-label="המשך"
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground transition hover:text-fg disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowLeft className="h-5 w-5" />}
              </button>
              <Input
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onStart() }}
                placeholder={locale === "en" ? "Website URL / landing page" : "כתובת אתר / עמוד נחיתה"}
                dir="ltr"
                className="h-12 rounded-full bg-white pl-12 text-right shadow-sm"
              />
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
                    <Loader2 className={locale === "en" ? "mr-2" : "ml-2"} h-4 w-4 animate-spin />
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
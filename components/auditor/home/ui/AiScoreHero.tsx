"use client"

import { useEffect, useState } from "react"
import type { AuditorLocale } from "@/lib/auditor/locale"
import { isScanTerminalWithoutScore, type StatusResponse } from "@/components/auditor/home/logic/auditor-home-types"

const SCAN_MESSAGES_HE = [
  "בודק מבנה דפים…",
  "מנתח תוכן לכלי AI…",
  "בודק schema markup…",
  "מעריך נראות ב-ChatGPT…",
  "סורק מטא-דאטה…",
  "בודק structured data…",
  "מנתח ביצועי טעינה…",
  "בוחן קישורים פנימיים…",
  "בודק נגישות תוכן…",
  "מחשב ציון AI…",
]
const SCAN_MESSAGES_EN = [
  "Checking page structure…",
  "Analyzing AI content…",
  "Checking schema…",
  "Evaluating visibility…",
  "Scanning metadata…",
  "Checking structured data…",
  "Analyzing performance…",
  "Checking links…",
  "Checking accessibility…",
  "Computing AI score…",
]

const AI_SCORE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@500&display=swap');
@keyframes scoreReveal { from { opacity:0; transform: scale(.72) translateY(8px); } to { opacity:1; transform: scale(1) translateY(0); } }
@keyframes badgeIn { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform: translateY(0); } }
@keyframes counterFlicker { 0%{opacity:1;} 48%{opacity:1;} 50%{opacity:.3;} 52%{opacity:1;} 100%{opacity:1;} }
@keyframes scanLine { 0%{transform:translateY(-100%);opacity:.6;} 100%{transform:translateY(400%);opacity:0;} }
@keyframes msgFade { 0%{opacity:0;transform:translateY(4px);} 15%{opacity:1;transform:translateY(0);} 80%{opacity:1;} 100%{opacity:0;} }
.aisc-wrap { width: 100%; }
.aisc-card { border-radius:20px; padding:44px 28px 38px; display:flex; flex-direction:column; align-items:center; gap:20px; background:#faf8f5; border:1px solid rgba(0,0,0,.08); box-shadow:0 4px 32px rgba(0,0,0,.07); position:relative; overflow:hidden; font-family:'Syne', sans-serif; }
.aisc-card::after { content:''; position:absolute; inset:0; background:linear-gradient(180deg, rgba(255,255,255,.18) 0%, transparent 60%); pointer-events:none; }
.aisc-scanline { position:absolute; left:0; right:0; height:2px; background:linear-gradient(90deg, transparent, rgba(45,90,78,.18), transparent); animation:scanLine 2.2s ease-in-out infinite; pointer-events:none; }
.aisc-eyebrow { font-size:.7rem; font-weight:700; letter-spacing:.16em; text-transform:uppercase; color:#9b8e82; display:flex; align-items:center; gap:10px; position:relative; z-index:1; }
.aisc-eyebrow::before, .aisc-eyebrow::after { content:''; display:block; width:32px; height:1px; background:#c8bfb6; }
.aisc-number-wrap { position:relative; z-index:1; line-height:1; }
.aisc-number-final { font-size:8rem; font-weight:800; letter-spacing:-.05em; font-variant-numeric:tabular-nums; animation:scoreReveal .55s cubic-bezier(.22,.68,0,1.3) both; line-height:1; }
.aisc-number-counter { font-size:8rem; font-weight:800; letter-spacing:-.05em; font-variant-numeric:tabular-nums; color:#c8bfb6; animation:counterFlicker 1.8s ease-in-out infinite; line-height:1; font-family:'DM Mono', monospace; }
.aisc-badge { font-size:.84rem; font-weight:700; border-radius:99px; padding:5px 18px; letter-spacing:.03em; animation:badgeIn .4s .12s ease both; position:relative; z-index:1; }
.aisc-desc { font-size:.9rem; color:#6b6359; max-width:290px; text-align:center; line-height:1.55; animation:badgeIn .4s .22s ease both; position:relative; z-index:1; }
.aisc-scanning-msg { font-size:.8rem; color:#9b8e82; animation:msgFade 2.8s ease both; min-height:1.2em; position:relative; z-index:1; font-family:'DM Mono', monospace; letter-spacing:.02em; }
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

export function AiScoreHero({ status, locale }: { status: StatusResponse | null; locale: AuditorLocale }) {
  const okStatus = status && status.ok === true ? status : null
  const statusDone = okStatus?.status === "done"
  const finalScore = statusDone && okStatus && typeof okStatus.score_ai === "number" ? okStatus.score_ai : null
  const isReady = finalScore !== null
  const isTerminalWithoutScore = isScanTerminalWithoutScore(status)
  const [counter, setCounter] = useState(0)
  const [msgIdx, setMsgIdx] = useState(0)

  const scanMessages = locale === "en" ? SCAN_MESSAGES_EN : SCAN_MESSAGES_HE
  const runningStep = String(okStatus?.step || "").trim()
  const runningStepMessage = (() => {
    if (locale === "en") {
      if (runningStep === "fetch_pages") return "Fetching site pages..."
      if (runningStep === "extract") return "Analyzing pages..."
      if (runningStep === "recommendations" || runningStep === "persist") return "Building report..."
      return "Calculating your score..."
    }
    if (runningStep === "fetch_pages") return "מושכים עמודים מהאתר..."
    if (runningStep === "extract") return "מנתחים את העמודים..."
    if (runningStep === "recommendations" || runningStep === "persist") return "בונים את הדוח..."
    return "מחשבים את הציון שלך..."
  })()

  useEffect(() => {
    if (isReady || isTerminalWithoutScore) return
    const id = setInterval(() => {
      setCounter((prev) => {
        const jump = Math.floor(Math.random() * 12) - 3
        const next = prev + jump
        return Math.max(1, Math.min(next, 89))
      })
    }, 160)
    return () => clearInterval(id)
  }, [isReady, isTerminalWithoutScore])

  useEffect(() => {
    if (isReady || isTerminalWithoutScore) return
    const id = setInterval(() => {
      setMsgIdx((i) => (i + 1) % scanMessages.length)
    }, 2800)
    return () => clearInterval(id)
  }, [isReady, isTerminalWithoutScore, scanMessages])

  const grade = isReady ? getGrade(finalScore, locale) : null

  return (
    <div className="aisc-wrap">
      <style>{AI_SCORE_CSS}</style>
      <div className="aisc-card">
        {!isReady && !isTerminalWithoutScore && <div className="aisc-scanline" />}
        <div className="aisc-eyebrow" dir={locale === "en" ? "ltr" : "rtl"}>
          {locale === "en" ? "AI presence score" : "ציון נוכחות AI"}
        </div>
        <div className="aisc-number-wrap">
          {isReady ? (
            <div className="aisc-number-final" dir="ltr" style={{ color: "var(--primary)" }}>
              {finalScore}
            </div>
          ) : isTerminalWithoutScore ? (
            <div className="aisc-number-final" dir="ltr" style={{ color: "var(--primary)" }}>
              0
            </div>
          ) : (
            <div className="aisc-number-counter" dir="ltr">
              {counter}
            </div>
          )}
        </div>
        {isReady ? (
          <>
            <div className="aisc-badge" style={{ color: grade?.color, background: grade?.bg, border: `1px solid ${grade?.border}` }}>
              {grade?.label}
            </div>
            <div className="aisc-desc">{grade?.desc}</div>
          </>
        ) : isTerminalWithoutScore ? (
          <div className="space-y-1">
            <div className="aisc-scanning-msg">
              {locale === "en" ? "Scan completed, but no scorable pages were fetched." : "הסריקה הושלמה, אבל לא נמשכו עמודים מתאימים לחישוב ציון."}
            </div>
            <div className="aisc-scanning-msg">
              {locale === "en" ? "Try another URL or run the scan again." : "נסו כתובת אחרת או הריצו סריקה מחדש."}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="aisc-scanning-msg">{runningStepMessage}</div>
            <div className="aisc-scanning-msg" key={msgIdx}>
              {scanMessages[msgIdx]}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

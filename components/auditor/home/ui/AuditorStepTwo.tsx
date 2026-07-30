"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { AuditorLocale } from "@/lib/auditor/locale"
import type { StatusResponse } from "@/components/auditor/home/logic/auditor-home-types"
import { detectDomain } from "@/components/auditor/home/logic/auditor-home-utils"
import { useReducedMotion } from "@/components/auditor/home/logic/useReducedMotion"
import { useScanProgress } from "@/components/auditor/home/logic/useScanProgress"

/**
 * The scan screen, per design-mockups/auditor-scanflow-v3-light-FINAL.html.
 *
 * The mockup is a display spec, not a timing spec: its BEATS are a staged 5.5
 * second reel with invented numbers, and none of it survives here. What is
 * copied exactly is the presentation — the light palette, the 136px number, the
 * 2.6s laser, the five-row prepending log, the elapsed clock. What drives it is
 * docs/auditor-scanflow-behavior-rules.md and nothing else.
 *
 * Three things the mockup shows are absent by decision, each because the data
 * behind them does not exist in this flow:
 *
 * - The site preview. AUDITOR_SCREENSHOT_ENABLED is empty in production, so
 *   status.screenshot_url is always null, and the raw page HTML the mockup's
 *   <iframe srcdoc> needs never reaches the client. The card keeps its full
 *   size and carries live telemetry instead of a picture.
 * - The four finding pins. Three of the mockup's four are passes, and the
 *   public status route exposes only fail/warn. Four fixed positions with one
 *   of them filled is worse than none.
 * - The competitor beat. AUDITOR_SERPER_API_KEY is not set in production, so
 *   that branch returns [] and any number attached to it would be invented.
 */

const C = {
  ink: "#19183B",
  ink2: "#3A4160",
  muted: "#8A90A0",
  faint: "#B9BFCC",
  brand: "#5389BB",
  brandDk: "#3F76AC",
  brandTint: "#EAF1F8",
  line: "#ECEFF4",
  line2: "#E2E7F0",
  field: "#F7F9FC",
  /** The report's panel fill. Same system, same screen sequence. */
  surface: "#F6F8FC",
  /**
   * Findings share one amber tone, and it is deliberately not the mockup's red.
   *
   * issues_overview is a flat list of strings that mixes `fail` and `warn` with
   * nothing to tell them apart, so severity is not derivable here. Red would
   * announce "critical" over what may be a warning; green would do the reverse.
   * Amber is the one tone that invents severity in neither direction.
   */
  amber: "#B7791F",
  amberBg: "#FDF3E3",
} as const

/**
 * Every step the pipeline can report, in the visitor's words.
 *
 * A label here is only ever a description of a step that is genuinely running —
 * the phrasing comes from the mockup, the fact that it is on screen comes from
 * status.step. Steps absent from this map advance the percentage but write no
 * log row: the competitor stages run, but without a SERP key they produce
 * nothing for this visitor, and naming them would advertise a result that is
 * not coming.
 */
const STEP_TEXT: Record<string, { he: string; en: string; sub: string }> = {
  normalize:        { he: "מתחברים לאתר",              en: "Connecting to the site",     sub: "resolving dns" },
  robots:           { he: "קוראים את robots.txt",       en: "Reading robots.txt",         sub: "robots.txt" },
  sitemap:          { he: "ממפים את מבנה האתר",         en: "Mapping the site structure", sub: "sitemap.xml" },
  ai_files:         { he: "בודקים אם AI יכול לקרוא אתכם", en: "Checking AI readability",  sub: "llms.txt" },
  sample:           { he: "בוחרים עמודים לסריקה",       en: "Selecting pages to scan",    sub: "sampling" },
  fetch_pages:      { he: "טוענים את העמודים",          en: "Loading the pages",          sub: "GET · fetching" },
  extract:          { he: "קוראים את קוד המקור",        en: "Reading the source",         sub: "parsing head" },
  keyword_analysis: { he: "מנתחים מילות מפתח",          en: "Analysing keywords",         sub: "keywords" },
  keyword_engine:   { he: "מנתחים מילות מפתח",          en: "Analysing keywords",         sub: "keywords" },
  topic_discovery:  { he: "מזהים נושאים באתר",          en: "Identifying topics",         sub: "topics" },
  rules:            { he: "מריצים בדיקות ומחשבים ציון", en: "Running checks and scoring",  sub: "scoring rules" },
  ai_readiness:     { he: "בודקים מוכנות ל-AI",          en: "Checking AI readiness",      sub: "ai readiness" },
  recommendations:  { he: "מרכיבים המלצות",             en: "Building recommendations",   sub: "recommendations" },
  persist:          { he: "מסכמים את הדוח",             en: "Finalising the report",      sub: "saving" },
  done:             { he: "הדוח מוכן",                  en: "The report is ready",        sub: "done" },
}

const CSS = `
.uxsf-stage{position:relative;max-width:1120px;margin:0 auto;border-radius:24px;overflow:hidden;background:#fff;
  border:1px solid ${C.line};box-shadow:0 18px 50px rgba(25,24,59,.08);min-height:640px}
.uxsf-codebg{position:absolute;inset:0;overflow:hidden;pointer-events:none;opacity:.06;z-index:0;
  -webkit-mask-image:linear-gradient(to bottom,transparent,#000 20%,#000 68%,transparent);
          mask-image:linear-gradient(to bottom,transparent,#000 20%,#000 68%,transparent)}
.uxsf-codebg pre{direction:ltr;text-align:left;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:11.5px;line-height:1.6;color:#1b3a63;white-space:pre;padding:22px;
  animation:uxsf-codescroll 46s linear infinite}
@keyframes uxsf-codescroll{from{transform:translateY(0)}to{transform:translateY(-50%)}}
.uxsf-glow{position:absolute;top:-160px;inset-inline-start:-120px;width:520px;height:520px;z-index:0;pointer-events:none;
  background:radial-gradient(circle,rgba(83,137,187,.16),rgba(83,137,187,0) 65%)}
.uxsf-inner{position:relative;z-index:2;padding:26px 30px 30px}
.uxsf-top{display:flex;align-items:center;gap:12px;margin-bottom:22px;padding-bottom:16px;border-bottom:1px solid ${C.line}}
.uxsf-dot{width:7px;height:7px;border-radius:50%;background:#2FBF71;box-shadow:0 0 0 0 rgba(47,191,113,.5);
  animation:uxsf-pulse 1.6s infinite}
@keyframes uxsf-pulse{70%{box-shadow:0 0 0 9px rgba(47,191,113,0)}100%{box-shadow:0 0 0 0 rgba(47,191,113,0)}}
.uxsf-cols{display:grid;grid-template-columns:1fr 1.05fr;gap:30px;align-items:start}
.uxsf-bignum{font-size:136px;line-height:.85;font-weight:800;letter-spacing:-5px;font-variant-numeric:tabular-nums;color:${C.ink}}
.uxsf-bignum .pct{font-size:48px;letter-spacing:0;vertical-align:super;color:${C.brand};font-weight:700}
.uxsf-laser{position:absolute;inset-inline:0;height:120px;z-index:3;pointer-events:none;
  background:linear-gradient(180deg,rgba(83,137,187,0) 0%,rgba(83,137,187,.10) 60%,rgba(83,137,187,.34) 97%,rgba(83,137,187,.75) 100%);
  top:-120px;animation:uxsf-sweep 2.6s cubic-bezier(.45,0,.55,1) infinite}
@keyframes uxsf-sweep{0%{top:-120px}100%{top:100%}}
.uxsf-row{display:flex;align-items:center;gap:9px;font-size:13.5px;font-weight:600;padding:7px 0;
  border-bottom:1px solid ${C.line};animation:uxsf-rowin .3s both}
.uxsf-row:last-child{border-bottom:none}
@keyframes uxsf-rowin{from{opacity:0;transform:translateX(9px)}to{opacity:1;transform:none}}

/* Below the two-column breakpoint the screen stacks: the number leads, the
   telemetry card follows it, and the log closes. */
@media (max-width:860px){
  .uxsf-stage{min-height:0;border-radius:20px}
  .uxsf-cols{grid-template-columns:1fr;gap:20px}
  .uxsf-inner{padding:20px 18px 24px}
  .uxsf-bignum{font-size:104px;letter-spacing:-4px}
  .uxsf-bignum .pct{font-size:38px}
}
/* 360px: the counters stop sharing a row before their digits collide with
   their own labels, and the number gives back the last of its tracking. */
@media (max-width:400px){
  .uxsf-inner{padding:16px 13px 20px}
  .uxsf-bignum{font-size:84px;letter-spacing:-3px}
  .uxsf-bignum .pct{font-size:30px}
  .uxsf-counters{grid-template-columns:1fr!important}
  .uxsf-hostbig{font-size:22px!important}
}

@media (prefers-reduced-motion:reduce){
  .uxsf-codebg pre,.uxsf-dot,.uxsf-laser,.uxsf-row{animation:none!important}
  .uxsf-laser{display:none}
}
`

/** The markup behind the 6% wash. Static and inert — it is texture, not data. */
const CODE_TEXTURE = `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="canonical">
</head>
<body>
  <header class="site-header">
    <nav></nav>
  </header>
  <main>
    <h1></h1>
  </main>
</body>
</html>
`

type LogRow = { id: number; kind: "step" | "issue"; text: string }

const LOG_CAP = 5
/** Decision 3: a display cadence, never a claim about when a finding was made. */
const ISSUE_STAGGER_MS = 80

type Props = {
  locale: AuditorLocale
  status: StatusResponse | null
  step2IsWorking: boolean
  siteUrl: string
}

export function AuditorStepTwo({ locale, status, step2IsWorking, siteUrl }: Props) {
  const en = locale === "en"
  const reduced = useReducedMotion()
  const ok = status && status.ok === true ? status : null

  const scoreReady = ok?.score_ready === true
  const reported = typeof ok?.progress === "number" ? ok.progress : null
  const pct = useScanProgress({ reported, scoreReady, reducedMotion: reduced })

  const step = String(ok?.step || "")
  const stepText = STEP_TEXT[step]
  const domain = (ok?.hostname && String(ok.hostname).trim()) || detectDomain(siteUrl) || ""

  // ── Counters. Rule 3: a poll that comes back lower never walks them back. ──
  const [pages, setPages] = useState(0)
  const [finds, setFinds] = useState(0)
  useEffect(() => {
    if (typeof ok?.pages_scanned === "number") setPages((p) => Math.max(p, ok.pages_scanned as number))
  }, [ok?.pages_scanned])
  useEffect(() => {
    const n = typeof ok?.issues_count === "number" ? ok.issues_count : ok?.issues_overview?.length
    if (typeof n === "number") setFinds((f) => Math.max(f, n))
  }, [ok?.issues_count, ok?.issues_overview])

  // ── Elapsed. Starts when the screen does, not when the request returns. ──
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 250)
    return () => clearInterval(id)
  }, [])
  const clock = useMemo(() => {
    const m = Math.floor(elapsed / 60)
    const s = elapsed % 60
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }, [elapsed])

  /**
   * What a long scan says for itself.
   *
   * The anti-stall drift keeps the number from freezing, but it cannot tell the
   * visitor anything: second 50 and second 400 look identical, and since the
   * gate now waits for a real score, a slow site can hold this screen for up to
   * the pipeline's ten-minute ceiling in total silence.
   *
   * Both lines state a fact about elapsed time and stop there. Neither says
   * "almost done" or implies the end is near — that would be a promise nothing
   * on this screen can keep, and the scan may still fail.
   */
  const longRunNotice = useMemo(() => {
    if (!step2IsWorking) return null
    if (elapsed >= 180) {
      return en
        ? "This is a complex scan, it can take a few minutes."
        : "זו סריקה מורכבת, זה יכול לקחת כמה דקות"
    }
    if (elapsed >= 45) {
      return en
        ? "The scan is taking longer than usual. We're still going."
        : "הסריקה לוקחת יותר מהרגיל, אנחנו ממשיכים"
    }
    return null
  }, [elapsed, step2IsWorking, en])

  // ── The log: real step transitions, then the real findings. ──────────────
  const [rows, setRows] = useState<LogRow[]>([])
  const rowIdRef = useRef(0)
  const seenStepsRef = useRef<Set<string>>(new Set())
  const issuesDoneRef = useRef(false)
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([])

  const pushRow = (kind: LogRow["kind"], text: string) => {
    rowIdRef.current += 1
    const row = { id: rowIdRef.current, kind, text }
    setRows((prev) => [row, ...prev].slice(0, LOG_CAP))
  }

  useEffect(() => {
    if (!step || seenStepsRef.current.has(step)) return
    seenStepsRef.current.add(step)
    const label = STEP_TEXT[step]
    if (!label) return
    pushRow("step", en ? label.en : label.he)
  }, [step, en])

  useEffect(() => {
    const issues = ok?.issues_overview
    if (issuesDoneRef.current || !Array.isArray(issues) || issues.length === 0) return
    issuesDoneRef.current = true

    const list = issues.slice(0, LOG_CAP).map((s) => String(s).trim()).filter(Boolean)
    if (reduced) {
      list.forEach((text) => pushRow("issue", text))
      return
    }
    list.forEach((text, i) => {
      const t = setTimeout(() => pushRow("issue", text), i * ISSUE_STAGGER_MS)
      timersRef.current.push(t)
    })
  }, [ok?.issues_overview, reduced])

  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  const shown = Math.floor(pct)
  const headline = stepText ? (en ? stepText.en : stepText.he) : en ? "Scanning…" : "סורקים…"
  const sub = stepText?.sub || ""

  return (
    <div dir={en ? "ltr" : "rtl"}>
      <style>{CSS}</style>
      <div className="uxsf-stage">
        <div className="uxsf-codebg" aria-hidden="true">
          <pre>{(CODE_TEXTURE + "\n").repeat(9)}</pre>
        </div>
        <div className="uxsf-glow" aria-hidden="true" />

        <div className="uxsf-inner">
          <div className="uxsf-top">
            <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: ".2px", color: C.ink }}>
              UX<span style={{ color: C.brand }}>ellent</span>
            </div>
            {domain ? (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 8, background: C.field,
                  border: `1px solid ${C.line2}`, borderRadius: 999, padding: "5px 13px",
                  fontSize: 13.5, fontWeight: 600, direction: "ltr", color: C.ink2,
                }}
              >
                <i className="uxsf-dot" />
                <span>{domain}</span>
              </div>
            ) : null}
            <span style={{ flex: 1 }} />
            <div style={{ fontSize: 12.5, color: C.muted, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
              {clock}
            </div>
          </div>

          <div className="uxsf-cols">
            {/* ── The number, the step, the counters, the log ── */}
            <div>
              <div
                className="uxsf-bignum"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={shown}
                aria-label={en ? "Scan progress" : "התקדמות הסריקה"}
              >
                {shown}
                <span className="pct">%</span>
              </div>

              <div style={{ marginTop: 12, fontSize: 20, fontWeight: 700, minHeight: 28, color: C.ink }}>
                {headline}
              </div>
              <div
                style={{
                  marginTop: 4, fontSize: 12.5, color: C.faint, minHeight: 19,
                  direction: "ltr", textAlign: en ? "left" : "right",
                  fontFamily: "ui-monospace,Menlo,monospace",
                }}
              >
                {sub}
              </div>

              {longRunNotice ? (
                <div
                  aria-live="polite"
                  style={{
                    marginTop: 10, fontSize: 13, fontWeight: 700, color: C.brandDk,
                    background: C.brandTint,
                    borderRadius: 10, padding: "8px 11px",
                  }}
                >
                  {longRunNotice}
                </div>
              ) : null}

              <div style={{ marginTop: 18, height: 5, borderRadius: 99, background: C.line, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%", width: `${pct}%`, borderRadius: 99, background: C.brand,
                    transition: reduced ? "none" : "width .12s linear",
                  }}
                />
              </div>

              {/* Two counters, not the mockup's three. "Checks performed" would
                  have to sit at 0 and then jump to the full rule count in one
                  frame, because the engine evaluates them as a single batch —
                  that is a message, not a counter. */}
              <div
                className="uxsf-counters"
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 22 }}
              >
                {[
                  { v: pages, label: en ? "Pages scanned" : "עמודים נסרקו" },
                  { v: finds, label: en ? "Findings" : "ממצאים" },
                ].map((c) => (
                  <div key={c.label} style={{ borderRadius: 13, padding: "11px 13px", background: C.surface }}>
                    <b style={{ display: "block", fontSize: 26, fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: 1.1, color: C.ink }}>
                      {c.v}
                    </b>
                    <span style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>{c.label}</span>
                  </div>
                ))}
              </div>

              <div
                aria-live="polite"
                style={{
                  marginTop: 14, borderRadius: 13, background: C.surface,
                  padding: "6px 13px", height: 136, overflow: "hidden",
                }}
              >
                {rows.map((r) => {
                  const isIssue = r.kind === "issue"
                  return (
                    <div key={r.id} className="uxsf-row">
                      <span
                        style={{
                          width: 19, height: 19, borderRadius: 6, display: "grid", placeItems: "center",
                          fontSize: 11, fontWeight: 800, flex: "0 0 19px",
                          background: isIssue ? C.amberBg : C.brandTint,
                          color: isIssue ? C.amber : C.brandDk,
                        }}
                      >
                        {isIssue ? "!" : "i"}
                      </span>
                      <span
                        style={{
                          color: isIssue ? C.ink : C.ink2,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}
                      >
                        {r.text}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── The site card. Same frame and same weight as the mockup's,
                filled with telemetry because there is no picture to put in it. ── */}
            <div>
              <div
                style={{
                  position: "relative", borderRadius: 16, overflow: "hidden",
                  /*
                   * This border and shadow stay. They are not a panel edge —
                   * they draw a browser window, with the three dots and the
                   * address bar below. Flattening it into the surface fill would
                   * remove the only thing that says "this is your site".
                   */
                  border: `1px solid ${C.line2}`, background: "#fff",
                  boxShadow: "0 12px 34px rgba(25,24,59,.10)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", background: C.field, borderBottom: `1px solid ${C.line}` }}>
                  <i style={{ width: 9, height: 9, borderRadius: "50%", background: "#DDE3EC" }} />
                  <i style={{ width: 9, height: 9, borderRadius: "50%", background: "#DDE3EC" }} />
                  <i style={{ width: 9, height: 9, borderRadius: "50%", background: "#DDE3EC" }} />
                  <div
                    style={{
                      flex: 1, marginInlineStart: 8, height: 18, borderRadius: 5, background: "#fff",
                      border: `1px solid ${C.line}`, fontSize: 10.5, color: C.faint, display: "flex",
                      alignItems: "center", padding: "0 8px", direction: "ltr", overflow: "hidden", whiteSpace: "nowrap",
                    }}
                  >
                    {domain ? `https://${domain}` : ""}
                  </div>
                </div>

                <div
                  style={{
                    position: "relative", aspectRatio: "4 / 3.15", overflow: "hidden", background: "#fff",
                    display: "grid", placeItems: "center", padding: 24, textAlign: "center",
                  }}
                >
                  <div style={{ position: "relative", zIndex: 2 }}>
                    <div
                      className="uxsf-hostbig"
                      style={{ fontSize: 30, fontWeight: 800, color: C.ink, direction: "ltr", letterSpacing: "-.5px", wordBreak: "break-all" }}
                    >
                      {domain}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 14.5, fontWeight: 700, color: C.brandDk }}>
                      {headline}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, color: C.faint, fontFamily: "ui-monospace,Menlo,monospace", direction: "ltr" }}>
                      {sub}
                    </div>
                  </div>
                  {step2IsWorking ? <div className="uxsf-laser" aria-hidden="true" /> : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

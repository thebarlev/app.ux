"use client"

import { useEffect, useRef, useState } from "react"

/** One count-up figure for the KPI row. Eases from 0 to `value` once on mount,
 *  then holds. Reduced-motion users get the final number immediately. */
function CountUp({ value, prefix = "" }: { value: number; prefix?: string }) {
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value)
      return
    }
    let raf = 0
    let start: number | null = null
    const dur = 1300
    const step = (t: number) => {
      if (start === null) start = t
      const p = Math.min(1, (t - start) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(value * eased))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    const kick = window.setTimeout(() => {
      raf = requestAnimationFrame(step)
    }, 450)
    return () => {
      window.clearTimeout(kick)
      cancelAnimationFrame(raf)
    }
  }, [value])

  return (
    <b>
      {prefix}
      {shown.toLocaleString("he-IL")}
    </b>
  )
}

/**
 * The live invoice dashboard, the "10 free documents" banner and the moving
 * functions carousel — the marketing visual on the dark half of the login
 * screen. Presentational only: no auth, no data, nothing to submit.
 */
export function LoginVisualPanel() {
  const bars = [58, 78, 48, 90, 66, 100]

  // The carousel scrolls one full list, then a second identical copy loops in
  // seamlessly, so the strip is never empty.
  const functions: { label: string; tone?: "hot" | "more" }[] = [
    { label: "חיבור לרשות המיסים", tone: "hot" },
    { label: "מספרי הקצאה", tone: "hot" },
    { label: "חשבונית מס" },
    { label: "קבלה" },
    { label: "חשבונית מס-קבלה" },
    { label: "חשבונית עסקה" },
    { label: "הצעת מחיר" },
    { label: "חשבונית זיכוי" },
    { label: "מעקב תשלומים" },
    { label: "דוחות והנהלת חשבונות" },
    { label: "חתימה דיגיטלית" },
    { label: "הוראות קבע" },
    { label: "+ ועוד רבות", tone: "more" },
  ]

  const capClass = (tone?: string) =>
    tone === "hot" ? "ls-cap ls-cap-hot" : tone === "more" ? "ls-cap ls-cap-more" : "ls-cap"

  const marqueeRef = useRef<HTMLDivElement>(null)

  return (
    <section className="ls-visual" aria-hidden="true">
      <div className="ls-dashwrap">
        <div className="ls-dash">
          <div className="ls-dashbar">
            <b>לוח חשבוניות</b>
            <span className="ls-live">
              <i />
              LIVE
            </span>
          </div>

          <div className="ls-dashbody">
            <div className="ls-kpis">
              <div className="ls-kpi">
                <span>הכנסות החודש</span>
                <CountUp value={148200} prefix="₪" />
              </div>
              <div className="ls-kpi">
                <span>שולמו</span>
                <CountUp value={132} />
              </div>
              <div className="ls-kpi">
                <span>ממתינות</span>
                <b>7</b>
              </div>
            </div>

            <div className="ls-chart">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="ls-bar"
                  style={{ height: `${h}%`, animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </div>

            <div className="ls-rows">
              <div className="ls-il">
                <span className="ls-l">
                  <i />
                  חשבונית מס · 10428
                </span>
                <span className="ls-amt">
                  ₪12,400 <span className="ls-st">שולם</span>
                </span>
              </div>
              <div className="ls-il">
                <span className="ls-l">
                  <i />
                  קבלה · 10427
                </span>
                <span className="ls-amt">
                  ₪3,900 <span className="ls-st">שולם</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="ls-free">
          <span className="ls-free-ic">🎁</span>
          <span className="ls-free-tx">
            <b>
              <u>10 מסמכים</u> חינם בכל חודש
            </b>
            <span>מספיק כדי להתחיל לעבוד</span>
          </span>
        </div>

        <div className="ls-capsh">ועוד עשרות פונקציות במערכת:</div>
        <div className="ls-marquee" ref={marqueeRef}>
          <div className="ls-track">
            {[...functions, ...functions].map((fn, i) => (
              <span key={i} className={capClass(fn.tone)}>
                {fn.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

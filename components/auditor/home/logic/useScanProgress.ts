"use client"

import { useEffect, useRef, useState } from "react"

/**
 * The percentage on the scan screen — rules 1, 2 and 3 of
 * docs/auditor-scanflow-behavior-rules.md.
 *
 * The server reports progress as a step weight, so it arrives as a staircase:
 * it sits on 35 for as long as fetch_pages runs and then jumps to 45. Showing
 * that raw reads as a frozen scan. Showing a timed animation instead — which is
 * what the mockup does — reads as a smooth one that is not connected to
 * anything. This hook is the third option: the number moves continuously, but
 * every value it displays is bounded by something the pipeline actually said.
 */

/**
 * A display-side mirror of STEP_WEIGHTS in lib/auditor/pipeline/progress.ts.
 *
 * Deliberately a copy rather than an import: the pipeline module is read-only
 * for this work and does not export the table. Staleness degrades safely — the
 * ceiling below is only ever used to hold the drift *back*, and `reported`
 * always wins upward (rule 3), so a wrong entry makes the drift stop early or
 * late. It can never make the number claim progress the server did not report.
 */
const CHECKPOINTS = [0, 5, 10, 15, 20, 25, 35, 45, 55, 60, 70, 75, 80, 85, 88, 92, 96, 99, 100] as const

function nextCheckpointAfter(v: number): number {
  for (const c of CHECKPOINTS) if (c > v) return c
  return 100
}

/** Approach `aim` by a fixed fraction each frame — decelerating by construction. */
function ease(current: number, aim: number, fraction: number, dtMs: number): number {
  const k = 1 - Math.pow(1 - fraction, dtMs / 16.7)
  return current + (aim - current) * k
}

export function useScanProgress(params: {
  /** `progress` from /api/auditor/status — a real checkpoint, or null before the first response. */
  reported: number | null
  /** Rule 1: 100 belongs to a score that exists, nothing else. */
  scoreReady: boolean
  /** Rule 4: no ramp, no drift — the reported value, directly. */
  reducedMotion: boolean
}): number {
  const { reported, scoreReady, reducedMotion } = params

  const [display, setDisplay] = useState(0)
  const displayRef = useRef(0)
  const reportedRef = useRef(0)
  const scoreReadyRef = useRef(false)

  // Rule 3, at the source: a later poll that reports less than an earlier one —
  // a retry, a race, a reload landing mid-pipeline — never moves the floor down.
  if (typeof reported === "number" && Number.isFinite(reported)) {
    reportedRef.current = Math.max(reportedRef.current, Math.max(0, Math.min(100, reported)))
  }
  scoreReadyRef.current = scoreReady

  useEffect(() => {
    if (reducedMotion) {
      const target = scoreReady ? 100 : Math.min(reportedRef.current, 99)
      const next = Math.max(displayRef.current, target)
      displayRef.current = next
      setDisplay(next)
      return
    }

    let raf = 0
    let last = performance.now()

    const frame = (now: number) => {
      const dt = Math.min(64, now - last)
      last = now

      const server = reportedRef.current
      const ready = scoreReadyRef.current

      // Rule 1: the only route to 100 is a score that exists.
      const hardMax = ready ? 100 : 99

      // Rule 2: between two real checkpoints the number may keep climbing, but
      // it stops short of the next checkpoint's value — reaching it would be a
      // claim that the step finished.
      const ceiling = ready ? 100 : Math.min(nextCheckpointAfter(server) - 1, hardMax)

      // Below the reported value the number is catching up to the truth, so it
      // moves briskly. Above it, it is only filling silence, so it crawls and
      // keeps slowing as it nears the ceiling.
      const behind = displayRef.current < server
      const aim = Math.max(server, ceiling)
      const next = Math.min(hardMax, Math.max(displayRef.current, ease(displayRef.current, aim, behind ? 0.14 : 0.012, dt)))

      if (Math.abs(next - displayRef.current) > 0.001) {
        displayRef.current = next
        setDisplay(next)
      }
      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [reducedMotion, scoreReady, reported])

  return display
}

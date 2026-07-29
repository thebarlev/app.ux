"use client"

import { useEffect, useState } from "react"

/**
 * Rule 4 of docs/auditor-scanflow-behavior-rules.md.
 *
 * Starts false rather than reading matchMedia during render: the server has no
 * media query to answer with, and a first paint that disagrees with the client
 * hydrates into a mismatch. The first effect corrects it before anything moves.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const apply = () => setReduced(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  return reduced
}

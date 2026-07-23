/**
 * Reference-counted page scroll lock for overlays (menus, bottom-sheets, modals).
 *
 * Counted, because more than one overlay can be open at once — a naive
 * lock/unlock pair would let the first one to close restore scrolling while
 * another is still up.
 *
 * Locks BOTH documentElement and body: components/ScrollLockFix.tsx runs a
 * MutationObserver that forces `overflow: auto !important` back onto <body>
 * whenever something sets it to hidden. It only watches <body> attributes, so
 * the <html> lock survives it. ScrollLockFix is not mounted on the dashboard
 * chrome today, but locking both keeps this correct if that ever changes.
 */

let locks = 0
let prevHtmlOverflow = ""
let prevBodyOverflow = ""

export function lockBodyScroll(): void {
  if (typeof document === "undefined") return
  if (locks === 0) {
    prevHtmlOverflow = document.documentElement.style.overflow
    prevBodyOverflow = document.body.style.overflow
    document.documentElement.style.overflow = "hidden"
    document.body.style.overflow = "hidden"
  }
  locks += 1
}

export function unlockBodyScroll(): void {
  if (typeof document === "undefined") return
  locks = Math.max(0, locks - 1)
  if (locks === 0) {
    document.documentElement.style.overflow = prevHtmlOverflow
    document.body.style.overflow = prevBodyOverflow
  }
}

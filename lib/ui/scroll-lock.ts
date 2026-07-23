/**
 * Reference-counted page scroll lock for overlays (menus, bottom-sheets, modals).
 *
 * Counted, because more than one overlay can be open at once — a naive
 * lock/unlock pair would let the first one to close restore scrolling while
 * another is still up.
 *
 * Deliberately CLASS-based, not inline styles. app/globals.css carries anti-Radix
 * hacks that actively fight inline scroll locks:
 *   body[style*="overflow"] { overflow: auto !important }
 * An `!important` stylesheet declaration beats a non-important inline style, so
 * setting body.style.overflow = "hidden" was silently reverted — which is why the
 * background still scrolled behind the starting-number modal. A class carries no
 * inline `style` attribute, so that selector never matches it.
 * components/ScrollLockFix.tsx watches <body> style/class attributes too, hence
 * the lock is driven from <html>, which it does not observe.
 *
 * The matching CSS lives at the end of app/globals.css (`html.ux-scroll-locked`).
 */

const LOCK_CLASS = "ux-scroll-locked"

let locks = 0

export function lockBodyScroll(): void {
  if (typeof document === "undefined") return
  locks += 1
  document.documentElement.classList.add(LOCK_CLASS)
}

export function unlockBodyScroll(): void {
  if (typeof document === "undefined") return
  locks = Math.max(0, locks - 1)
  if (locks === 0) {
    document.documentElement.classList.remove(LOCK_CLASS)
  }
}

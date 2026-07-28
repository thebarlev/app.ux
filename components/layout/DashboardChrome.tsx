"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { logoutAction } from "@/app/dashboard/actions"
import { lockBodyScroll, unlockBodyScroll } from "@/lib/ui/scroll-lock"

/**
 * DashboardChrome — refreshed shared app shell (sidebar + mobile bottom bar).
 *
 * Design source of truth: design-mockups/dashboard-v5.html.
 * - Desktop (>=901px): floating right sidebar (gradient), accordion sub-menus,
 *   green "+" fab (new document), settings + logout at the bottom.
 * - Mobile (<900px): app-style bottom bar + bottom-sheets (backdrop, slide, safe-area).
 * - RTL: content margin is on the RIGHT (margin-inline-start) so it never sits under
 *   the sidebar (the overlap bug).
 *
 * Navigation items, sub-items and document types are the REAL app routes — not the
 * mockup placeholders. All chrome classes are prefixed `dcx-` to avoid collisions.
 */

type SubItem = { href: string; label: string }
type NavItem = {
  key: string
  href?: string
  label: string
  icon: React.ReactNode
  subItems?: SubItem[]
}

// ── Icons (from the mockup; stroke, 24-box) ──────────────────────────────
const Ic = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></svg>
  ),
  reports: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></svg>
  ),
  customers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
  ),
  income: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
  ),
  file: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
  ),
  fileReceipt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M9 13h6" /></svg>
  ),
  fileCredit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M8 13l3 3 5-6" /></svg>
  ),
  // RTL: collapsed points LEFT (toward the content), rotates to point DOWN when open.
  moreChev: (
    <svg className="dcx-more-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
  ),
  collapse: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
  ),
  expand: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
  ),
  workOrder: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m8.5 15 1.5 1.5 3-3" /></svg>
  ),
  delivery: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 3h13v13H1z" /><path d="M14 8h4l3 3v5h-7z" /><circle cx="6" cy="18.5" r="2" /><circle cx="17" cy="18.5" r="2" /></svg>
  ),
  returnNote: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-15-6.7L3 13" /></svg>
  ),
  purchase: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.6 12.4a1.5 1.5 0 0 0 1.5 1.1h8.4a1.5 1.5 0 0 0 1.5-1.2L22 7H6" /></svg>
  ),
  selfInvoice: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><circle cx="12" cy="15" r="2.5" /></svg>
  ),
  selfCreditNote: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 15h6" /><circle cx="12" cy="15" r="4" /></svg>
  ),
  receipt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
  ),
  quote: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
  ),
  proforma: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
  ),
  chevron: (
    <svg className="dcx-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 2h-6a2 2 0 0 0-2 2v6M16 17l5-5-5-5M21 12H9M12 22H6a2 2 0 0 1-2-2v-4" /></svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
  ),
}

// ── Real navigation (routes + sub-items are the actual app ones) ─────────
const NAV: NavItem[] = [
  { key: "dashboard", href: "/dashboard", label: "דשבורד", icon: Ic.home },
  { key: "reports", href: "/dashboard/reports", label: "דוחות", icon: Ic.reports },
  {
    key: "customers",
    label: "לקוחות",
    icon: Ic.customers,
    subItems: [
      { href: "/dashboard/customers", label: "הלקוחות שלי" },
      { href: "/dashboard/customers/new", label: "לקוח חדש" },
    ],
  },
  {
    key: "income",
    label: "הכנסות",
    icon: Ic.income,
    subItems: [
      { href: "/dashboard/documents/income", label: "מסמכי הכנסות" },
      { href: "/dashboard/documents/income/drafts", label: "טיוטות מסמכי הכנסות" },
    ],
  },
  {
    key: "ongoing",
    label: "ניהול שוטף",
    icon: Ic.file,
    subItems: [
      { href: "/dashboard/documents/ongoing", label: "מסמכי ניהול שוטף" },
      { href: "/dashboard/documents/ongoing/drafts", label: "טיוטות ניהול שוטף" },
    ],
  },
]

// Real document types for the "+" (new document) menu — primary + collapsible "more".
const PRIMARY_DOCS: { href: string; label: string; icon: React.ReactNode }[] = [
  { href: "/dashboard/incomes/documents/new/invoice", label: "חשבונית מס", icon: Ic.file },
  { href: "/dashboard/incomes/documents/new/invoiceReceipt", label: "חשבונית מס / קבלה", icon: Ic.fileReceipt },
  { href: "/dashboard/incomes/documents/new/creditNote", label: "חשבונית זיכוי", icon: Ic.fileCredit },
  { href: "/dashboard/incomes/documents/new/receipt", label: "קבלה", icon: Ic.receipt },
  { href: "/business/documents/new/quote", label: "הצעת מחיר", icon: Ic.quote },
  { href: "/business/documents/new/proforma", label: "חשבון עסקה (דרישת תשלום)", icon: Ic.proforma },
]
// Same shape (and same `dcx-doc-a` rendering) as PRIMARY_DOCS so spacing/icons match exactly.
const MORE_DOCS: { href: string; label: string; icon: React.ReactNode }[] = [
  { href: "/business/documents/new/workOrder", label: "הזמנת עבודה", icon: Ic.workOrder },
  { href: "/business/documents/new/deliveryNote", label: "תעודת משלוח", icon: Ic.delivery },
  { href: "/business/documents/new/returnNote", label: "תעודת החזרה", icon: Ic.returnNote },
  { href: "/business/documents/new/purchaseOrder", label: "הזמנת רכש", icon: Ic.purchase },
  { href: "/business/documents/new/selfInvoice", label: "חשבונית עצמית", icon: Ic.selfInvoice },
  { href: "/business/documents/new/selfCreditNote", label: "חשבונית זיכוי עצמית", icon: Ic.selfCreditNote },
]

/** Shared with the production layout so the minimise preference carries over. */
const SIDEBAR_LS_KEY = "docsSidebarPinnedCollapsed"

function isActive(pathname: string, href?: string) {
  if (!href) return false
  return pathname === href
}
function anyChildActive(pathname: string, item: NavItem) {
  return !!item.subItems?.some((s) => pathname === s.href)
}

/**
 * New-document list: 6 primary types + a collapsible "מסמכים נוספים" group.
 *
 * The "more" items render with the SAME `dcx-doc-a` markup + icons as the primary
 * ones, so spacing is identical, and the group expands in place (no inner scroll).
 * `id` keeps the aria-controls unique between the desktop menu and the mobile sheet.
 */
function DocList({ id, onSelect }: { id: string; onSelect: () => void }) {
  const [moreOpen, setMoreOpen] = React.useState(false)
  const listId = `dcx-more-list-${id}`
  return (
    <>
      {PRIMARY_DOCS.map((d) => (
        <Link key={d.href} href={d.href} role="menuitem" className="dcx-doc-a" onClick={onSelect}>
          <span aria-hidden="true">{d.icon}</span>
          {d.label}
        </Link>
      ))}
      <div className={`dcx-more-wrap${moreOpen ? " open" : ""}`}>
        <button
          type="button"
          className="dcx-more-toggle"
          aria-expanded={moreOpen}
          aria-controls={listId}
          onClick={() => setMoreOpen((v) => !v)}
        >
          מסמכים נוספים
          {Ic.moreChev}
        </button>
        {moreOpen && (
          <div className="dcx-more-list" id={listId} role="group" aria-label="מסמכים נוספים">
            {MORE_DOCS.map((d) => (
              <Link key={d.href} href={d.href} role="menuitem" className="dcx-doc-a" onClick={onSelect}>
                <span aria-hidden="true">{d.icon}</span>
                {d.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export default function DashboardChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ""

  // Receipt preview is a full-screen view — render children with no chrome.
  const isReceiptPreview = pathname.startsWith("/dashboard/documents/receipt/preview")

  // Which sub-menu flyout is open (single-open). Flyouts float next to the sidebar
  // (like the "+" menu) instead of pushing the items below them down.
  const [openFly, setOpenFly] = React.useState<string | null>(null)
  const [fabOpen, setFabOpen] = React.useState(false)
  const [sheet, setSheet] = React.useState<null | "plus" | "more">(null)
  const fabWrapRef = React.useRef<HTMLDivElement>(null)
  const navRef = React.useRef<HTMLElement>(null)

  // Sidebar minimise/expand — same behaviour + localStorage key as production
  // (components/layout/DashboardLayout.tsx), so the user's preference carries over.
  const isDocCreateRoute =
    pathname.startsWith("/dashboard/documents/receipt") ||
    pathname.startsWith("/dashboard/documents/tax-invoice") ||
    pathname.startsWith("/dashboard/incomes/documents/new") ||
    pathname.startsWith("/business/documents/new")
  // Start expanded on the server so SSR and the first client render agree; the stored
  // preference is applied right after mount.
  const [collapsed, setCollapsed] = React.useState(false)
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_LS_KEY)
      if (stored != null) setCollapsed(stored === "true")
      else if (isDocCreateRoute) setCollapsed(true)
    } catch {
      // ignore
    }
    // Only on mount — later route changes must not fight the user's choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v
      try {
        window.localStorage.setItem(SIDEBAR_LS_KEY, String(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  // Close transient overlays on route change.
  React.useEffect(() => {
    setFabOpen(false)
    setSheet(null)
    setOpenFly(null)
  }, [pathname])

  // Fab + sub-menu flyouts: close on outside click.
  React.useEffect(() => {
    if (!fabOpen && !openFly) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (fabWrapRef.current && !fabWrapRef.current.contains(t)) setFabOpen(false)
      if (navRef.current && !navRef.current.contains(t)) setOpenFly(null)
    }
    document.addEventListener("click", onDocClick)
    return () => document.removeEventListener("click", onDocClick)
  }, [fabOpen, openFly])

  // Freeze the page behind the "+" menu and the bottom-sheets. The overlays
  // themselves scroll only when their own content overflows (overflow-y:auto +
  // overscroll-contain in the CSS), so the page never moves underneath.
  React.useEffect(() => {
    if (!fabOpen && !sheet) return
    lockBodyScroll()
    return () => unlockBodyScroll()
  }, [fabOpen, sheet])

  // Escape closes fab + flyouts + sheets.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFabOpen(false)
        setSheet(null)
        setOpenFly(null)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  // ── Mobile bottom-sheet: drag the grip down to dismiss ──
  // Only one sheet is open at a time, so a single drag offset is enough.
  const [dragY, setDragY] = React.useState(0)
  const dragStartY = React.useRef<number | null>(null)
  const DISMISS_PX = 70

  const gripHandlers = {
    onTouchStart: (e: React.TouchEvent) => {
      dragStartY.current = e.touches[0].clientY
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (dragStartY.current == null) return
      // Downward only — dragging up must not lift the sheet off the bottom edge.
      const dy = e.touches[0].clientY - dragStartY.current
      setDragY(dy > 0 ? dy : 0)
    },
    onTouchEnd: () => {
      if (dragStartY.current != null && dragY > DISMISS_PX) setSheet(null)
      dragStartY.current = null
      // Always reset so the inline transform stops overriding the class-based one.
      setDragY(0)
    },
    onTouchCancel: () => {
      dragStartY.current = null
      setDragY(0)
    },
  }
  // While dragging, follow the finger with no transition; on release, animate.
  const sheetDragStyle = (open: boolean): React.CSSProperties =>
    open && dragY > 0 ? { transform: `translateY(${dragY}px)`, transition: "none" } : {}

  const [isLoggingOut, setLoggingOut] = React.useState(false)
  const onLogout = async () => {
    if (isLoggingOut) return
    setLoggingOut(true)
    await logoutAction()
  }

  if (isReceiptPreview) {
    return <>{children}</>
  }

  return (
    <div className={`dcx-root${collapsed ? " collapsed" : ""}`} dir="rtl">
      <style>{DCX_CSS}</style>

      {/* ===== MAIN ===== */}
      <main className="dcx-main">{children}</main>

      {/* ===== DESKTOP SIDEBAR ===== */}
      <aside className="dcx-sidebar" aria-label="ניווט ראשי">
        <div className="dcx-brand">
          <Image
            className="dcx-logo dcx-logo-full"
            src="/brand/white.svg"
            alt="Uxellent"
            width={135}
            height={36}
            priority
          />
          {/* Minimised sidebar is 74px wide — the wordmark would be illegible, so
              the square mark stands in for it. Decorative: the full logo above
              already carries the accessible name. */}
          <Image
            className="dcx-logo dcx-logo-mark"
            src="/brand/icon.svg"
            alt=""
            aria-hidden="true"
            width={36}
            height={36}
            priority
          />
        </div>

        <nav className="dcx-nav" ref={navRef}>
          {NAV.map((item) => {
            if (!item.subItems) {
              return (
                <div className="dcx-nav-item" key={item.key}>
                  <Link
                    href={item.href!}
                    className={`dcx-nav-link${isActive(pathname, item.href) ? " active" : ""}`}
                    aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  >
                    <span className="dcx-nav-ic" aria-hidden="true">{item.icon}</span>
                    <span className="dcx-nav-t">{item.label}</span>
                  </Link>
                </div>
              )
            }
            const open = openFly === item.key
            return (
              <div className={`dcx-nav-item${open ? " open" : ""}`} key={item.key}>
                <button
                  type="button"
                  className={`dcx-nav-link${anyChildActive(pathname, item) ? " has-active" : ""}`}
                  aria-haspopup="menu"
                  aria-expanded={open}
                  aria-controls={`dcx-sub-${item.key}`}
                  title={item.label}
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpenFly((k) => (k === item.key ? null : item.key))
                  }}
                >
                  <span className="dcx-nav-ic" aria-hidden="true">{item.icon}</span>
                  <span className="dcx-nav-t">{item.label}</span>
                  {Ic.chevron}
                </button>
                {open && (
                  <div className="dcx-submenu" id={`dcx-sub-${item.key}`} role="menu" aria-label={item.label}>
                    {item.subItems.map((s) => (
                      <Link
                        key={s.href}
                        href={s.href}
                        role="menuitem"
                        className={pathname === s.href ? "active" : undefined}
                        aria-current={pathname === s.href ? "page" : undefined}
                        onClick={() => setOpenFly(null)}
                      >
                        {s.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* + new document */}
        <div className={`dcx-fab-wrap${fabOpen ? " open" : ""}`} ref={fabWrapRef}>
          <button
            type="button"
            className="dcx-fab"
            aria-haspopup="menu"
            aria-expanded={fabOpen}
            aria-label={fabOpen ? "סגור תפריט מסמך חדש" : "פתח תפריט מסמך חדש"}
            onClick={(e) => {
              e.stopPropagation()
              setFabOpen((v) => !v)
            }}
          >
            +
          </button>
          {fabOpen && (
            <div className="dcx-fab-menu" role="menu">
              <div className="dcx-fab-h">מסמך חדש</div>
              <DocList id="fab" onSelect={() => setFabOpen(false)} />
            </div>
          )}
        </div>

        <div className="dcx-side-bottom">
          <Link
            href="/dashboard/settings"
            className={pathname.startsWith("/dashboard/settings") ? "active" : undefined}
            aria-current={pathname.startsWith("/dashboard/settings") ? "page" : undefined}
            title="הגדרות"
          >
            <span aria-hidden="true">{Ic.settings}</span>
            <span className="dcx-nav-t">הגדרות</span>
          </Link>
          <button type="button" onClick={onLogout} disabled={isLoggingOut} aria-label="התנתקות מהמערכת" title="התנתקות">
            <span aria-hidden="true">{Ic.logout}</span>
            <span className="dcx-nav-t">{isLoggingOut ? "מתנתק..." : "התנתקות"}</span>
          </button>
          <button
            type="button"
            className="dcx-collapse"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "הרחב תפריט" : "כווץ תפריט"}
            title={collapsed ? "הרחב תפריט" : "כווץ תפריט"}
          >
            <span aria-hidden="true">{collapsed ? Ic.expand : Ic.collapse}</span>
            <span className="dcx-nav-t">כווץ תפריט</span>
          </button>
        </div>
      </aside>

      {/* ===== MOBILE bottom bar ===== */}
      <nav className="dcx-mobilebar" aria-label="ניווט תחתון">
        <Link href="/dashboard" className={isActive(pathname, "/dashboard") ? "active" : undefined}>
          <span aria-hidden="true">{Ic.home}</span>דשבורד
        </Link>
        <Link href="/dashboard/reports" className={isActive(pathname, "/dashboard/reports") ? "active" : undefined}>
          <span aria-hidden="true">{Ic.reports}</span>דוחות
        </Link>
        <button type="button" className="dcx-mplus" aria-label="מסמך חדש" onClick={() => setSheet("plus")}>
          <span className="dcx-mplus-b" aria-hidden="true">+</span>
        </button>
        <Link href="/dashboard/customers" className={pathname.startsWith("/dashboard/customers") ? "active" : undefined}>
          <span aria-hidden="true">{Ic.customers}</span>לקוחות
        </Link>
        <button type="button" aria-label="תפריט" aria-haspopup="dialog" aria-expanded={sheet === "more"} onClick={() => setSheet("more")}>
          <span aria-hidden="true">{Ic.menu}</span>תפריט
        </button>
      </nav>

      {/* ===== Mobile backdrop + sheets ===== */}
      <div className={`dcx-backdrop${sheet ? " on" : ""}`} onClick={() => setSheet(null)} aria-hidden={!sheet} />

      <div
        className={`dcx-sheet${sheet === "plus" ? " on" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="מסמך חדש"
        aria-hidden={sheet !== "plus"}
        style={sheetDragStyle(sheet === "plus")}
      >
        <button type="button" className="dcx-grip-hit" aria-label="סגור" onClick={() => setSheet(null)} {...gripHandlers}>
          <span className="dcx-grip" aria-hidden="true" />
        </button>
        <div className="dcx-sheet-h">מסמך חדש</div>
        {sheet === "plus" && <DocList id="sheet" onSelect={() => setSheet(null)} />}
      </div>

      <div
        className={`dcx-sheet${sheet === "more" ? " on" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="תפריט"
        aria-hidden={sheet !== "more"}
        style={sheetDragStyle(sheet === "more")}
      >
        <button type="button" className="dcx-grip-hit" aria-label="סגור" onClick={() => setSheet(null)} {...gripHandlers}>
          <span className="dcx-grip" aria-hidden="true" />
        </button>
        <div className="dcx-sheet-h">תפריט</div>
        <Link href="/dashboard/documents/income" onClick={() => setSheet(null)}><span aria-hidden="true">{Ic.income}</span>הכנסות</Link>
        <Link href="/dashboard/documents/ongoing" onClick={() => setSheet(null)}><span aria-hidden="true">{Ic.file}</span>ניהול שוטף</Link>
        <Link href="/dashboard/settings" onClick={() => setSheet(null)}><span aria-hidden="true">{Ic.settings}</span>הגדרות</Link>
        <button type="button" onClick={onLogout} disabled={isLoggingOut}><span aria-hidden="true">{Ic.logout}</span>{isLoggingOut ? "מתנתק..." : "התנתקות"}</button>
      </div>
    </div>
  )
}

// ── Scoped CSS (mockup values; namespaced dcx-) ──────────────────────────
const DCX_CSS = `
.dcx-root{--dcx-side:#5389BB;--dcx-green:#8BD44F;--dcx-line:#E9ECF2;--dcx-ink:#22283A;--dcx-muted:#8A90A0;--dcx-accent:#5389BB;--dcx-accent-soft:#EAF1F8;}
/* Navy matches the marketing site (uxellent.com) rather than the old mid-blue
   gradient, so the two properties read as one brand. The drop shadow loses its
   blue tint with it — a blue glow around a navy panel read as a halo. */
.dcx-sidebar{position:fixed;right:15px;top:15px;height:calc(100% - 30px);width:224px;border-radius:14px;
  background:#0f1830;color:#fff;padding:20px 15px;display:flex;flex-direction:column;
  box-shadow:0 10px 30px rgba(15,24,48,.28);z-index:50}
.dcx-sidebar{transition:width .22s cubic-bezier(.2,.8,.2,1)}
.dcx-brand{display:flex;align-items:center;margin:2px 6px 22px;min-height:36px}
/* brand/white.svg has a white wordmark but keeps the brand-blue star
   (rgb(25,144,216)), which disappeared against the navy. Whitened here so the
   whole logo is white — the same treatment .dcx-logo-mark already used, and
   what /email/white-logo.svg (fully white in the file) used to provide.
   brightness(0) flattens every colour to black, invert(1) then takes it to
   white, so this works whatever colours the asset ships with. */
.dcx-logo{height:36px;width:auto;display:block;filter:brightness(0) invert(1)}
/* The collapsed-state mark needs the same: brand/icon.svg contains a
   fill="black" path, which would read as a black blob on the navy. */
.dcx-logo-mark{display:none;filter:brightness(0) invert(1)}
/* overflow must stay visible: the sub-menu flyouts escape the nav box. */
.dcx-nav{display:flex;flex-direction:column;gap:3px;overflow:visible}
.dcx-nav-item{display:flex;flex-direction:column;position:relative}
/* Regular items are 20px regular-weight — semi-bold at this size read as bloated.
   The active item keeps 600 + brand blue (see the .active rules below). */
.dcx-nav-link{display:flex;align-items:center;gap:12px;padding:11px 13px;border-radius:11px;color:#F0F5FA;text-decoration:none;font-weight:400;font-size:20px;cursor:pointer;transition:background .15s,color .15s;background:none;border:none;width:100%;text-align:right;font-family:inherit;white-space:nowrap}
.dcx-nav-t{overflow:hidden;text-overflow:ellipsis}
.dcx-nav-ic{display:inline-flex;flex-shrink:0}.dcx-nav-link svg{width:20px;height:20px;flex-shrink:0}
.dcx-chev{margin-inline-start:auto;width:17px !important;height:17px !important;transition:transform .25s}
.dcx-nav-link:hover{background:rgba(255,255,255,.16)}
.dcx-nav-item.open .dcx-chev{transform:rotate(180deg)}

/* --- Active item -------------------------------------------------------
   app/globals.css has a legacy blanket rule "aside nav, aside nav * {color:
   var(--neutral-white) !important}" which turned the active item white-on-white.
   These selectors are class-based (higher specificity) and !important, so the
   brand blue wins for the label AND the icon. */
.dcx-root .dcx-sidebar .dcx-nav .dcx-nav-link.active{background:#fff;font-weight:600;box-shadow:0 3px 10px rgba(0,0,0,.08)}
/* Darker than --dcx-accent (#5389BB) on purpose: the white pill now sits on
   navy, which makes it the loudest thing in the sidebar, and the accent only
   managed 3.71:1 against white — under AA for 20px regular text. #4576A6 is the
   same hue a few steps down and measures 4.78:1. Scoped to the sidebar, so the
   accent stays as-is everywhere else. */
.dcx-root .dcx-sidebar .dcx-nav .dcx-nav-link.active,
.dcx-root .dcx-sidebar .dcx-nav .dcx-nav-link.active *,
.dcx-root .dcx-sidebar .dcx-nav .dcx-nav-link.active svg{color:#4576A6 !important;font-weight:600}
.dcx-root .dcx-sidebar .dcx-nav .dcx-nav-link.has-active,
.dcx-root .dcx-sidebar .dcx-nav .dcx-nav-link.has-active *{color:#fff !important}

/* --- Sub-menu: floating flyout (like the "+" menu), not a pushing accordion --- */
.dcx-submenu{position:absolute;top:-6px;right:calc(100% + 12px);min-width:215px;background:#fff;border:1px solid var(--dcx-line);
  border-radius:14px;box-shadow:0 16px 40px rgba(20,24,45,.18);padding:8px;display:flex;flex-direction:column;gap:2px;
  z-index:60;transform-origin:top right;animation:dcxfly .18s cubic-bezier(.2,.8,.2,1)}
@keyframes dcxfly{from{opacity:0;transform:translateX(8px) scale(.97)}}
.dcx-root .dcx-sidebar .dcx-nav .dcx-submenu a{display:block;padding:11px 12px;font-size:16px;font-weight:600;border-radius:9px;
  text-decoration:none;white-space:nowrap;color:var(--dcx-ink) !important}
.dcx-root .dcx-sidebar .dcx-nav .dcx-submenu a:hover,
.dcx-root .dcx-sidebar .dcx-nav .dcx-submenu a.active{background:var(--dcx-accent-soft);color:var(--dcx-accent) !important}

/* --- "+" new document: sits low in the sidebar, slightly larger --- */
.dcx-fab-wrap{position:relative;margin:14px 6px 10px;margin-top:auto;align-self:flex-start}
.dcx-fab{width:56px;height:56px;border-radius:15px;background:var(--dcx-green);color:#173a0b;border:none;cursor:pointer;
  display:grid;place-items:center;font-size:34px;font-weight:700;box-shadow:0 6px 16px rgba(139,212,79,.45);line-height:1;transition:.15s}
.dcx-fab:hover{transform:translateY(-1px)}
/* Scrolls only when its own content is taller than the space available, and never
   chains that scroll to the page behind it. */
.dcx-fab-menu{position:absolute;bottom:0;right:66px;width:290px;background:#fff;border:1px solid var(--dcx-line);border-radius:14px;
  box-shadow:0 16px 40px rgba(20,24,45,.18);padding:8px;transform-origin:bottom right;z-index:60;
  max-height:calc(100vh - 40px);overflow-y:auto;overscroll-behavior:contain;
  animation:dcxpop .2s cubic-bezier(.2,.8,.2,1)}
@keyframes dcxpop{from{opacity:0;transform:translateY(10px) scale(.96)}}
.dcx-fab-h{font-size:13px;color:var(--dcx-muted);font-weight:700;padding:6px 12px 6px}
.dcx-doc-a{display:flex;align-items:center;gap:12px;padding:12px;border-radius:9px;color:var(--dcx-ink);text-decoration:none;font-weight:400;font-size:18px;line-height:1.45}
.dcx-doc-a:hover{background:var(--dcx-accent-soft);color:var(--dcx-accent)}
.dcx-doc-a svg{width:21px;height:21px;color:var(--dcx-accent);flex-shrink:0}
.dcx-more-wrap{display:flex;flex-direction:column}
.dcx-more-toggle{display:flex;align-items:center;gap:12px;padding:12px;margin-top:4px;border:none;border-top:1px solid var(--dcx-line);
  color:#3A4155;font-weight:400;font-size:18px;line-height:1.45;cursor:pointer;background:none;font-family:inherit;width:100%;text-align:right}
.dcx-more-chev{margin-inline-start:auto;width:18px;height:18px;transition:transform .25s;flex-shrink:0}
.dcx-more-wrap.open .dcx-more-chev{transform:rotate(-90deg)}
/* expands in place — no inner scrolling */
.dcx-more-list{display:flex;flex-direction:column}
.dcx-side-bottom{display:flex;flex-direction:column;gap:3px;padding-top:10px;border-top:1px solid rgba(255,255,255,.18)}
.dcx-side-bottom a,.dcx-side-bottom button{display:flex;align-items:center;gap:11px;padding:10px 13px;border-radius:11px;color:#EAF2F9;text-decoration:none;font-weight:400;font-size:16px;background:none;border:none;cursor:pointer;font-family:inherit;width:100%;text-align:right;white-space:nowrap}
.dcx-side-bottom a:hover,.dcx-side-bottom button:hover{background:rgba(255,255,255,.16)}
.dcx-side-bottom a.active{background:rgba(255,255,255,.2)}
.dcx-side-bottom svg{width:18px;height:18px;flex-shrink:0}
.dcx-collapse{opacity:.85}
.dcx-main{margin-right:255px;min-height:100vh;transition:margin-right .22s cubic-bezier(.2,.8,.2,1)}

/* --- Minimised sidebar (icons only) --- */
.dcx-root.collapsed .dcx-sidebar{width:74px;padding:20px 11px}
.dcx-root.collapsed .dcx-main{margin-right:105px}
.dcx-root.collapsed .dcx-brand{justify-content:center;margin:2px 0 22px}
.dcx-root.collapsed .dcx-logo-full{display:none}
.dcx-root.collapsed .dcx-logo-mark{display:block;height:34px;width:34px}
.dcx-root.collapsed .dcx-nav-t,
.dcx-root.collapsed .dcx-chev{display:none}
.dcx-root.collapsed .dcx-nav-link{justify-content:center;padding:12px 0;gap:0}
.dcx-root.collapsed .dcx-side-bottom a,
.dcx-root.collapsed .dcx-side-bottom button{justify-content:center;padding:11px 0;gap:0}
.dcx-root.collapsed .dcx-fab-wrap{align-self:center;margin-inline:0}
.dcx-root.collapsed .dcx-fab{width:50px;height:50px;font-size:30px}
.dcx-root.collapsed .dcx-fab-menu{right:60px}
.dcx-mobilebar,.dcx-backdrop,.dcx-sheet{display:none}
@media(max-width:900px){
  .dcx-sidebar{display:none}
  /* The .collapsed override lives outside this query and is more specific, so it
     used to keep a 105px right margin on phones — and doc-create routes default to
     collapsed, which is why "מסמך חדש" was the page that looked squeezed. Both
     selectors are reset here so no sidebar spacing can survive below 900px. */
  .dcx-main,.dcx-root.collapsed .dcx-main{margin-right:0;padding-bottom:82px}
  .dcx-mobilebar{display:flex;position:fixed;bottom:0;left:0;right:0;height:66px;background:#fff;border-top:1px solid var(--dcx-line);
    box-shadow:0 -6px 20px rgba(20,24,45,.07);z-index:70;align-items:center;justify-content:space-around;padding:0 8px;padding-bottom:env(safe-area-inset-bottom)}
  .dcx-mobilebar a,.dcx-mobilebar button{background:none;border:none;font-family:inherit;cursor:pointer;color:var(--dcx-muted);text-decoration:none;
    display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11.5px;font-weight:700;flex:1}
  .dcx-mobilebar a.active{color:var(--dcx-accent)}
  .dcx-mobilebar svg{width:23px;height:23px}
  .dcx-mplus{flex:0 0 auto !important}
  .dcx-mplus-b{width:48px;height:48px;border-radius:14px;background:var(--dcx-green);color:#173a0b;display:grid;place-items:center;
    font-size:27px;box-shadow:0 4px 12px rgba(139,212,79,.4)}
  .dcx-backdrop{display:block;position:fixed;inset:0;background:rgba(20,24,45,.4);opacity:0;pointer-events:none;transition:.22s;z-index:75}
  .dcx-backdrop.on{opacity:1;pointer-events:auto}
  /* Scrolls only if its own content overflows, and never chains to the page. */
  .dcx-sheet{display:block;position:fixed;left:0;right:0;bottom:0;background:#fff;border-radius:18px 18px 0 0;z-index:80;
    padding:10px 16px calc(16px + env(safe-area-inset-bottom));transform:translateY(100%);transition:transform .28s cubic-bezier(.2,.8,.2,1);box-shadow:0 -10px 40px rgba(20,24,45,.2);
    max-height:88vh;overflow-y:auto;overscroll-behavior:contain}
  .dcx-sheet.on{transform:none}
  /* Grip: swipe down to dismiss (tap also closes). Overrides the generic
     ".dcx-sheet button" rule above, and touch-action:none keeps the browser
     from scrolling the page while the finger drags the sheet. */
  .dcx-sheet .dcx-grip-hit{display:flex;align-items:center;justify-content:center;width:100%;padding:10px 0 8px;
    background:none;border:none;cursor:grab;touch-action:none;-webkit-tap-highlight-color:transparent;font-size:0;gap:0}
  .dcx-sheet .dcx-grip-hit:active{cursor:grabbing;background:none}
  .dcx-grip{display:block;width:44px;height:5px;border-radius:4px;background:#D7DBE3;margin:0}
  .dcx-sheet-h{font-size:13px;color:var(--dcx-muted);font-weight:700;margin:2px 4px 8px}
  .dcx-sheet a,.dcx-sheet button{display:flex;align-items:center;gap:12px;padding:14px 8px;border-radius:11px;color:var(--dcx-ink);text-decoration:none;font-weight:700;font-size:16px;width:100%;background:none;border:none;cursor:pointer;font-family:inherit;text-align:right}
  .dcx-sheet a:active,.dcx-sheet button:active{background:var(--dcx-accent-soft)}
  .dcx-sheet svg{width:20px;height:20px;color:var(--dcx-accent)}
  /* Document items match the desktop "+" menu: 18px regular, not the sheet's
     default 16px/700 — that generic rule above is more specific than .dcx-doc-a. */
  .dcx-sheet .dcx-doc-a{font-size:18px;font-weight:400;padding:13px 8px}
  .dcx-sheet .dcx-more-toggle{padding:14px 8px;font-size:18px;font-weight:400;color:#3A4155;border:none;border-top:1px solid var(--dcx-line);margin-top:2px}
  .dcx-sheet .dcx-more-chev{width:17px;height:17px}
}
@media(min-width:901px){.dcx-mobilebar,.dcx-backdrop,.dcx-sheet{display:none !important}}
/* Safety only for short viewports — the fully expanded list is ~700px tall. */
@media(min-width:901px) and (max-height:860px){
  .dcx-fab-menu{max-height:calc(100vh - 70px);overflow-y:auto}
}
@media(prefers-reduced-motion:reduce){
  .dcx-nav-link,.dcx-chev,.dcx-submenu,.dcx-fab,.dcx-fab-menu,.dcx-backdrop,.dcx-sheet,
  .dcx-sidebar,.dcx-main,.dcx-more-chev{transition:none !important;animation:none !important}
}
`

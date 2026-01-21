"use client"

import { useState } from "react"
import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X, Home, FileText, Users, LogOut, BarChart, ChevronDown, Settings } from "lucide-react"
import { logoutAction } from "@/app/dashboard/actions"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

interface DashboardLayoutProps {
  children: React.ReactNode
}

type NavItem = {
  href?: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  subItems?: { href: string; label: string }[]
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "דשבורד", icon: Home },
  { href: "/dashboard/reports", label: "דוחות", icon: BarChart },
  {
    label: "לקוחות",
    icon: Users,
    subItems: [
      { href: "/dashboard/customers/new", label: "לקוח חדש" },
      { href: "/dashboard/customers", label: "הלקוחות שלי" },
    ],
  },
  {
    label: "מסמכים",
    icon: FileText,
    subItems: [{ href: "/dashboard/documents", label: "כל המסמכים" }],
  },
]

/**
 * Helper to determine active state:
 * - Leaf (no subItems): Exact match only
 * - Parent (has subItems): NOT active (children handle their own state)
 */
function isItemActive(item: NavItem, pathname: string): boolean {
  if (!item.href) return false
  if (!item.subItems || item.subItems.length === 0) {
    return pathname === item.href
  }
  return false
}

/**
 * Helper to check if any child is active (for parent highlighting)
 */
function hasActiveChild(item: NavItem, pathname: string): boolean {
  if (!item.subItems) return false
  return item.subItems.some((subItem) => pathname === subItem.href)
}

/**
 * Helper for sub-item active state - exact match only
 */
function isSubItemActive(subItemHref: string, pathname: string): boolean {
  return pathname === subItemHref
}

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const pathname = usePathname()
  const isActive = isItemActive(item, pathname)
  const hasActiveSubItem = hasActiveChild(item, pathname)

  // Common right-slot width so rows align (chevron column)
  const RightSlot = ({ children }: { children?: React.ReactNode }) => (
    <span className="shrink-0 w-6 flex items-center justify-center" aria-hidden="true">
      {children}
    </span>
  )

  if (item.subItems) {
    const baseRowClass = `block flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
      hasActiveSubItem
        ? "ui-sidebar-current bg-sidebar-active text-sidebar-active-fg font-medium"
        : "text-sidebar-fg hover:bg-sidebar-hover"
    }`

    return (
      <div className="block">
        {/* Mobile: inline accordion */}
        <div className="md:hidden">
          <details className="group">
            <summary
              className={`${baseRowClass} list-none [&::-webkit-details-marker]:hidden`}
              style={{ fontSize: "18px", lineHeight: "1", margin: 0 }}
              aria-label={item.label}
            >
              <span className="shrink-0 ui-sidebar-current-icon">
                <item.icon className="h-5 w-5 text-current" />
              </span>

              <span className="flex-1 ui-sidebar-current-text">{item.label}</span>

              <RightSlot>
                <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180 text-current ui-sidebar-current-icon" />
              </RightSlot>
            </summary>

            <div className="mt-1 mr-4 border-r border-sidebar-border">
              {item.subItems.map((subItem) => {
                const isSubActive = isSubItemActive(subItem.href, pathname)

                return (
                  <Link
                    key={subItem.href}
                    href={subItem.href}
                    onClick={onClick}
                    className={`block px-4 py-3 rounded-lg transition ${
                      isSubActive
                        ? "ui-sidebar-current bg-sidebar-active text-sidebar-active-fg font-medium"
                        : "text-sidebar-fg hover:bg-sidebar-hover"
                    }`}
                    style={{ fontSize: "18px", lineHeight: "1" }}
                  >
                    <span className="ui-sidebar-current-text">{subItem.label}</span>
                  </Link>
                )
              })}
            </div>
          </details>
        </div>

        {/* Desktop: dropdown menu */}
        <div className="hidden md:block">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={baseRowClass}
                style={{ fontSize: "18px", lineHeight: "1", margin: 0, width: "100%", textAlign: "right" }}
                aria-label={item.label}
              >
                <span className="shrink-0 ui-sidebar-current-icon">
                  <item.icon className="h-5 w-5 text-current" />
                </span>

                <span className="flex-1 ui-sidebar-current-text">{item.label}</span>

                <RightSlot>
                  <ChevronDown className="h-4 w-4 transition-transform duration-200 text-current ui-sidebar-current-icon" />
                </RightSlot>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent side="left" align="start" sideOffset={8} className="min-w-[160px]">
              {item.subItems.map((subItem) => (
                <DropdownMenuItem key={subItem.href} asChild onSelect={() => onClick?.()}>
                  <Link href={subItem.href} className="w-full">
                    {subItem.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    )
  }

  // Leaf item
  return (
    <Link
      href={item.href!}
      onClick={onClick}
      className={`block flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
        isActive
          ? "ui-sidebar-current bg-sidebar-active text-sidebar-active-fg font-medium"
          : "text-sidebar-fg hover:bg-sidebar-hover"
      }`}
      style={{ fontSize: "18px", lineHeight: "1", margin: 0 }}
    >
      <span className="shrink-0 ui-sidebar-current-icon">
        <item.icon className="h-5 w-5 text-current" />
      </span>

      <span className="flex-1 ui-sidebar-current-text">{item.label}</span>

      {/* keeps alignment with rows that have a chevron */}
      <span className="shrink-0 w-6" aria-hidden="true" />
    </Link>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    setIsLoggingOut(true)
    await logoutAction()
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-8 px-4 pt-6">
        <div className="text-xl font-bold text-sidebar-fg">מערכת ניהול</div>
        <div className="text-xs text-sidebar-fg mt-1">Dashboard</div>
      </div>

      {/* Navigation */}
      <nav aria-label="ניווט ראשי" className="flex-1 px-3 overflow-y-auto">
        {navItems.map((item, idx) => (
          <div key={idx} style={{ margin: 0, padding: 0 }}>
            <NavLink item={item} onClick={onNavigate} />
          </div>
        ))}
      </nav>

      {/* New Document Button */}
      <div style={{ marginBottom: "30px", marginTop: "50px", padding: "0 30px", position: "relative" }}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center justify-center gap-2 w-[55px] h-[55px]  transition-all font-bold bg-[#99DE76] hover:bg-[#FFC669] text-[#19183B] text-[18px] py-[14px] "
              aria-label="מסמך חדש"
            >
              <span style={{ fontSize: "44px", fontWeight: "bold", marginRight: "2px", color: "var(--fg)" }}>+</span>
              
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent side="left" align="start" sideOffset={8} className="min-w-[160px]">
            <DropdownMenuItem asChild onSelect={() => onNavigate?.()}>
              <Link href="/dashboard/documents/receipt" className="w-full">
                קבלה
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Settings Link */}
      <div style={{ marginBottom: "8px", padding: "0 12px" }}>
        <Link
          href="/dashboard/settings"
          className={`block flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
            pathname === "/dashboard/settings" || pathname.startsWith("/dashboard/settings/")
              ? "ui-sidebar-current bg-sidebar-active text-sidebar-active-fg font-medium visited:text-sidebar-active-fg"
              : "text-sidebar-fg hover:bg-sidebar-hover visited:text-sidebar-fg"
          }`}
          style={{ fontSize: "18px", lineHeight: "1", margin: 0 }}
          onClick={onNavigate}
        >
          <span className="shrink-0 ui-sidebar-current-icon">
            <Settings className="h-5 w-5 text-current" />
          </span>
          <span className="flex-1 ui-sidebar-current-text">הגדרות</span>
          <span className="shrink-0 w-6" aria-hidden="true" />
        </Link>
      </div>

      {/* Logout Button */}
      <div className="sticky bottom-0 bg-sidebar/95 backdrop-blur pt-4 pb-6 px-3">
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          aria-label={isLoggingOut ? "מתנתק..." : "התנתק מהמערכת"}
          className="ui-sidebar-item text-sidebar-fg hover:text-sidebar-fg disabled:opacity-50 disabled:cursor-not-allowed w-full"
          style={{ fontSize: "18px" }}
        >
          <LogOut className="h-5 w-5 text-current" />
          <span>{isLoggingOut ? "מתנתק..." : "התנתקות"}</span>
          <span className="shrink-0 w-6" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const isReceiptPreview = pathname?.startsWith("/dashboard/documents/receipt/preview")
  const mobileHeaderRef = React.useRef<HTMLDivElement>(null)
  const hamburgerButtonRef = React.useRef<HTMLButtonElement>(null)
  const desktopAsideRef = React.useRef<HTMLElement | null>(null)

  const captureHorizontalOverflowSnapshot = React.useCallback(
    (reason: string) => {
      try {
        const runId = "hdrx-hamburger-swap-1"
        const html = document.documentElement
        const body = document.body
        const header = mobileHeaderRef.current
        const btn = hamburgerButtonRef.current

        const elAtHamburgerCenter = (() => {
          if (!btn) return null
          const r = btn.getBoundingClientRect()
          const x = r.left + r.width / 2
          const y = r.top + r.height / 2
          const el = document.elementFromPoint(x, y) as any
          return el
            ? { tag: String(el.tagName || "").toLowerCase(), className: String(el.className || "").slice(0, 140) }
            : null
        })()

        const iconState = (() => {
          if (!btn) return null
          const xSvg = btn.querySelector("svg.lucide-x") as SVGElement | null
          const mSvg = btn.querySelector("svg.lucide-menu") as SVGElement | null
          const xCss = xSvg ? getComputedStyle(xSvg) : null
          const mCss = mSvg ? getComputedStyle(mSvg) : null
          return {
            hasX: !!xSvg,
            hasMenu: !!mSvg,
            xOpacity: xCss ? xCss.opacity : null,
            xDisplay: xCss ? xCss.display : null,
            mOpacity: mCss ? mCss.opacity : null,
            mDisplay: mCss ? mCss.display : null,
          }
        })()

        const base = {
          reason,
          pathname: window.location?.pathname || null,
          viewportW: window.innerWidth,
          viewportH: window.innerHeight,
          headerRendered: !!header,
          htmlClientW: html?.clientWidth ?? null,
          htmlScrollW: html?.scrollWidth ?? null,
          bodyClientW: body?.clientWidth ?? null,
          bodyScrollW: body?.scrollWidth ?? null,
          htmlOverflowX: html ? getComputedStyle(html).overflowX : null,
          bodyOverflowX: body ? getComputedStyle(body).overflowX : null,
          headerClientW: header?.clientWidth ?? null,
          headerScrollW: header?.scrollWidth ?? null,
          sidebarOpen,
          elAtHamburgerCenter,
          hamburgerColor: btn ? getComputedStyle(btn).color : null,
          headerBg: header ? getComputedStyle(header).backgroundColor : null,
          iconState,
          runId,
        }

        void base
      } catch {
        // ignore
      }
    },
    [sidebarOpen]
  )

  React.useEffect(() => {
    if (!sidebarOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [sidebarOpen])

  React.useEffect(() => {
    captureHorizontalOverflowSnapshot("mount")
    const onResize = () => captureHorizontalOverflowSnapshot("resize")
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [captureHorizontalOverflowSnapshot])

  React.useEffect(() => {
    captureHorizontalOverflowSnapshot(sidebarOpen ? "drawer_open" : "drawer_closed")
  }, [sidebarOpen, captureHorizontalOverflowSnapshot])

  const mainWrapperClassName = isReceiptPreview
    ? "relative z-0 flex-1 min-w-0 bg-bg"
    : "relative z-0 flex-1 min-w-0 pr-0 md:pr-[200px] bg-bg"
  const mainClassName = isReceiptPreview
    ? "w-full h-screen"
    : "w-full max-w-[1440px] mx-auto px-02 lg:px-12 pt-8 pb-12"
  const desktopAsideClassName =
    "hidden md:block fixed right-[15px] top-[15px] z-50 h-[calc(100%-30px)] w-[200px] max-w-[250px] bg-sidebar overflow-hidden rounded-[10px]"

  React.useEffect(() => {
    if (isReceiptPreview) return
    const el = desktopAsideRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const styles = getComputedStyle(el)
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "pre-fix",
        hypothesisId: "H1",
        location: "DashboardLayout.tsx:desktopAsideEffect",
        message: "Desktop aside metrics on mount",
        data: {
          className: desktopAsideClassName,
          viewportH: window.innerHeight,
          rectTop: rect.top,
          rectBottom: rect.bottom,
          rectHeight: rect.height,
          computedHeight: styles.height,
          computedTop: styles.top,
          computedRight: styles.right,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion agent log
  }, [desktopAsideClassName, isReceiptPreview])

  React.useEffect(() => {
    if (isReceiptPreview) return
    const onResize = () => {
      const el = desktopAsideRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/3a8787c5-a5d3-4ac5-9a1f-728ba44f08e9", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "pre-fix",
          hypothesisId: "H2",
          location: "DashboardLayout.tsx:desktopAsideResize",
          message: "Desktop aside metrics on resize",
          data: {
            viewportH: window.innerHeight,
            rectTop: rect.top,
            rectBottom: rect.bottom,
            rectHeight: rect.height,
            bottomGap: window.innerHeight - rect.bottom,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion agent log
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [isReceiptPreview])

  return (
    <div className="flex min-h-screen text-fg overflow-x-hidden bg-bg" dir="rtl">
      {/* Main Content Area */}
      <div className={mainWrapperClassName}>
        {/* Mobile Header */}
        {!isReceiptPreview && (
          <div ref={mobileHeaderRef} className="sticky top-0 z-[60] md:hidden bg-bg/95 backdrop-blur border-b border-border w-full max-w-full">
            <div className="flex items-center justify-start px-4 py-3">
              <button
                ref={hamburgerButtonRef}
                type="button"
                onClick={() => setSidebarOpen((v) => !v)}
                className={`p-2 rounded-md hover:bg-muted transition ${sidebarOpen ? "text-white" : "text-fg"}`}
                aria-label={sidebarOpen ? "סגור תפריט" : "פתח תפריט"}
                aria-expanded={sidebarOpen}
                aria-controls="mobile-sidebar"
              >
                {sidebarOpen ? (
                  <X className="h-6 w-6 text-white transition-transform duration-200 rotate-0 scale-100" aria-hidden="true" />
                ) : (
                  <Menu className="h-6 w-6 transition-transform duration-200 rotate-0 scale-100" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <main className={mainClassName}>{children}</main>
      </div>

      {/* Desktop Sidebar */}
      {!isReceiptPreview && (
        <aside ref={desktopAsideRef} className={desktopAsideClassName}>
          <SidebarContent />
        </aside>
      )}

      {/* Mobile Sidebar */}
      {!isReceiptPreview && sidebarOpen ? (
        <>
        <aside id="mobile-sidebar" className="fixed top-0 right-0 z-50 h-full w-[85vw] max-w-[320px] bg-sidebar md:hidden">
            <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
              <span className="font-semibold text-lg">תפריט</span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-md hover:bg-sidebar-hover transition"
                aria-label="סגור תפריט"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="h-[calc(100%-73px)]">
              <SidebarContent onNavigate={() => setSidebarOpen(false)} />
            </div>
          </aside>

          <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
        </>
      ) : null}
    </div>
  )
}

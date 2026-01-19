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
  {
    href: "/dashboard",
    label: "דשבורד",
    icon: Home,
  },
  {
    href: "/dashboard/reports",
    label: "דוחות",
    icon: BarChart,
  },
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
    subItems: [
      { href: "/dashboard/documents", label: "כל המסמכים" },
    ],
  },
]

/**
 * Helper to determine active state:
 * - Leaf (no subItems): Exact match only
 * - Parent (has subItems): Prefix match (active if you're inside section) but doesn't light all children
 */
function isItemActive(item: NavItem, pathname: string): boolean {
  if (!item.href) return false
  
  // Leaf node (no subItems) - exact match only
  if (!item.subItems || item.subItems.length === 0) {
    return pathname === item.href
  }
  
  // Parent node - should NOT be active, children handle their own state
  return false
}

/**
 * Helper to check if any child is active (for parent highlighting)
 */
function hasActiveChild(item: NavItem, pathname: string): boolean {
  if (!item.subItems) return false
  return item.subItems.some(subItem => pathname === subItem.href)
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
  
  // Check if any subitem is active
  const hasActiveSubItem = hasActiveChild(item, pathname)

  if (item.subItems) {
    const baseRowClass =
      `block flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
        hasActiveSubItem
          ? "bg-sidebar-active text-sidebar-active-fg font-medium"
          : "text-sidebar-fg hover:bg-sidebar-hover"
      }`

    return (
      <div className="block">
        {/* Mobile: inline accordion (no hover reliance) */}
        <div className="md:hidden">
          <details className="group">
            <summary
              className={`${baseRowClass} list-none [&::-webkit-details-marker]:hidden`}
              style={{ fontSize: "18px", lineHeight: "1", margin: 0 }}
              aria-label={item.label}
            >
              <span className="shrink-0 text-sidebar-fg">
                <item.icon className="h-5 w-5" />
              </span>
              <span className="flex-1">{item.label}</span>
              <ChevronDown className="h-4 w-4 text-sidebar-fg transition-transform duration-200 group-open:rotate-180" />
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
                        ? "bg-sidebar-active text-sidebar-active-fg font-medium"
                        : "text-sidebar-fg hover:bg-sidebar-hover"
                    }`}
                    style={{ fontSize: "18px", lineHeight: "1" }}
                  >
                    {subItem.label}
                  </Link>
                )
              })}
            </div>
          </details>
        </div>

        {/* Desktop: dropdown menu (stable, no DOM hacks) */}
        <div className="hidden md:block">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={baseRowClass}
                style={{ fontSize: "18px", lineHeight: "1", margin: 0, width: "100%", textAlign: "right" }}
                aria-label={item.label}
              >
                <span className="shrink-0 text-sidebar-fg">
                  <item.icon className="h-5 w-5" />
                </span>
                <span className="flex-1">{item.label}</span>
                <ChevronDown className="h-4 w-4 text-sidebar-fg transition-transform duration-200" />
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

  return (
    <Link
      href={item.href!}
      onClick={onClick}
      className={`block flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
        isActive
          ? "bg-sidebar-active text-sidebar-active-fg font-medium"
          : "text-sidebar-fg hover:bg-sidebar-hover"
      }`}
      style={{ fontSize: '18px', lineHeight: '1', margin: 0 }}
    >
      <span className="shrink-0 text-sidebar-fg">
        <item.icon className="h-5 w-5" />
      </span>
      <span>{item.label}</span>
    </Link>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
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

      {/* New Document Button - above logout, 100px margin */}
      <div style={{ marginBottom: '100px', marginTop: '50px', padding: '0 12px', position: 'relative' }}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center justify-center gap-2 w-full rounded-lg transition-all font-bold bg-[#F39600] hover:bg-[#FFC669] text-[#19183B] text-[18px] py-[14px] shadow-[0_0_13px_0_rgba(0,0,0,0.10)]"
              aria-label="מסמך חדש"
            >
              <span style={{ fontSize: '22px', fontWeight: 'bold', marginRight: '8px', color: '#19183B' }}>+</span>
              <span style={{ color: '#19183B' }}>מסמך חדש</span>
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

      {/* Settings Link - above logout */}
      <div style={{ marginBottom: '8px', padding: '0 12px' }}>
        <Link
          href="/dashboard/settings"
          className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all"
          style={{ 
            fontSize: '18px',
            color: '#FFFFFF',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#1A3954'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <Settings className="h-5 w-5" style={{ color: '#FFFFFF' }} />
          <span>הגדרות</span>
        </Link>
      </div>

      {/* Logout Button - Sticky at bottom */}
      <div className="sticky bottom-0 bg-sidebar/95 backdrop-blur pt-4 pb-6 px-3">
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          aria-label={isLoggingOut ? "מתנתק..." : "התנתק מהמערכת"}
          className="flex w-full items-center gap-3 px-4 py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontSize: '18px', color: '#FFFFFF' }}
        >
          <LogOut className="h-5 w-5" style={{ color: '#FFFFFF' }} />
          <span>{isLoggingOut ? "מתנתק..." : "התנתקות"}</span>
        </button>
      </div>
    </div>
  )
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const mobileHeaderRef = React.useRef<HTMLDivElement>(null)
  const hamburgerButtonRef = React.useRef<HTMLButtonElement>(null)

  const captureHorizontalOverflowSnapshot = React.useCallback((reason: string) => {
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
        hamburger: btn
          ? {
              left: Math.round(btn.getBoundingClientRect().left),
              right: Math.round(btn.getBoundingClientRect().right),
              top: Math.round(btn.getBoundingClientRect().top),
              bottom: Math.round(btn.getBoundingClientRect().bottom),
              w: Math.round(btn.getBoundingClientRect().width),
              h: Math.round(btn.getBoundingClientRect().height),
            }
          : null,
        elAtHamburgerCenter,
        hamburgerColor: btn ? getComputedStyle(btn).color : null,
        headerBg: header ? getComputedStyle(header).backgroundColor : null,
        iconState,
      }

      const offenders: Array<{ tag: string; className: string; left: number; right: number; w: number }> = []
      if (header) {
        const vw = window.innerWidth
        const nodes = Array.from(header.querySelectorAll<HTMLElement>("*"))
        for (const el of nodes) {
          const r = el.getBoundingClientRect()
          if (r.right > vw + 0.5 || r.left < -0.5) {
            offenders.push({
              tag: el.tagName.toLowerCase(),
              className: String(el.className || "").slice(0, 120),
              left: Math.round(r.left),
              right: Math.round(r.right),
              w: Math.round(r.width),
            })
          }
          if (offenders.length >= 5) break
        }
      }

      const bodyOffenders: Array<{ tag: string; className: string; left: number; right: number; w: number }> = []
      try {
        const vw = window.innerWidth
        const nodes = Array.from(document.body.querySelectorAll<HTMLElement>("*")).slice(0, 2000)
        for (const el of nodes) {
          const r = el.getBoundingClientRect()
          if (r.right > vw + 0.5 || r.left < -0.5) {
            bodyOffenders.push({
              tag: el.tagName.toLowerCase(),
              className: String(el.className || "").slice(0, 120),
              left: Math.round(r.left),
              right: Math.round(r.right),
              w: Math.round(r.width),
            })
          }
          if (bodyOffenders.length >= 5) break
        }
      } catch {
        // ignore
      }

    } catch {
      // ignore
    }
  }, [sidebarOpen])

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

  return (
    <div className="flex min-h-screen text-fg overflow-x-hidden" dir="rtl" style={{ backgroundColor: '#EDF1F5' }}>
      {/* Main Content Area */}
      <div className="relative z-0 flex-1 min-w-0 pr-0 md:pr-[250px]" style={{ backgroundColor: '#EDF1F5' }}>
        {/* Mobile Header */}
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

        {/* Content */}
        <main className="w-full max-w-[1440px] mx-auto px-02 lg:px-12 pt-8 pb-12">
          {children}
        </main>
      </div>

      {/* Desktop Sidebar - Fixed Right */}
      <aside className="hidden md:block fixed right-0 top-0 z-50 h-screen w-[250px] max-w-[250px] bg-sidebar border-l border-sidebar-border overflow-hidden">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      {sidebarOpen ? (
        <>
          <aside
            id="mobile-sidebar"
            className="fixed top-0 right-0 z-50 h-full w-[85vw] max-w-[320px] bg-sidebar border-l border-sidebar-border md:hidden"
          >
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

          {/* Mobile Overlay */}
          <div
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        </>
      ) : null}
    </div>
  )
}

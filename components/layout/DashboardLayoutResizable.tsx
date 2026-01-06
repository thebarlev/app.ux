"use client"

import { useState, useCallback, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X, Home, FileText, Users, Settings, LogOut, GripVertical } from "lucide-react"
import { logoutAction } from "@/app/dashboard/actions"

interface DashboardLayoutResizableProps {
  children: React.ReactNode
}

type NavItem = {
  href: string
  label: string
  icon?: React.ReactNode
}

type NavSection = {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: "ראשי",
    items: [
      { href: "/dashboard", label: "לוח בקרה", icon: <Home className="h-4 w-4" /> },
      { href: "/dashboard/documents", label: "מסמכים", icon: <FileText className="h-4 w-4" /> },
      { href: "/dashboard/documents/all", label: "כל המסמכים", icon: <FileText className="h-4 w-4" /> },
    ],
  },
  {
    title: "קבלות וחשבוניות",
    items: [
      { href: "/dashboard/documents/receipts", label: "כל הקבלות" },
      { href: "/dashboard/documents/receipt", label: "קבלה חדשה" },
      { href: "/dashboard/documents/tax-invoice-receipt", label: "חשבונית מס קבלה" },
    ],
  },
  {
    title: "לקוחות",
    items: [
      { href: "/dashboard/customers", label: "כל הלקוחות", icon: <Users className="h-4 w-4" /> },
      { href: "/dashboard/customers/new", label: "לקוח חדש" },
    ],
  },
  {
    title: "הגדרות",
    items: [
      { href: "/dashboard/settings", label: "הגדרות עסק", icon: <Settings className="h-4 w-4" /> },
      { href: "/dashboard/templates", label: "תבניות מסמכים" },
    ],
  },
]

function NavLink({ href, label, icon, onClick }: NavItem & { onClick?: () => void }) {
  const pathname = usePathname()
  const isActive = pathname === href || pathname.startsWith(href + "/")

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`
        flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm transition-all
        ${
          isActive
            ? "bg-sidebar-active text-sidebar-active-fg font-medium"
            : "text-sidebar-fg hover:bg-sidebar-hover"
        }
      `}
    >
      {icon && <span className="shrink-0 text-sidebar-fg">{icon}</span>}
      <span>{label}</span>
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
      <div className="mb-6 px-4">
        <div className="text-lg font-bold text-sidebar-fg">מערכת ניהול</div>
        <div className="text-xs text-sidebar-fg">Admin Panel</div>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-2">
        {navSections.map((section, idx) => (
          <div key={idx}>
            <div className="mb-2 px-2 text-xs font-semibold text-sidebar-fg/40 uppercase tracking-wider">
              {section.title}
            </div>
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavLink key={item.href} {...item} onClick={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Logout Button */}
      <div className="border-t border-sidebar-border pt-4 px-2">
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="
            flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm
            text-danger hover:bg-danger/20 hover:text-danger/80 transition-all
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          <LogOut className="h-4 w-4" />
          <span>{isLoggingOut ? "מתנתק..." : "התנתקות"}</span>
        </button>
      </div>
    </div>
  )
}

export function DashboardLayoutResizable({ children }: DashboardLayoutResizableProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(320) // 80 * 4 = 320px
  const [isResizing, setIsResizing] = useState(false)

  const MIN_WIDTH = 240 // 60 * 4 = 240px
  const MAX_WIDTH = 480 // 120 * 4 = 480px

  const startResizing = useCallback(() => {
    setIsResizing(true)
  }, [])

  const stopResizing = useCallback(() => {
    setIsResizing(false)
  }, [])

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing) {
        // Calculate from left edge of viewport (RTL layout)
        const newWidth = e.clientX
        if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
          setSidebarWidth(newWidth)
        }
      }
    },
    [isResizing]
  )

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize)
      window.addEventListener("mouseup", stopResizing)
      return () => {
        window.removeEventListener("mousemove", resize)
        window.removeEventListener("mouseup", stopResizing)
      }
    }
  }, [isResizing, resize, stopResizing])

  return (
    <div className="flex min-h-screen bg-bg text-fg" dir="rtl">
      {/* Main Content Area - LEFT SIDE */}
      <main
        className="flex-1 transition-all duration-150 hidden lg:block"
        style={{ marginLeft: `${sidebarWidth}px` }}
      >
        {/* Content Container - Centered with Max Width */}
        <div className="flex justify-center w-full">
          <div className="w-full max-w-[1440px] px-[50px] pt-[50px] pb-[50px]">
            {children}
          </div>
        </div>
      </main>

      {/* Mobile Main Content */}
      <main className="flex-1 lg:hidden">
        {/* Mobile Header with Menu Button */}
        <div className="sticky top-0 z-40 bg-bg/95 backdrop-blur border-b border-border">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="font-semibold text-lg">ניהול</span>
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-md hover:bg-muted transition"
              aria-label="פתח תפריט"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Content Container */}
        <div className="flex justify-center w-full">
          <div className="w-full max-w-[1440px] px-[50px] pt-[50px] pb-[50px]">
            {children}
          </div>
        </div>
      </main>

      {/* Desktop Sidebar - RIGHT SIDE (Resizable, Fixed Position) */}
      <aside
        className="hidden lg:block fixed left-0 top-0 h-full bg-sidebar border-l border-sidebar-border"
        style={{ width: `${sidebarWidth}px` }}
      >
        {/* Resize Handle */}
        <div
          className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-primary group z-10"
          onMouseDown={startResizing}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 bg-muted group-hover:bg-primary rounded p-1 transition">
            <GripVertical className="h-4 w-4 text-muted-fg group-hover:text-primary-fg" />
          </div>
        </div>

        {/* Sidebar Content */}
        <div className="p-6 h-full">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile Sidebar - Drawer from RIGHT */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-80 bg-sidebar border-l border-sidebar-border
          transform transition-transform duration-300 ease-in-out lg:hidden
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Mobile Header */}
        <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
          <span className="font-semibold text-lg">תפריט</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-md hover:bg-sidebar-hover transition"
            aria-label="סגור תפריט"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Sidebar Content */}
        <div className="p-6 h-[calc(100%-73px)]">
          <SidebarContent onNavigate={() => setSidebarOpen(false)} />
        </div>
      </aside>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-overlay z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}

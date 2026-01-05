"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X, Home, FileText, Users, LogOut, BarChart, ChevronDown } from "lucide-react"
import { logoutAction } from "@/app/dashboard/actions"

interface DashboardLayoutProps {
  children: React.ReactNode
}

type NavItem = {
  href?: string
  label: string
  icon: React.ReactNode
  subItems?: { href: string; label: string }[]
}

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "דשבורד",
    icon: <Home className="h-5 w-5" />,
  },
  {
    href: "/dashboard/reports",
    label: "דוחות",
    icon: <BarChart className="h-5 w-5" />,
  },
  {
    label: "לקוחות",
    icon: <Users className="h-5 w-5" />,
    subItems: [
      { href: "/dashboard/customers/new", label: "לקוח חדש" },
      { href: "/dashboard/customers", label: "הלקוחות שלי" },
    ],
  },
  {
    label: "מסמכים",
    icon: <FileText className="h-5 w-5" />,
    subItems: [
      { href: "/dashboard/documents/new", label: "יצירת מסמך חדש" },
      { href: "/dashboard/documents/receipt", label: "קבלה חדשה" },
      { href: "/dashboard/documents/receipts", label: "כל הקבלות" },
      { href: "/dashboard/documents", label: "כל המסמכים" },
    ],
  },
]

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const pathname = usePathname()
  const [isExpanded, setIsExpanded] = useState(false)
  const isActive = item.href && (pathname === item.href || pathname.startsWith(item.href + "/"))
  
  // Check if any subitem is active
  const hasActiveSubItem = item.subItems?.some(
    subItem => pathname === subItem.href || pathname.startsWith(subItem.href + "/")
  )

  if (item.subItems) {
    return (
      <div className="group relative">
        {/* Main Item */}
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all cursor-pointer ${
            hasActiveSubItem
              ? "bg-sidebar-active text-sidebar-active-fg font-medium"
              : "text-sidebar-fg/70 hover:text-sidebar-fg hover:bg-sidebar-hover"
          }`}
        >
          <span className="shrink-0">{item.icon}</span>
          <span className="flex-1">{item.label}</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </div>

        {/* Flyout Menu - Opens to the LEFT of sidebar (into content area) for RTL */}
        <div className="hidden group-hover:block absolute left-full top-0 ml-2 w-56 bg-sidebar backdrop-blur rounded-lg shadow-xl border border-sidebar-border py-2 z-50">
          {item.subItems.map((subItem) => {
            const isSubActive = pathname === subItem.href || pathname.startsWith(subItem.href + "/")
            return (
              <Link
                key={subItem.href}
                href={subItem.href}
                onClick={onClick}
                className={`block px-4 py-2 text-sm transition-colors ${
                  isSubActive
                    ? "bg-sidebar-active text-sidebar-active-fg font-medium"
                    : "text-sidebar-fg/70 hover:bg-sidebar-hover hover:text-sidebar-fg"
                }`}
              >
                {subItem.label}
              </Link>
            )
          })}
        </div>

        {/* Expanded SubItems - Show below main item with proper indent */}
        {isExpanded && (
          <div className="mt-1 space-y-1 overflow-hidden">
            {item.subItems.map((subItem) => {
              const isSubActive = pathname === subItem.href || pathname.startsWith(subItem.href + "/")
              return (
                <Link
                  key={subItem.href}
                  href={subItem.href}
                  onClick={onClick}
                  className={`block pr-12 pl-4 py-2 text-sm rounded-lg transition-all duration-150 ${
                    isSubActive
                      ? "bg-sidebar-active text-sidebar-active-fg font-medium"
                      : "text-sidebar-fg/60 hover:text-sidebar-fg hover:bg-sidebar-hover"
                  }`}
                >
                  {subItem.label}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <Link
      href={item.href!}
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all ${
        isActive
          ? "bg-sidebar-active text-sidebar-active-fg font-medium"
          : "text-sidebar-fg/70 hover:bg-sidebar-hover hover:text-sidebar-fg"
      }`}
    >
      <span className="shrink-0">{item.icon}</span>
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
        <div className="text-xs text-sidebar-fg/50 mt-1">Dashboard</div>
      </div>

      {/* Navigation */}
      <nav aria-label="ניווט ראשי" className="flex-1 space-y-2 px-3 overflow-y-auto">
        {navItems.map((item, idx) => (
          <NavLink key={idx} item={item} onClick={onNavigate} />
        ))}
      </nav>

      {/* Logout Button - Sticky at bottom */}
      <div className="sticky bottom-0 border-t border-sidebar-border bg-sidebar/95 backdrop-blur pt-4 pb-6 px-3">
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          aria-label={isLoggingOut ? "מתנתק..." : "התנתק מהמערכת"}
          className="flex w-full items-center gap-3 px-4 py-3 rounded-lg text-sm text-danger hover:bg-danger/20 hover:text-danger/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LogOut className="h-5 w-5" />
          <span>{isLoggingOut ? "מתנתק..." : "התנתקות"}</span>
        </button>
      </div>
    </div>
  )
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-bg text-fg" dir="rtl">
      {/* Main Content Area */}
      <div className="flex-1 mr-0 lg:mr-[250px]">
        {/* Mobile Header */}
        <div className="sticky top-0 z-40 lg:hidden bg-bg/95 backdrop-blur border-b border-border">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="font-semibold text-lg">ניהול</span>
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-md hover:bg-muted transition"
              aria-label="פתח תפריט"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* CTA Header - Sticky */}
        <div className="sticky top-0 lg:top-0 z-30 bg-bg/80 backdrop-blur border-b border-border px-6 py-4">
          <Link
            href="/dashboard/documents/new"
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-primary-fg px-6 py-3 rounded-lg font-medium shadow-lg transition-colors"
          >
            יצירת מסמך חדש
          </Link>
        </div>

        {/* Content */}
        <main className="w-full max-w-[1440px] mx-auto px-6 lg:px-12 pt-8 pb-12">
          {children}
        </main>
      </div>

      {/* Desktop Sidebar - Fixed Right */}
      <aside className="hidden lg:block fixed right-0 top-0 h-screen w-[250px] max-w-[250px] bg-sidebar/50 backdrop-blur border-l border-sidebar-border overflow-hidden">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <aside
        className={`fixed top-0 right-0 z-50 h-full w-[250px] max-w-[250px] bg-sidebar border-l border-sidebar-border transform transition-transform duration-300 lg:hidden ${
          sidebarOpen ? "translate-x-0" : "translate-x-full"
        }`}
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
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-overlay z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}

"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X, Home, FileText, Users, Settings, LogOut } from "lucide-react"
import { logoutAction } from "@/app/dashboard/actions"

interface DashboardLayoutProps {
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
            ? "bg-white/10 text-white font-medium"
            : "text-white/70 hover:bg-white/5 hover:text-white"
        }
      `}
    >
      {icon && <span className="shrink-0">{icon}</span>}
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
        <div className="text-lg font-bold text-white">מערכת ניהול</div>
        <div className="text-xs text-white/50">Admin Panel</div>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-2">
        {navSections.map((section, idx) => (
          <div key={idx}>
            <div className="mb-2 px-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
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
      <div className="border-t border-slate-700 pt-4 px-2">
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="
            flex w-full items-center gap-3 rounded-ui px-4 py-2.5 text-sm
            text-red-200 hover:bg-red-900 hover:text-red-100 transition-all
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

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-slate-950 text-white" dir="rtl">
      {/* Main Content Area - LEFT SIDE */}
      <main className="flex-1 lg:mr-80">
        {/* Mobile Header with Menu Button */}
        <div className="sticky top-0 z-40 lg:hidden bg-slate-950/95 backdrop-blur border-b border-white/10">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="font-semibold text-lg">ניהול</span>
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-md hover:bg-white/10 transition"
              aria-label="פתח תפריט"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Content Container - Centered with Max Width */}
        <div className="flex justify-center w-full">
          <div className="w-full max-w-[1440px] px-[50px] pt-[50px] pb-[50px]">
            {children}
          </div>
        </div>
      </main>

      {/* Desktop Sidebar - RIGHT SIDE (Fixed) */}
      <aside className="hidden lg:block fixed right-0 top-0 h-full w-80 bg-slate-900/50 backdrop-blur border-r border-white/10 p-6">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar - Drawer from RIGHT */}
      <aside
        className={`
          fixed top-0 right-0 z-50 h-full w-80 bg-slate-900 border-r border-white/10
          transform transition-transform duration-300 ease-in-out lg:hidden
          ${sidebarOpen ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* Mobile Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <span className="font-semibold text-lg">תפריט</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-md hover:bg-white/10 transition"
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
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}

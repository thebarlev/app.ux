"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  Menu, 
  X, 
  LayoutDashboard, 
  Building2, 
  FileText, 
  Settings, 
  Users,
  LogOut,
  Shield,
  Search,
  BarChart3,
  Play,
  CheckSquare,
  CreditCard,
  List
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

interface AdminDashboardLayoutProps {
  children: React.ReactNode
  adminName: string
}

type NavItem = {
  href: string
  label: string
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  // Auditor Admin section
  { href: "/admin/auditor", label: "Auditor Dashboard", icon: <BarChart3 className="h-4 w-4" /> },
  { href: "/admin/auditor/scans", label: "Scans", icon: <List className="h-4 w-4" /> },
  { href: "/admin/auditor/scan", label: "Run Scan", icon: <Play className="h-4 w-4" /> },
  { href: "/admin/auditor/tasks", label: "Tasks", icon: <CheckSquare className="h-4 w-4" /> },
  { href: "/admin/auditor/clients", label: "Clients", icon: <Users className="h-4 w-4" /> },
  { href: "/admin/auditor/billing", label: "Billing Debug", icon: <CreditCard className="h-4 w-4" /> },
  // Other admin sections
  { href: "/admin/templates", label: "Templates", icon: <FileText className="h-4 w-4" /> },
  { href: "/admin/texts", label: "System Texts", icon: <FileText className="h-4 w-4" /> },
  { href: "/admin/document-variables", label: "Document Variables", icon: <Settings className="h-4 w-4" /> },
  { href: "/admin/receipt-style", label: "Receipt Style", icon: <Settings className="h-4 w-4" /> },
]

function NavLink({ href, label, icon, onClick }: NavItem & { onClick?: () => void }) {
  const pathname = usePathname()
  const exactMatch = href === "/admin" || href === "/admin/auditor"
  const isActive = pathname === href || (!exactMatch && pathname.startsWith(href))

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all ${
        isActive
          ? "bg-sidebar-active text-sidebar-active-fg font-medium"
          : "text-sidebar-fg hover:bg-sidebar-hover"
      }`}
    >
      {icon && <span className="shrink-0 text-sidebar-fg">{icon}</span>}
      <span>{label}</span>
    </Link>
  )
}

function SidebarContent({ onNavigate, adminName }: { onNavigate?: () => void; adminName: string }) {
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    setIsLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/admin/login")
    router.refresh()
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-8 px-4 pb-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-sidebar-active">
            <Shield className="h-6 w-6 text-sidebar-active-fg" />
          </div>
          <div>
            <div className="text-lg font-bold text-sidebar-fg">System Admin</div>
            <div className="text-xs text-sidebar-fg">Control Panel</div>
          </div>
        </div>
        <div className="mt-4 px-4 py-3 bg-card rounded-lg border border-border">
          <div className="text-xs font-medium text-muted-fg mb-0.5">Logged in as</div>
          <div className="text-sm font-semibold text-fg truncate">{adminName}</div>
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="ניווט ראשי של מנהל המערכת" className="flex-1 space-y-2 px-3">
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} onClick={onNavigate} />
        ))}
      </nav>

      {/* Logout Button */}
      <div className="border-t border-sidebar-border pt-4 px-3 mt-4">
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          aria-label={isLoggingOut ? "מתנתק מהמערכת" : "התנתק מהמערכת"}
          className="
            flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium
            text-danger bg-danger/10 hover:bg-danger/20 hover:text-danger/80
            transition-all disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          <LogOut className="h-4 w-4" />
          <span>{isLoggingOut ? "Logging out..." : "Logout"}</span>
        </button>
      </div>
    </div>
  )
}

export function AdminDashboardLayout({ children, adminName }: AdminDashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-bg text-fg">
      {/* Main Content Area - RIGHT SIDE (LTR layout for admin) */}
      <div className="flex-1 lg:mr-80">
        {/* Mobile Header with Menu Button */}
        <div className="sticky top-0 z-40 lg:hidden bg-bg/90 backdrop-blur-xl border-b border-border">
          <div className="flex items-center justify-between px-4 py-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-active">
                <Shield className="h-5 w-5 text-sidebar-active-fg" />
              </div>
              <span className="font-bold text-fg">System Admin</span>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="פתח תפריט ניווט"
              aria-expanded={sidebarOpen}
              aria-controls="mobile-sidebar"
            >
              <Menu className="h-6 w-6 text-muted-fg" />
            </button>
          </div>
        </div>

        {/* Content Container - Centered with Max Width */}
        <div className="flex justify-center w-full">
          <main id="main-content" className="w-full max-w-[1440px] px-[50px] pt-[50px] pb-[50px]">
            {children}
          </main>
        </div>
      </div>

      {/* Desktop Sidebar - LEFT SIDE (Fixed) */}
      <aside className="hidden lg:block fixed right-0 top-0 h-full w-80 bg-sidebar border-l border-sidebar-border p-6">
        <SidebarContent adminName={adminName} />
      </aside>

      {/* Mobile Sidebar - Drawer from LEFT */}
      <aside
        id="mobile-sidebar"
        aria-label="ניווט במכשיר נייד"
        className={`
          fixed top-0 right-0 z-50 h-full w-80 bg-sidebar backdrop-blur-2xl border-l border-sidebar-border
          transform transition-transform duration-300 ease-in-out lg:hidden
          ${sidebarOpen ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* Mobile Header */}
        <div className="flex items-center justify-between p-4 border-b border-sidebar-border bg-card">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-active">
              <Shield className="h-5 w-5 text-sidebar-active-fg" />
            </div>
            <span className="font-bold text-fg">Menu</span>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="סגור תפריט ניווט"
          >
            <X className="h-6 w-6 text-muted-fg" />
          </button>
        </div>

        {/* Sidebar Content */}
        <div className="p-6 h-[calc(100%-73px)]">
          <SidebarContent onNavigate={() => setSidebarOpen(false)} adminName={adminName} />
        </div>
      </aside>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-overlay z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSidebarOpen(false)
          }}
          role="button"
          tabIndex={0}
          aria-label="סגור תפריט"
        />
      )}
    </div>
  )
}

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
  Shield
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
  { href: "/admin/templates", label: "Templates", icon: <FileText className="h-4 w-4" /> },
  { href: "/admin/texts", label: "System Texts", icon: <FileText className="h-4 w-4" /> },
  { href: "/admin/document-variables", label: "Document Variables", icon: <Settings className="h-4 w-4" /> },
  { href: "/admin/receipt-style", label: "Receipt Style", icon: <Settings className="h-4 w-4" /> },
]

function NavLink({ href, label, icon, onClick }: NavItem & { onClick?: () => void }) {
  const pathname = usePathname()
  const isActive = pathname === href || (href !== "/admin" && pathname.startsWith(href))

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`
        flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all
        ${
          isActive
            ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30"
            : "text-slate-600 hover:bg-blue-50 hover:text-blue-600"
        }
      `}
    >
      {icon && <span className="shrink-0">{icon}</span>}
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
      <div className="mb-8 px-4 pb-6 border-b border-blue-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-800">System Admin</div>
            <div className="text-xs text-slate-500">Control Panel</div>
          </div>
        </div>
        <div className="mt-4 px-4 py-3 bg-gradient-to-br from-blue-50 to-sky-50 rounded-xl border border-blue-100 shadow-sm">
          <div className="text-xs font-medium text-blue-600 mb-0.5">Logged in as</div>
          <div className="text-sm font-semibold text-slate-700 truncate">{adminName}</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-2 px-3">
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} onClick={onNavigate} />
        ))}
      </nav>

      {/* Logout Button */}
      <div className="border-t border-blue-100 pt-4 px-3 mt-4">
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="
            flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium
            text-red-600 bg-red-50 hover:bg-red-100 hover:shadow-md
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
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-sky-50/50">
      {/* Main Content Area - RIGHT SIDE (LTR layout for admin) */}
      <main className="flex-1 lg:mr-80">
        {/* Mobile Header with Menu Button */}
        <div className="sticky top-0 z-40 lg:hidden bg-white/90 backdrop-blur-xl border-b border-blue-100 shadow-sm">
          <div className="flex items-center justify-between px-4 py-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-slate-800">System Admin</span>
            </div>
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-xl hover:bg-blue-50 transition-colors"
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6 text-slate-600" />
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

      {/* Desktop Sidebar - LEFT SIDE (Fixed) */}
      <aside className="hidden lg:block fixed right-0 top-0 h-full w-80 bg-white/80 backdrop-blur-2xl border-l border-blue-100 shadow-2xl shadow-blue-500/5 p-6">
        <SidebarContent adminName={adminName} />
      </aside>

      {/* Mobile Sidebar - Drawer from LEFT */}
      <aside
        className={`
          fixed top-0 right-0 z-50 h-full w-80 bg-white/95 backdrop-blur-2xl border-l border-blue-100 shadow-2xl
          transform transition-transform duration-300 ease-in-out lg:hidden
          ${sidebarOpen ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* Mobile Header */}
        <div className="flex items-center justify-between p-4 border-b border-blue-100 bg-gradient-to-r from-blue-50 to-sky-50">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-slate-800">Menu</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-xl hover:bg-white/80 transition-colors"
            aria-label="Close menu"
          >
            <X className="h-6 w-6 text-slate-600" />
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
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}

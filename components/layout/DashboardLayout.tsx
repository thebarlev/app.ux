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
      { href: "/dashboard/documents", label: "כל המסמכים" },
      { href: "/dashboard/documents/receipts", label: "קבלות" },
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
  const [isExpanded, setIsExpanded] = useState(false)
  const isActive = isItemActive(item, pathname)
  
  // Check if any subitem is active
  const hasActiveSubItem = hasActiveChild(item, pathname)

  if (item.subItems) {
    return (
      <div className="group relative">
        {/* Main Item */}
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
            hasActiveSubItem
              ? "bg-sidebar-active text-sidebar-active-fg font-medium"
              : "text-sidebar-fg hover:bg-sidebar-hover"
          }`}
          style={{ fontSize: '18px' }}
        >
          <span className="shrink-0 text-sidebar-fg">{item.icon}</span>
          <span className="flex-1">{item.label}</span>
          <ChevronDown
            className={`h-4 w-4 text-sidebar-fg transition-transform duration-200 ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </div>

        {/* Flyout Menu - Opens to the LEFT of sidebar (into content area) for RTL */}
        <div className="hidden group-hover:block absolute left-full top-0 ml-2 w-56 bg-sidebar backdrop-blur rounded-lg shadow-xl border border-sidebar-border py-2 z-50">
          {item.subItems.map((subItem) => {
            const isSubActive = isSubItemActive(subItem.href, pathname)
            return (
              <Link
                key={subItem.href}
                href={subItem.href}
                onClick={onClick}
                className={`block px-4 py-2 transition-colors ${
                  isSubActive
                    ? "bg-sidebar-active text-sidebar-active-fg font-medium"
                    : "text-sidebar-fg hover:bg-sidebar-hover"
                }`}
                style={{ fontSize: '18px' }}
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
              const isSubActive = isSubItemActive(subItem.href, pathname)
              return (
                <Link
                  key={subItem.href}
                  href={subItem.href}
                  onClick={onClick}
                  className={`block pr-12 pl-4 py-2 rounded-lg transition-all duration-150 ${
                    isSubActive
                      ? "bg-sidebar-active text-sidebar-active-fg font-medium"
                      : "text-sidebar-fg hover:bg-sidebar-hover"
                  }`}
                  style={{ fontSize: '18px' }}
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
      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
        isActive
          ? "bg-sidebar-active text-sidebar-active-fg font-medium"
          : "text-sidebar-fg hover:bg-sidebar-hover"
      }`}
      style={{ fontSize: '18px' }}
    >
      <span className="shrink-0 text-sidebar-fg">{item.icon}</span>
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
      <nav aria-label="ניווט ראשי" className="flex-1 space-y-2 px-3 overflow-y-auto">
        {navItems.map((item, idx) => (
          <NavLink key={idx} item={item} onClick={onNavigate} />
        ))}
      </nav>

      {/* New Document Button - above logout, 100px margin */}
      <div style={{ marginBottom: '100px', marginTop: '24px', padding: '0 12px', position: 'relative' }}>
        <button
          type="button"
          id="new-doc-btn"
          className="flex items-center justify-center gap-2 w-full rounded-lg transition-all font-bold"
          style={{
            background: '#F39600',
            color: '#19183B',
            fontSize: '18px',
            padding: '14px 0',
            boxShadow: '0 0 13px 0 rgba(0,0,0,0.10)',
            border: 'none',
            marginBottom: 0,
            cursor: 'pointer',
            position: 'relative',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#FFC669')}
          onMouseLeave={e => (e.currentTarget.style.background = '#F39600')}
          onClick={() => {
            const menu = document.getElementById('new-doc-menu');
            if (menu) {
              if (menu.style.display === 'block') {
                menu.style.display = 'none';
              } else {
                // Get button position
                const btn = document.getElementById('new-doc-btn');
                if (btn) {
                  const rect = btn.getBoundingClientRect();
                  menu.style.display = 'block';
                  menu.style.position = 'fixed';
                  menu.style.right = '250px'; // sidebar width
                  menu.style.top = `${rect.top}px`;
                }
              }
            }
          }}
        >
          <span style={{ fontSize: '22px', fontWeight: 'bold', marginRight: '8px', color: '#19183B' }}>+</span>
          <span style={{ color: '#19183B' }}>מסמך חדש</span>
        </button>
        <div
          id="new-doc-menu"
          style={{
            display: 'none',
            background: '#FFF',
            borderRadius: '12px',
            boxShadow: '0 0 13px 0 rgba(0,0,0,0.10)',
            minWidth: '160px',
            zIndex: 100,
          }}
        >
            <Link
              href="/dashboard/documents/receipt"
              style={{
                display: 'block',
                padding: '12px 24px',
                color: '#19183B',
                fontSize: '18px',
                fontWeight: 500,
                textAlign: 'right',
                cursor: 'pointer',
                borderRadius: '12px',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#EDF1F5')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              קבלה
            </Link>
        </div>
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

  return (
    <div className="flex min-h-screen text-fg" dir="rtl" style={{ backgroundColor: '#EDF1F5' }}>
      {/* Main Content Area */}
      <div className="flex-1 mr-0 lg:mr-[250px]" style={{ backgroundColor: '#EDF1F5' }}>
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

        {/* Content */}
        <main className="w-full max-w-[1440px] mx-auto px-6 lg:px-12 pt-8 pb-12">
          {children}
        </main>
      </div>

      {/* Desktop Sidebar - Fixed Right */}
      <aside className="hidden lg:block fixed right-0 top-0 h-screen w-[250px] max-w-[250px] bg-sidebar border-l border-sidebar-border overflow-hidden">
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

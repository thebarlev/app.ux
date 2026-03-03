"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Menu, X, User, MessageCircle, TrendingUp, FileSearch, Bell, Power } from "lucide-react"
import { logoutAction } from "@/app/dashboard/actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollLockFix } from "@/components/ScrollLockFix"

const WHATSAPP_PHONE = process.env.NEXT_PUBLIC_AUDITOR_WHATSAPP_PHONE || "972545215193"
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_PHONE.replace(/^0/, "")}`

export function AuditorDashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  const handleLogout = async () => {
    await logoutAction()
  }

  const navClass = (href: string) =>
    pathname === href || pathname.startsWith(href + "/")
      ? "bg-white/20 font-semibold"
      : "hover:bg-white/10"

  return (
    <>
      <ScrollLockFix />
      <div className="flex min-h-screen text-fg overflow-x-hidden bg-bg" dir="rtl">
        <div className="relative z-0 flex-1 min-w-0 pr-0 md:pr-[200px] bg-bg">
          {/* Mobile Header */}
          <div className="sticky top-0 z-[60] md:hidden bg-[#4A90B5] shadow-md w-full">
            <div className="flex items-center justify-between px-4 py-3">
              <button
                type="button"
                onClick={() => setSidebarOpen((v) => !v)}
                className="p-2 rounded-md hover:bg-white/10 transition-colors"
                aria-label={sidebarOpen ? "סגור תפריט" : "פתח תפריט"}
              >
                <div className="relative w-7 h-7">
                  <Menu
                    className={`absolute inset-0 h-7 w-7 text-white transition-all duration-300 ${
                      sidebarOpen ? "opacity-0 scale-0" : "opacity-100 scale-100"
                    }`}
                  />
                  <X
                    className={`absolute inset-0 h-7 w-7 text-white transition-all duration-300 ${
                      sidebarOpen ? "opacity-100 scale-100" : "opacity-0 scale-0"
                    }`}
                  />
                </div>
              </button>
              <Link href="/auditor" className="flex items-center">
                <Image src="/brand/vow_black.svg" alt="VOW" width={80} height={32} priority />
              </Link>
            </div>
          </div>

          <main className="w-full max-w-[1440px] mx-auto px-4 lg:px-12 pt-8 pb-12">{children}</main>
        </div>

        {/* Desktop Sidebar */}
        <aside className="hidden md:block fixed right-[15px] top-[15px] z-50 h-[calc(100%-30px)] w-[200px] max-w-[250px] bg-sidebar overflow-hidden rounded-[10px] bg-[#4A90B5]">
          <div className="flex h-full flex-col p-4">
            <Link href="/auditor" className="mb-6 block">
              <Image src="/brand/vow_black.svg" alt="VOW" width={100} height={36} priority />
            </Link>
            <nav className="flex-1 space-y-1 overflow-y-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-white transition-all ${navClass("/auditor/invoices") || navClass("/auditor/settings") ? "bg-white/20" : "hover:bg-white/10"}`}
                  >
                    <User className="h-5 w-5 shrink-0" />
                    <span className="text-right flex-1">החשבון שלי</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[200px]">
                  <DropdownMenuItem asChild>
                    <Link href="/auditor/invoices">צפייה והורדת חשבוניות</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/auditor/settings">עדכון פרטים אישיים</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10 transition-all"
              >
                <MessageCircle className="h-5 w-5 shrink-0" />
                <span className="text-right flex-1">יצירת קשר</span>
              </a>
              <Link
                href="/auditor"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-white transition-all ${navClass("/auditor")}`}
              >
                <TrendingUp className="h-5 w-5 shrink-0" />
                <span className="text-right flex-1">שדרוג מנוי</span>
              </Link>
              <Link
                href="/auditor/dashboard"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-white transition-all ${navClass("/auditor/dashboard")}`}
              >
                <FileSearch className="h-5 w-5 shrink-0" />
                <span className="text-right flex-1">סריקה אחרונה</span>
              </Link>
              <Link
                href="/auditor/dashboard"
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10 transition-all"
              >
                <Bell className="h-5 w-5 shrink-0" />
                <span className="text-right flex-1">עדכונים מ-VOW</span>
              </Link>
            </nav>
            <div className="border-t border-white/20 pt-4 mt-4">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10 transition-all"
              >
                <Power className="h-5 w-5 shrink-0" />
                <span className="text-right flex-1">התנתקות</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Mobile Sidebar */}
        {sidebarOpen && (
          <>
            <aside className="fixed top-[60px] left-0 right-0 h-[70vh] z-40 md:hidden bg-[#4A90B5] rounded-b-3xl overflow-y-auto">
              <nav className="flex flex-col p-6 pt-4 space-y-2">
                <Link
                  href="/auditor/invoices"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10"
                >
                  <User className="h-5 w-5" />
                  <span className="text-right flex-1">החשבון שלי</span>
                </Link>
                <Link
                  href="/auditor/settings"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10"
                >
                  <User className="h-5 w-5" />
                  <span className="text-right flex-1">עדכון פרטים</span>
                </Link>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10"
                  onClick={() => setSidebarOpen(false)}
                >
                  <MessageCircle className="h-5 w-5" />
                  <span className="text-right flex-1">יצירת קשר</span>
                </a>
                <Link
                  href="/auditor"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10"
                >
                  <TrendingUp className="h-5 w-5" />
                  <span className="text-right flex-1">שדרוג מנוי</span>
                </Link>
                <Link
                  href="/auditor/dashboard"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10"
                >
                  <FileSearch className="h-5 w-5" />
                  <span className="text-right flex-1">סריקה אחרונה</span>
                </Link>
                <Link
                  href="/auditor/dashboard"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10"
                >
                  <Bell className="h-5 w-5" />
                  <span className="text-right flex-1">עדכונים מ-VOW</span>
                </Link>
                <div className="border-t border-white/20 my-4" />
                <button
                  onClick={() => {
                    setSidebarOpen(false)
                    handleLogout()
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10 w-full text-right"
                >
                  <Power className="h-5 w-5" />
                  <span className="flex-1">התנתקות</span>
                </button>
              </nav>
            </aside>
            <div
              className="fixed inset-0 top-[60px] bg-black/50 z-30 md:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-hidden
            />
          </>
        )}
      </div>
    </>
  )
}

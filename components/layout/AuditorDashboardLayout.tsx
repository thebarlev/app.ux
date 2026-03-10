"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  Menu,
  X,
  User,
  Settings,
  FileText,
  CreditCard,
  MessageCircle,
  Power,
} from "lucide-react"
import { logoutAction } from "@/app/dashboard/actions"
import { ScrollLockFix } from "@/components/ScrollLockFix"

const WHATSAPP_PHONE = process.env.NEXT_PUBLIC_AUDITOR_WHATSAPP_PHONE || "972545215193"
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_PHONE.replace(/^0/, "")}`

const SIDEBAR_DEFAULT_CLASS = "w-[200px]"
const getDesktopAsideClassName = (isLtr: boolean) =>
  `hidden md:block fixed ${isLtr ? "left-[15px]" : "right-[15px]"} top-[15px] z-50 h-[calc(100%-30px)] ${SIDEBAR_DEFAULT_CLASS} max-w-[250px] ` +
  "bg-sidebar overflow-hidden rounded-[10px] transition-[width] duration-200 ease-out"

export function AuditorDashboardLayout({ children, basePath = "/auditor" }: { children: React.ReactNode; basePath?: string }) {
  const isEn = basePath.startsWith("/en")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  const handleLogout = async () => {
    await logoutAction()
  }

  const navClass = (href: string) =>
    pathname === href || pathname.startsWith(href + "/")
      ? "ui-sidebar-current bg-sidebar-active font-medium"
      : "hover:bg-sidebar-hover"

  return (
    <>
      <ScrollLockFix />
      <div className="flex min-h-screen text-fg overflow-x-hidden bg-bg" dir={basePath.startsWith("/en") ? "ltr" : "rtl"}>
        <div className={`relative z-0 flex-1 min-w-0 pr-0 ${isEn ? "md:pl-[200px]" : "md:pr-[200px]"} bg-bg`}>
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
              <Link href={basePath} className="flex items-center">
                <Image src="/brand/vow_black.svg" alt="VOW" width={80} height={32} priority />
              </Link>
            </div>
          </div>

          <main className="w-full max-w-[1440px] mx-auto px-4 lg:px-12 pt-8 pb-12">{children}</main>
        </div>

        {/* Desktop Sidebar */}
        <aside className={getDesktopAsideClassName(isEn)}>
          <div className="flex h-full flex-col p-4 ui-sidebar">
            <Link href={basePath} className="mb-6 block">
              <Image src="/brand/vow_black.svg" alt="VOW" width={100} height={36} priority />
            </Link>
            <nav className="flex-1 space-y-1 overflow-y-auto">
              <Link
                href={`${basePath}/dashboard`}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${navClass(`${basePath}/dashboard`)}`}
              >
                <FileText className="h-5 w-5 shrink-0" />
                <span className={`flex-1 ${isEn ? "text-left" : "text-right"}`}>{isEn ? "Dashboard" : "דשבורד"}</span>
              </Link>
              <Link
                href={`${basePath}/settings`}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${navClass(`${basePath}/settings`)}`}
              >
                <Settings className="h-5 w-5 shrink-0" />
                <span className={`flex-1 ${isEn ? "text-left" : "text-right"}`}>{isEn ? "Settings" : "הגדרות"}</span>
              </Link>
              <Link
                href={`${basePath}/settings#personal`}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${navClass(`${basePath}/settings`)}`}
              >
                <User className="h-5 w-5 shrink-0" />
                <span className={`flex-1 ${isEn ? "text-left" : "text-right"}`}>{isEn ? "Profile" : "פרטים אישיים"}</span>
              </Link>
              <Link
                href={`${basePath}/invoices`}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${navClass(`${basePath}/invoices`)}`}
              >
                <FileText className="h-5 w-5 shrink-0" />
                <span className={`flex-1 ${isEn ? "text-left" : "text-right"}`}>{isEn ? "Invoices" : "חשבוניות"}</span>
              </Link>
              <Link
                href={`${basePath}/subscription`}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${navClass(`${basePath}/subscription`)}`}
              >
                <CreditCard className="h-5 w-5 shrink-0" />
                <span className={`flex-1 ${isEn ? "text-left" : "text-right"}`}>{isEn ? "Subscription" : "מנוי"}</span>
              </Link>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all hover:bg-sidebar-hover"
              >
                <MessageCircle className="h-5 w-5 shrink-0" />
                <span className={`flex-1 ${isEn ? "text-left" : "text-right"}`}>{isEn ? "Contact" : "יצירת קשר"}</span>
              </a>
            </nav>
            <div className="border-t border-white/20 pt-4 mt-4">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ui-sidebar-logout hover:bg-sidebar-hover"
              >
                <Power className="h-5 w-5 shrink-0" />
                <span className={`flex-1 ${isEn ? "text-left" : "text-right"}`}>{isEn ? "Sign out" : "התנתקות"}</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Mobile Sidebar */}
        {sidebarOpen && (
          <>
            <aside className="fixed top-[60px] left-0 right-0 h-[70vh] z-40 md:hidden bg-[#4A90B5] rounded-b-3xl overflow-y-auto">
              <nav className="flex flex-col p-6 pt-4 space-y-2">
                <Link href={`${basePath}/dashboard`} onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10">
                  <FileText className="h-5 w-5" />
                  <span className={`flex-1 ${isEn ? "text-left" : "text-right"}`}>{isEn ? "Dashboard" : "דשבורד"}</span>
                </Link>
                <Link href={`${basePath}/settings`} onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10">
                  <Settings className="h-5 w-5" />
                  <span className={`flex-1 ${isEn ? "text-left" : "text-right"}`}>{isEn ? "Settings" : "הגדרות"}</span>
                </Link>
                <Link href={`${basePath}/settings`} onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10">
                  <User className="h-5 w-5" />
                  <span className={`flex-1 ${isEn ? "text-left" : "text-right"}`}>{isEn ? "Profile" : "פרטים אישיים"}</span>
                </Link>
                <Link href={`${basePath}/invoices`} onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10">
                  <FileText className="h-5 w-5" />
                  <span className={`flex-1 ${isEn ? "text-left" : "text-right"}`}>{isEn ? "Invoices" : "חשבוניות"}</span>
                </Link>
                <Link href={`${basePath}/subscription`} onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10">
                  <CreditCard className="h-5 w-5" />
                  <span className={`flex-1 ${isEn ? "text-left" : "text-right"}`}>{isEn ? "Subscription" : "מנוי"}</span>
                </Link>
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10" onClick={() => setSidebarOpen(false)}>
                  <MessageCircle className="h-5 w-5" />
                  <span className={`flex-1 ${isEn ? "text-left" : "text-right"}`}>{isEn ? "Contact" : "יצירת קשר"}</span>
                </a>
                <div className="border-t border-white/20 my-4" />
                <button onClick={() => { setSidebarOpen(false); handleLogout() }} className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10 w-full text-right">
                  <Power className="h-5 w-5" />
                  <span className={`flex-1 ${isEn ? "text-left" : "text-right"}`}>{isEn ? "Sign out" : "התנתקות"}</span>
                </button>
              </nav>
            </aside>
            <div className="fixed inset-0 top-[60px] bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
          </>
        )}
      </div>
    </>
  )
}

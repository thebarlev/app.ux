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
  ChevronDown,
  Loader2,
} from "lucide-react"
import { logoutAction } from "@/app/dashboard/actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import ConfirmDialog from "@/components/ConfirmDialog"
import { ScrollLockFix } from "@/components/ScrollLockFix"

const WHATSAPP_PHONE = process.env.NEXT_PUBLIC_AUDITOR_WHATSAPP_PHONE || "972545215193"
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_PHONE.replace(/^0/, "")}`

const SIDEBAR_DEFAULT_CLASS = "w-[200px]"
const desktopAsideClassName =
  `hidden md:block fixed right-[15px] top-[15px] z-50 h-[calc(100%-30px)] ${SIDEBAR_DEFAULT_CLASS} max-w-[250px] ` +
  "bg-sidebar overflow-hidden rounded-[10px] transition-[width] duration-200 ease-out"

export function AuditorDashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showChangePlanModal, setShowChangePlanModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [changePlanTarget, setChangePlanTarget] = useState<"basic" | "pro">("pro")
  const [isChangingPlan, setIsChangingPlan] = useState(false)
  const [isCanceling, setIsCanceling] = useState(false)
  const pathname = usePathname()

  const handleLogout = async () => {
    await logoutAction()
  }

  const handleChangePlan = async () => {
    setIsChangingPlan(true)
    try {
      const r = await fetch("/api/auditor/billing/subscription/change-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan_id: changePlanTarget }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || "שגיאה בהחלפת חבילה")
      setShowChangePlanModal(false)
    } catch (e: unknown) {
      console.error(e)
    } finally {
      setIsChangingPlan(false)
    }
  }

  const handleCancelSubscription = async () => {
    setIsCanceling(true)
    try {
      const r = await fetch("/api/auditor/billing/subscription/cancel", { method: "POST" })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || "שגיאה בביטול")
      setShowCancelModal(false)
    } catch (e: unknown) {
      console.error(e)
    } finally {
      setIsCanceling(false)
    }
  }

  const navClass = (href: string) =>
    pathname === href || pathname.startsWith(href + "/")
      ? "ui-sidebar-current bg-sidebar-active font-medium"
      : "hover:bg-sidebar-hover"

  return (
    <>
      <ScrollLockFix />
      <div className="flex min-h-screen text-fg overflow-x-hidden bg-bg" dir="rtl">
        <div className="relative z-0 flex-1 min-w-0 pr-0 md:pr-[200px] bg-bg">
          {/* Mobile Header - same as invoice dashboard */}
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

        {/* Desktop Sidebar - same styling as invoice dashboard (bg-sidebar) */}
        <aside className={desktopAsideClassName}>
          <div className="flex h-full flex-col p-4 ui-sidebar">
            <Link href="/auditor" className="mb-6 block">
              <Image src="/brand/vow_black.svg" alt="VOW" width={100} height={36} priority />
            </Link>
            <nav className="flex-1 space-y-1 overflow-y-auto">
              <Link
                href="/auditor/dashboard"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${navClass("/auditor/dashboard")}`}
              >
                <FileText className="h-5 w-5 shrink-0" />
                <span className="text-right flex-1">דשבורד</span>
              </Link>
              <Link
                href="/auditor/settings"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${navClass("/auditor/settings")}`}
              >
                <Settings className="h-5 w-5 shrink-0" />
                <span className="text-right flex-1">הגדרות</span>
              </Link>
              <Link
                href="/auditor/settings#personal"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${navClass("/auditor/settings")}`}
              >
                <User className="h-5 w-5 shrink-0" />
                <span className="text-right flex-1">פרטים אישיים</span>
              </Link>
              <Link
                href="/auditor/invoices"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${navClass("/auditor/invoices")}`}
              >
                <FileText className="h-5 w-5 shrink-0" />
                <span className="text-right flex-1">חשבוניות</span>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${navClass("/auditor")}`}
                  >
                    <CreditCard className="h-5 w-5 shrink-0" />
                    <span className="text-right flex-1">מנוי</span>
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[200px]">
                  <DropdownMenuItem onClick={() => setShowChangePlanModal(true)}>
                    שינוי חבילה
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowCancelModal(true)} className="text-destructive">
                    ביטול מנוי
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all hover:bg-sidebar-hover"
              >
                <MessageCircle className="h-5 w-5 shrink-0" />
                <span className="text-right flex-1">יצירת קשר</span>
              </a>
            </nav>
            <div className="border-t border-white/20 pt-4 mt-4">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ui-sidebar-logout hover:bg-sidebar-hover"
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
                <Link href="/auditor/dashboard" onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10">
                  <FileText className="h-5 w-5" />
                  <span className="text-right flex-1">דשבורד</span>
                </Link>
                <Link href="/auditor/settings" onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10">
                  <Settings className="h-5 w-5" />
                  <span className="text-right flex-1">הגדרות</span>
                </Link>
                <Link href="/auditor/settings" onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10">
                  <User className="h-5 w-5" />
                  <span className="text-right flex-1">פרטים אישיים</span>
                </Link>
                <Link href="/auditor/invoices" onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10">
                  <FileText className="h-5 w-5" />
                  <span className="text-right flex-1">חשבוניות</span>
                </Link>
                <button onClick={() => { setSidebarOpen(false); setShowChangePlanModal(true) }} className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10 w-full text-right">
                  <CreditCard className="h-5 w-5" />
                  <span className="flex-1">שינוי חבילה</span>
                </button>
                <button onClick={() => { setSidebarOpen(false); setShowCancelModal(true) }} className="flex items-center gap-3 px-4 py-3 rounded-lg text-destructive hover:bg-white/10 w-full text-right">
                  <CreditCard className="h-5 w-5" />
                  <span className="flex-1">ביטול מנוי</span>
                </button>
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10" onClick={() => setSidebarOpen(false)}>
                  <MessageCircle className="h-5 w-5" />
                  <span className="text-right flex-1">יצירת קשר</span>
                </a>
                <div className="border-t border-white/20 my-4" />
                <button onClick={() => { setSidebarOpen(false); handleLogout() }} className="flex items-center gap-3 px-4 py-3 rounded-lg text-white hover:bg-white/10 w-full text-right">
                  <Power className="h-5 w-5" />
                  <span className="flex-1">התנתקות</span>
                </button>
              </nav>
            </aside>
            <div className="fixed inset-0 top-[60px] bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
          </>
        )}
      </div>

      {/* Change plan modal */}
      <Dialog open={showChangePlanModal} onOpenChange={setShowChangePlanModal}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>שינוי חבילה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">בחרו חבילה חדשה. השינוי ייכנס לתוקף בתחילת תקופת החיוב הבאה.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setChangePlanTarget("basic")}
                className={`flex-1 rounded-ui border p-4 text-right transition ${
                  changePlanTarget === "basic" ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <div className="font-semibold">בסיסי</div>
                <div className="text-sm text-muted-foreground">97 ₪/חודש</div>
              </button>
              <button
                type="button"
                onClick={() => setChangePlanTarget("pro")}
                className={`flex-1 rounded-ui border p-4 text-right transition ${
                  changePlanTarget === "pro" ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <div className="font-semibold">מקצועי</div>
                <div className="text-sm text-muted-foreground">497 ₪/חודש</div>
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowChangePlanModal(false)}>ביטול</Button>
              <Button onClick={handleChangePlan} disabled={isChangingPlan}>
                {isChangingPlan ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    מעדכן…
                  </>
                ) : (
                  "אישור"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showCancelModal}
        onOpenChange={setShowCancelModal}
        title="ביטול מנוי"
        message="המנוי יסתיים בסוף תקופת החיוב הנוכחית. לא יגבה חיוב נוסף."
        confirmText="אשר ביטול"
        cancelText="חזור"
        destructive
        onConfirm={handleCancelSubscription}
      />
    </>
  )
}

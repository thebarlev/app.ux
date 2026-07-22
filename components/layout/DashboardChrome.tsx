"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { logoutAction } from "@/app/dashboard/actions"

/**
 * DashboardChrome — refreshed shared app shell (sidebar + mobile bottom bar).
 *
 * Design source of truth: design-mockups/dashboard-v5.html.
 * - Desktop (>=901px): floating right sidebar (gradient), accordion sub-menus,
 *   green "+" fab (new document), settings + logout at the bottom.
 * - Mobile (<900px): app-style bottom bar + bottom-sheets (backdrop, slide, safe-area).
 * - RTL: content margin is on the RIGHT (margin-inline-start) so it never sits under
 *   the sidebar (the overlap bug).
 *
 * Navigation items, sub-items and document types are the REAL app routes — not the
 * mockup placeholders. All chrome classes are prefixed `dcx-` to avoid collisions.
 */

type SubItem = { href: string; label: string }
type NavItem = {
  key: string
  href?: string
  label: string
  icon: React.ReactNode
  subItems?: SubItem[]
}

// ── Icons (from the mockup; stroke, 24-box) ──────────────────────────────
const Ic = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></svg>
  ),
  reports: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></svg>
  ),
  customers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
  ),
  income: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
  ),
  file: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
  ),
  fileReceipt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M9 13h6" /></svg>
  ),
  fileCredit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M8 13l3 3 5-6" /></svg>
  ),
  moreChev: (
    <svg className="dcx-more-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
  ),
  receipt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
  ),
  quote: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
  ),
  proforma: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
  ),
  chevron: (
    <svg className="dcx-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 2h-6a2 2 0 0 0-2 2v6M16 17l5-5-5-5M21 12H9M12 22H6a2 2 0 0 1-2-2v-4" /></svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
  ),
  spark: (
    <svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2l2.4 6.8L21 11l-6.6 2.2L12 20l-2.4-6.8L3 11l6.6-2.2z" /></svg>
  ),
}

// ── Real navigation (routes + sub-items are the actual app ones) ─────────
const NAV: NavItem[] = [
  { key: "dashboard", href: "/dashboard", label: "דשבורד", icon: Ic.home },
  { key: "reports", href: "/dashboard/reports", label: "דוחות", icon: Ic.reports },
  {
    key: "customers",
    label: "לקוחות",
    icon: Ic.customers,
    subItems: [
      { href: "/dashboard/customers", label: "הלקוחות שלי" },
      { href: "/dashboard/customers/new", label: "לקוח חדש" },
    ],
  },
  {
    key: "income",
    label: "הכנסות",
    icon: Ic.income,
    subItems: [
      { href: "/dashboard/documents/income", label: "מסמכי הכנסות" },
      { href: "/dashboard/documents/income/drafts", label: "טיוטות מסמכי הכנסות" },
    ],
  },
  {
    key: "ongoing",
    label: "ניהול שוטף",
    icon: Ic.file,
    subItems: [
      { href: "/dashboard/documents/ongoing", label: "מסמכי ניהול שוטף" },
      { href: "/dashboard/documents/ongoing/drafts", label: "טיוטות ניהול שוטף" },
    ],
  },
]

// Real document types for the "+" (new document) menu — primary + collapsible "more".
const PRIMARY_DOCS: { href: string; label: string; icon: React.ReactNode }[] = [
  { href: "/dashboard/incomes/documents/new/invoice", label: "חשבונית מס", icon: Ic.file },
  { href: "/dashboard/incomes/documents/new/invoiceReceipt", label: "חשבונית מס / קבלה", icon: Ic.fileReceipt },
  { href: "/dashboard/incomes/documents/new/creditNote", label: "חשבונית זיכוי", icon: Ic.fileCredit },
  { href: "/dashboard/incomes/documents/new/receipt", label: "קבלה", icon: Ic.receipt },
  { href: "/business/documents/new/quote", label: "הצעת מחיר", icon: Ic.quote },
  { href: "/business/documents/new/proforma", label: "חשבון עסקה (דרישת תשלום)", icon: Ic.proforma },
]
const MORE_DOCS: { href: string; label: string }[] = [
  { href: "/business/documents/new/workOrder", label: "הזמנת עבודה" },
  { href: "/business/documents/new/deliveryNote", label: "תעודת משלוח" },
  { href: "/business/documents/new/returnNote", label: "תעודת החזרה" },
  { href: "/business/documents/new/purchaseOrder", label: "הזמנת רכש" },
  { href: "/business/documents/new/selfInvoice", label: "חשבונית עצמית" },
  { href: "/business/documents/new/selfCreditNote", label: "חשבונית זיכוי עצמית" },
]

function isActive(pathname: string, href?: string) {
  if (!href) return false
  return pathname === href
}
function anyChildActive(pathname: string, item: NavItem) {
  return !!item.subItems?.some((s) => pathname === s.href)
}

/** New-document list: 6 primary types + a collapsible "מסמכים נוספים" group. */
function DocList({ onSelect }: { onSelect: () => void }) {
  const [moreOpen, setMoreOpen] = React.useState(false)
  return (
    <>
      {PRIMARY_DOCS.map((d) => (
        <Link key={d.href} href={d.href} role="menuitem" className="dcx-doc-a" onClick={onSelect}>
          <span aria-hidden="true">{d.icon}</span>
          {d.label}
        </Link>
      ))}
      <div className={`dcx-more-wrap${moreOpen ? " open" : ""}`}>
        <button
          type="button"
          className="dcx-more-toggle"
          aria-expanded={moreOpen}
          aria-controls="dcx-more-list"
          onClick={() => setMoreOpen((v) => !v)}
        >
          מסמכים נוספים
          {Ic.moreChev}
        </button>
        <div className="dcx-more-list" id="dcx-more-list" role="group" aria-label="מסמכים נוספים">
          {MORE_DOCS.map((d) => (
            <Link key={d.href} href={d.href} role="menuitem" className="dcx-doc-a" onClick={onSelect}>
              {d.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}

export default function DashboardChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ""

  // Receipt preview is a full-screen view — render children with no chrome.
  const isReceiptPreview = pathname.startsWith("/dashboard/documents/receipt/preview")

  // Which accordion is open (single-open). Default-open the section whose child is active.
  const initialOpen =
    NAV.find((n) => n.subItems && anyChildActive(pathname, n))?.key ?? null
  const [openAcc, setOpenAcc] = React.useState<string | null>(initialOpen)
  const [fabOpen, setFabOpen] = React.useState(false)
  const [sheet, setSheet] = React.useState<null | "plus" | "more">(null)
  const fabWrapRef = React.useRef<HTMLDivElement>(null)

  // Keep active section open on navigation.
  React.useEffect(() => {
    const active = NAV.find((n) => n.subItems && anyChildActive(pathname, n))
    if (active) setOpenAcc(active.key)
    // close transient overlays on route change
    setFabOpen(false)
    setSheet(null)
  }, [pathname])

  // Fab: close on outside click.
  React.useEffect(() => {
    if (!fabOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (fabWrapRef.current && !fabWrapRef.current.contains(e.target as Node)) setFabOpen(false)
    }
    document.addEventListener("click", onDocClick)
    return () => document.removeEventListener("click", onDocClick)
  }, [fabOpen])

  // Escape closes fab + sheets.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFabOpen(false)
        setSheet(null)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const [isLoggingOut, setLoggingOut] = React.useState(false)
  const onLogout = async () => {
    if (isLoggingOut) return
    setLoggingOut(true)
    await logoutAction()
  }

  if (isReceiptPreview) {
    return <>{children}</>
  }

  return (
    <div className="dcx-root" dir="rtl">
      <style>{DCX_CSS}</style>

      {/* ===== MAIN ===== */}
      <main className="dcx-main">{children}</main>

      {/* ===== DESKTOP SIDEBAR ===== */}
      <aside className="dcx-sidebar" aria-label="ניווט ראשי">
        <div className="dcx-brand">
          <span className="dcx-spark" aria-hidden="true">{Ic.spark}</span>
          UXellent
        </div>

        <nav className="dcx-nav">
          {NAV.map((item) => {
            if (!item.subItems) {
              return (
                <div className="dcx-nav-item" key={item.key}>
                  <Link
                    href={item.href!}
                    className={`dcx-nav-link${isActive(pathname, item.href) ? " active" : ""}`}
                    aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  >
                    <span className="dcx-nav-ic" aria-hidden="true">{item.icon}</span>
                    {item.label}
                  </Link>
                </div>
              )
            }
            const open = openAcc === item.key
            return (
              <div className={`dcx-nav-item${open ? " open" : ""}`} key={item.key}>
                <button
                  type="button"
                  className={`dcx-nav-link${anyChildActive(pathname, item) ? " has-active" : ""}`}
                  aria-expanded={open}
                  aria-controls={`dcx-sub-${item.key}`}
                  onClick={() => setOpenAcc((k) => (k === item.key ? null : item.key))}
                >
                  <span className="dcx-nav-ic" aria-hidden="true">{item.icon}</span>
                  {item.label}
                  {Ic.chevron}
                </button>
                <div className="dcx-submenu" id={`dcx-sub-${item.key}`} role="region" aria-label={item.label}>
                  {item.subItems.map((s) => (
                    <Link
                      key={s.href}
                      href={s.href}
                      className={pathname === s.href ? "active" : undefined}
                      aria-current={pathname === s.href ? "page" : undefined}
                    >
                      {s.label}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        {/* + new document */}
        <div className={`dcx-fab-wrap${fabOpen ? " open" : ""}`} ref={fabWrapRef}>
          <button
            type="button"
            className="dcx-fab"
            aria-haspopup="menu"
            aria-expanded={fabOpen}
            aria-label={fabOpen ? "סגור תפריט מסמך חדש" : "פתח תפריט מסמך חדש"}
            onClick={(e) => {
              e.stopPropagation()
              setFabOpen((v) => !v)
            }}
          >
            +
          </button>
          <div className="dcx-fab-menu" role="menu">
            <div className="dcx-fab-h">מסמך חדש</div>
            <DocList key={fabOpen ? "fab-open" : "fab-closed"} onSelect={() => setFabOpen(false)} />
          </div>
        </div>

        <div className="dcx-side-bottom">
          <Link
            href="/dashboard/settings"
            className={pathname.startsWith("/dashboard/settings") ? "active" : undefined}
            aria-current={pathname.startsWith("/dashboard/settings") ? "page" : undefined}
          >
            <span aria-hidden="true">{Ic.settings}</span>הגדרות
          </Link>
          <button type="button" onClick={onLogout} disabled={isLoggingOut} aria-label="התנתקות מהמערכת">
            <span aria-hidden="true">{Ic.logout}</span>
            {isLoggingOut ? "מתנתק..." : "התנתקות"}
          </button>
        </div>
      </aside>

      {/* ===== MOBILE bottom bar ===== */}
      <nav className="dcx-mobilebar" aria-label="ניווט תחתון">
        <Link href="/dashboard" className={isActive(pathname, "/dashboard") ? "active" : undefined}>
          <span aria-hidden="true">{Ic.home}</span>דשבורד
        </Link>
        <Link href="/dashboard/reports" className={isActive(pathname, "/dashboard/reports") ? "active" : undefined}>
          <span aria-hidden="true">{Ic.reports}</span>דוחות
        </Link>
        <button type="button" className="dcx-mplus" aria-label="מסמך חדש" onClick={() => setSheet("plus")}>
          <span className="dcx-mplus-b" aria-hidden="true">+</span>
        </button>
        <Link href="/dashboard/customers" className={pathname.startsWith("/dashboard/customers") ? "active" : undefined}>
          <span aria-hidden="true">{Ic.customers}</span>לקוחות
        </Link>
        <button type="button" aria-label="תפריט" aria-haspopup="dialog" aria-expanded={sheet === "more"} onClick={() => setSheet("more")}>
          <span aria-hidden="true">{Ic.menu}</span>תפריט
        </button>
      </nav>

      {/* ===== Mobile backdrop + sheets ===== */}
      <div className={`dcx-backdrop${sheet ? " on" : ""}`} onClick={() => setSheet(null)} aria-hidden={!sheet} />

      <div className={`dcx-sheet${sheet === "plus" ? " on" : ""}`} role="dialog" aria-modal="true" aria-label="מסמך חדש" aria-hidden={sheet !== "plus"}>
        <div className="dcx-grip" />
        <div className="dcx-sheet-h">מסמך חדש</div>
        <DocList key={sheet === "plus" ? "sheet-open" : "sheet-closed"} onSelect={() => setSheet(null)} />
      </div>

      <div className={`dcx-sheet${sheet === "more" ? " on" : ""}`} role="dialog" aria-modal="true" aria-label="תפריט" aria-hidden={sheet !== "more"}>
        <div className="dcx-grip" />
        <div className="dcx-sheet-h">תפריט</div>
        <Link href="/dashboard/documents/income" onClick={() => setSheet(null)}><span aria-hidden="true">{Ic.income}</span>הכנסות</Link>
        <Link href="/dashboard/documents/ongoing" onClick={() => setSheet(null)}><span aria-hidden="true">{Ic.file}</span>ניהול שוטף</Link>
        <Link href="/dashboard/settings" onClick={() => setSheet(null)}><span aria-hidden="true">{Ic.settings}</span>הגדרות</Link>
        <button type="button" onClick={onLogout} disabled={isLoggingOut}><span aria-hidden="true">{Ic.logout}</span>{isLoggingOut ? "מתנתק..." : "התנתקות"}</button>
      </div>
    </div>
  )
}

// ── Scoped CSS (mockup values; namespaced dcx-) ──────────────────────────
const DCX_CSS = `
.dcx-root{--dcx-side:#5389BB;--dcx-green:#8BD44F;--dcx-line:#E9ECF2;--dcx-ink:#22283A;--dcx-muted:#8A90A0;--dcx-accent:#5389BB;--dcx-accent-soft:#EAF1F8;}
.dcx-sidebar{position:fixed;right:15px;top:15px;height:calc(100% - 30px);width:224px;border-radius:14px;
  background:linear-gradient(180deg,#5f97c6,#4d81b0);color:#fff;padding:20px 15px;display:flex;flex-direction:column;
  box-shadow:0 10px 30px rgba(60,110,160,.25);z-index:50}
.dcx-brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:22px;color:#fff;margin:2px 6px 20px;letter-spacing:-.02em}
.dcx-spark{width:22px;height:22px;display:inline-flex}.dcx-spark svg{width:22px;height:22px}
.dcx-nav{display:flex;flex-direction:column;gap:3px;overflow-y:auto}
.dcx-nav-item{display:flex;flex-direction:column}
.dcx-nav-link{display:flex;align-items:center;gap:12px;padding:11px 13px;border-radius:11px;color:#F0F5FA;text-decoration:none;font-weight:600;font-size:20px;cursor:pointer;transition:.15s;background:none;border:none;width:100%;text-align:right;font-family:inherit}
.dcx-nav-ic{display:inline-flex}.dcx-nav-link svg{width:20px;height:20px;flex-shrink:0}
.dcx-chev{margin-inline-start:auto;width:17px !important;height:17px !important;transition:transform .25s}
.dcx-nav-link:hover{background:rgba(255,255,255,.16)}
.dcx-nav-link.active{background:#fff;color:var(--dcx-side);font-weight:700;box-shadow:0 3px 10px rgba(0,0,0,.08)}
.dcx-nav-link.has-active{color:#fff}
.dcx-nav-item.open .dcx-chev{transform:rotate(180deg)}
.dcx-submenu{max-height:0;overflow:hidden;transition:max-height .28s ease;display:flex;flex-direction:column;gap:2px}
.dcx-nav-item.open .dcx-submenu{max-height:260px}
.dcx-submenu a{display:block;padding:9px 45px 9px 13px;color:#DCE9F4;text-decoration:none;font-size:16px;font-weight:600;border-radius:9px}
.dcx-submenu a:hover{background:rgba(255,255,255,.14);color:#fff}
.dcx-submenu a.active{background:rgba(255,255,255,.22);color:#fff}
.dcx-fab-wrap{position:relative;margin:14px 6px 6px;align-self:flex-start}
.dcx-fab{width:48px;height:48px;border-radius:13px;background:var(--dcx-green);color:#173a0b;border:none;cursor:pointer;
  display:grid;place-items:center;font-size:28px;font-weight:700;box-shadow:0 6px 16px rgba(139,212,79,.45);line-height:1;transition:.15s}
.dcx-fab:hover{transform:translateY(-1px)}
.dcx-fab-menu{position:absolute;bottom:0;right:58px;width:220px;background:#fff;border:1px solid var(--dcx-line);border-radius:14px;
  box-shadow:0 16px 40px rgba(20,24,45,.18);padding:8px;opacity:0;transform:translateY(10px) scale(.96);transform-origin:bottom right;
  pointer-events:none;transition:.2s cubic-bezier(.2,.8,.2,1);z-index:60;max-height:min(74vh,540px);overflow-y:auto}
.dcx-fab-wrap.open .dcx-fab-menu{opacity:1;transform:none;pointer-events:auto}
.dcx-fab-h{font-size:12px;color:var(--dcx-muted);font-weight:700;padding:6px 10px 4px}
.dcx-doc-a{display:flex;align-items:center;gap:10px;padding:10px;border-radius:9px;color:var(--dcx-ink);text-decoration:none;font-weight:600;font-size:14.5px}
.dcx-doc-a:hover{background:var(--dcx-accent-soft);color:var(--dcx-accent)}
.dcx-doc-a svg{width:17px;height:17px;color:var(--dcx-accent);flex-shrink:0}
.dcx-more-wrap{display:flex;flex-direction:column}
.dcx-more-toggle{display:flex;align-items:center;gap:8px;padding:10px;margin-top:4px;border:none;border-top:1px solid var(--dcx-line);
  color:#3A4155;font-weight:700;font-size:13.5px;cursor:pointer;background:none;font-family:inherit;width:100%;text-align:right}
.dcx-more-chev{margin-inline-start:auto;width:15px;height:15px;transition:transform .25s}
.dcx-more-wrap.open .dcx-more-chev{transform:rotate(90deg)}
.dcx-more-list{max-height:0;overflow:hidden;transition:max-height .28s ease;display:flex;flex-direction:column}
.dcx-more-wrap.open .dcx-more-list{max-height:360px}
.dcx-side-bottom{margin-top:auto;display:flex;flex-direction:column;gap:3px;padding-top:10px;border-top:1px solid rgba(255,255,255,.18)}
.dcx-side-bottom a,.dcx-side-bottom button{display:flex;align-items:center;gap:11px;padding:10px 13px;border-radius:11px;color:#EAF2F9;text-decoration:none;font-weight:600;font-size:16px;background:none;border:none;cursor:pointer;font-family:inherit;width:100%;text-align:right}
.dcx-side-bottom a:hover,.dcx-side-bottom button:hover{background:rgba(255,255,255,.16)}
.dcx-side-bottom a.active{background:rgba(255,255,255,.2)}
.dcx-side-bottom svg{width:18px;height:18px}
.dcx-main{margin-right:255px;min-height:100vh}
.dcx-mobilebar,.dcx-backdrop,.dcx-sheet{display:none}
@media(max-width:900px){
  .dcx-sidebar{display:none}
  .dcx-main{margin-right:0;padding-bottom:82px}
  .dcx-mobilebar{display:flex;position:fixed;bottom:0;left:0;right:0;height:66px;background:#fff;border-top:1px solid var(--dcx-line);
    box-shadow:0 -6px 20px rgba(20,24,45,.07);z-index:70;align-items:center;justify-content:space-around;padding:0 8px;padding-bottom:env(safe-area-inset-bottom)}
  .dcx-mobilebar a,.dcx-mobilebar button{background:none;border:none;font-family:inherit;cursor:pointer;color:var(--dcx-muted);text-decoration:none;
    display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11.5px;font-weight:700;flex:1}
  .dcx-mobilebar a.active{color:var(--dcx-accent)}
  .dcx-mobilebar svg{width:23px;height:23px}
  .dcx-mplus{flex:0 0 auto !important}
  .dcx-mplus-b{width:48px;height:48px;border-radius:14px;background:var(--dcx-green);color:#173a0b;display:grid;place-items:center;
    font-size:27px;box-shadow:0 4px 12px rgba(139,212,79,.4)}
  .dcx-backdrop{display:block;position:fixed;inset:0;background:rgba(20,24,45,.4);opacity:0;pointer-events:none;transition:.22s;z-index:75}
  .dcx-backdrop.on{opacity:1;pointer-events:auto}
  .dcx-sheet{display:block;position:fixed;left:0;right:0;bottom:0;background:#fff;border-radius:18px 18px 0 0;z-index:80;
    padding:10px 16px calc(16px + env(safe-area-inset-bottom));transform:translateY(100%);transition:transform .28s cubic-bezier(.2,.8,.2,1);box-shadow:0 -10px 40px rgba(20,24,45,.2)}
  .dcx-sheet.on{transform:none}
  .dcx-grip{width:40px;height:4px;border-radius:4px;background:#D7DBE3;margin:6px auto 12px}
  .dcx-sheet-h{font-size:13px;color:var(--dcx-muted);font-weight:700;margin:2px 4px 8px}
  .dcx-sheet a,.dcx-sheet button{display:flex;align-items:center;gap:12px;padding:14px 8px;border-radius:11px;color:var(--dcx-ink);text-decoration:none;font-weight:700;font-size:16px;width:100%;background:none;border:none;cursor:pointer;font-family:inherit;text-align:right}
  .dcx-sheet a:active,.dcx-sheet button:active{background:var(--dcx-accent-soft)}
  .dcx-sheet svg{width:20px;height:20px;color:var(--dcx-accent)}
  .dcx-sheet .dcx-more-toggle{padding:14px 8px;font-size:15px;color:#3A4155;border:none;border-top:1px solid var(--dcx-line);margin-top:2px}
  .dcx-sheet .dcx-more-chev{width:17px;height:17px}
}
@media(min-width:901px){.dcx-mobilebar,.dcx-backdrop,.dcx-sheet{display:none !important}}
@media(prefers-reduced-motion:reduce){
  .dcx-nav-link,.dcx-chev,.dcx-submenu,.dcx-fab,.dcx-fab-menu,.dcx-backdrop,.dcx-sheet{transition:none !important;animation:none !important}
}
`

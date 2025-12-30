"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/app/dashboard/actions";

type MenuSection = {
  id: string;
  icon: React.ReactNode;
  title: string;
  items: {
    href: string;
    label: string;
  }[];
};

const menuSections: MenuSection[] = [
  {
    id: "home",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    title: "בית",
    items: [
      { href: "/dashboard", label: "לוח בקרה" },
    ],
  },
  {
    id: "documents",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    title: "מסמכים",
    items: [
      { href: "/dashboard/documents", label: "כל המסמכים" },
      { href: "/dashboard/documents/receipts", label: "רשימת קבלות" },
      { href: "/dashboard/documents/receipt", label: "קבלה חדשה" },
    ],
  },
  {
    id: "customers",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: "לקוחות",
    items: [
      { href: "/dashboard/customers", label: "רשימת לקוחות" },
    ],
  },
  {
    id: "wallet",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
      </svg>
    ),
    title: "הוצאות",
    items: [
      { href: "/dashboard/expenses", label: "מסמכי הוצאות" },
      { href: "/dashboard/expenses/types", label: "סוגי הוצאות" },
      { href: "/dashboard/expenses/suppliers", label: "ספקים" },
    ],
  },
  {
    id: "reports",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    title: "דוחות",
    items: [
      { href: "/dashboard/reports", label: "דוחות כספיים" },
    ],
  },
  {
    id: "analytics",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    title: "ניתוח",
    items: [
      { href: "/dashboard/analytics", label: "ניתוח נתונים" },
    ],
  },
  {
    id: "settings",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
    title: "הגדרות",
    items: [
      { href: "/dashboard/settings", label: "הגדרות עסק" },
    ],
  },
  {
    id: "apps",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
    title: "אפליקציות",
    items: [
      { href: "/dashboard/apps", label: "כל האפליקציות" },
    ],
  },
];

export function IconSidebar() {
  const pathname = usePathname();
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logoutAction();
  };

  return (
    <aside className="dashboard-sidebar">
      <div className="sidebar-icons">
        {menuSections.map((section) => {
          const isActive = section.items.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
          
          return (
            <div
              key={section.id}
              className="sidebar-icon-wrapper"
              onMouseEnter={() => setHoveredSection(section.id)}
              onMouseLeave={() => setHoveredSection(null)}
            >
              <button
                className={`sidebar-icon-button ${isActive ? "active" : ""}`}
                aria-label={section.title}
              >
                {section.icon}
              </button>

              {hoveredSection === section.id && (
                <div className="sidebar-flyout">
                  <div className="sidebar-flyout-title">{section.title}</div>
                  <nav className="sidebar-flyout-nav">
                    {section.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`sidebar-flyout-link ${pathname === item.href ? "active" : ""}`}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </nav>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="sidebar-bottom">
        <div
          className="sidebar-icon-wrapper"
          onMouseEnter={() => setHoveredSection("logout")}
          onMouseLeave={() => setHoveredSection(null)}
        >
          <button
            className="sidebar-icon-button"
            aria-label="התנתקות"
            onClick={handleLogout}
            disabled={isLoggingOut}
            style={{ opacity: isLoggingOut ? 0.5 : 1 }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>

          {hoveredSection === "logout" && (
            <div className="sidebar-flyout">
              <div className="sidebar-flyout-title">התנתקות</div>
              <div className="sidebar-flyout-nav">
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="sidebar-flyout-link logout-button"
                >
                  {isLoggingOut ? "מתנתק..." : "התנתק מהחשבון"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

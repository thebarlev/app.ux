"use client";

import Link from "next/link";

type NavItem = {
  label: string;
  href: string;
};

function NavLink({ label, href }: NavItem) {
  return (
    <Link
      href={href}
      className="block rounded-xl px-3 py-2 text-sm text-sidebar-fg hover:bg-sidebar-hover transition"
    >
      {label}
    </Link>
  );
}

export function Sidebar() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-sidebar-border bg-sidebar p-4">
      <div className="mb-4">
        <div className="text-base font-semibold text-sidebar-fg">מערכת ניהול</div>
        <div className="text-xs text-sidebar-fg">Admin Panel</div>
      </div>

      <nav className="space-y-1">
        <NavLink label="דשבורד" href="/dashboard" />
        <NavLink label="מסמכים" href="/dashboard/documents" />
        <NavLink label="כל המסמכים" href="/dashboard/documents/all" />
      </nav>

      <div className="mt-3">
        <details className="group">
          <summary className="list-none cursor-pointer rounded-xl px-3 py-2 text-sm text-sidebar-fg hover:bg-sidebar-hover transition flex items-center justify-between">
            <span>מסמכי Income</span>
            <span className="text-sidebar-fg group-open:rotate-180 transition">⌄</span>
          </summary>

          <div className="mt-2 space-y-1 pr-3 border-r border-sidebar-border">
            <NavLink label="חשבונית מס" href="/dashboard/incomes/documents/new/invoice" />
            <NavLink label="חשבונית מס / קבלה" href="/dashboard/incomes/documents/new/invoiceReceipt" />
            <NavLink label="קבלה" href="/dashboard/incomes/documents/new/receipt" />
          </div>
        </details>
      </div>

      <div className="mt-3">
        <NavLink label="לקוחות" href="/dashboard/customers" />
        <NavLink label="לקוח חדש" href="/dashboard/customers/new" />
      </div>

      <div className="mt-3">
        <NavLink label="הגדרות" href="/dashboard/settings" />
        <NavLink label="תבניות" href="/dashboard/templates" />
        <NavLink label="Env Debug" href="/debug/env" />
      </div>

      <div className="flex-1" />

      <div className="pt-3 border-t border-sidebar-border">
        <button
          type="button"
          className="w-full rounded-xl px-3 py-2 text-sm text-danger hover:bg-danger/20 hover:text-danger/80 transition text-right"
          onClick={() => {
            window.location.href = "/logout";
          }}
        >
          התנתקות
        </button>
      </div>
    </div>
  );
}

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
      className="block rounded-xl px-3 py-2 text-sm text-white/85 hover:bg-white/10 hover:text-white transition"
    >
      {label}
    </Link>
  );
}

export function Sidebar() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-4">
        <div className="text-base font-semibold">מערכת ניהול</div>
        <div className="text-xs text-white/60">Admin Panel</div>
      </div>

      <nav className="space-y-1">
        <NavLink label="דשבורד" href="/dashboard" />
        <NavLink label="מסמכים" href="/dashboard/documents" />
        <NavLink label="ריכוז כל המסמכים" href="/dashboard/documents/all" />
      </nav>

      <div className="mt-3">
        <details className="group">
          <summary className="list-none cursor-pointer rounded-xl px-3 py-2 text-sm text-white/85 hover:bg-white/10 transition flex items-center justify-between">
            <span>קבלות / חשבוניות</span>
            <span className="text-white/60 group-open:rotate-180 transition">⌄</span>
          </summary>

          <div className="mt-2 space-y-1 pr-3 border-r border-white/10">
            <NavLink label="קבלות" href="/dashboard/receipts" />
            <NavLink label="חשבונית עסקה" href="/dashboard/invoices/deal" />
            <NavLink label="חשבונית מס קבלה" href="/dashboard/invoices/tax-receipt" />
            <NavLink label="חשבונניות" href="/dashboard/invoices" />
          </div>
        </details>
      </div>

      <div className="mt-3">
        <NavLink label="לקוחות" href="/dashboard/customers" />
      </div>

      <div className="flex-1" />

      <div className="pt-3 border-t border-white/10">
        <button
          type="button"
          className="w-full rounded-xl px-3 py-2 text-sm text-red-200 hover:bg-red-500/15 hover:text-red-100 transition text-right"
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

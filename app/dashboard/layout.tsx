import React from "react";
import { Sidebar } from "../components/ui/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 p-4 lg:grid-cols-[1fr_280px] lg:items-start">
        {/* CONTENT */}
        <main className="min-w-0">{children}</main>

        {/* SIDEBAR RIGHT */}
        <aside className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
          <Sidebar />
        </aside>
      </div>
    </div>
  );
}

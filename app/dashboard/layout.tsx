import { IconSidebar } from "@/components/dashboard/IconSidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-layout">
      <IconSidebar />
      
      <main className="dashboard-main">
        <div className="dashboard-container">{children}</div>
      </main>
    </div>
  );
}


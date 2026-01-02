import { DashboardLayout } from "@/components/layout/DashboardLayout";

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

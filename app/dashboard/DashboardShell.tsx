import DashboardChrome from "@/components/layout/DashboardChrome";

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return <DashboardChrome>{children}</DashboardChrome>;
}

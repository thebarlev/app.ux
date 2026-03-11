import { Card, CardContent } from "@/components/ui/card"
import { Activity, AlertTriangle, CheckCircle2, Clock, Globe, TrendingUp } from "lucide-react"

export interface AuditorMetrics {
  scansToday: number
  scansTotal: number
  running: number
  failed: number
  done: number
  avgScoreTotal: number | null
}

function MetricCard({
  label,
  value,
  sub,
  icon,
  variant = "default",
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  variant?: "default" | "warning" | "success" | "danger"
}) {
  const colors = {
    default: "text-slate-600 bg-slate-100",
    warning: "text-amber-600 bg-amber-100",
    success: "text-emerald-600 bg-emerald-100",
    danger: "text-red-600 bg-red-100",
  }

  return (
    <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 text-3xl font-bold text-slate-900 tabular-nums">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors[variant]}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function AdminAuditorMetrics({ metrics }: { metrics: AuditorMetrics }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <MetricCard
        label="Scans Today"
        value={metrics.scansToday}
        icon={<TrendingUp className="h-5 w-5" />}
        variant="default"
      />
      <MetricCard
        label="Total Scans"
        value={metrics.scansTotal}
        icon={<Globe className="h-5 w-5" />}
        variant="default"
      />
      <MetricCard
        label="Running"
        value={metrics.running}
        sub="active pipelines"
        icon={<Activity className="h-5 w-5" />}
        variant={metrics.running > 0 ? "warning" : "default"}
      />
      <MetricCard
        label="Failed Today"
        value={metrics.failed}
        icon={<AlertTriangle className="h-5 w-5" />}
        variant={metrics.failed > 0 ? "danger" : "default"}
      />
      <MetricCard
        label="Completed Today"
        value={metrics.done}
        icon={<CheckCircle2 className="h-5 w-5" />}
        variant={metrics.done > 0 ? "success" : "default"}
      />
      <MetricCard
        label="Avg Score"
        value={metrics.avgScoreTotal != null ? Math.round(metrics.avgScoreTotal) : "—"}
        sub="all-time"
        icon={<Clock className="h-5 w-5" />}
        variant="default"
      />
    </div>
  )
}

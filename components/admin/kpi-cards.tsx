import { Card, CardContent } from "@/components/ui/card"
import { Users, UserPlus, TrendingUp, TrendingDown, Activity } from "lucide-react"
import type { KpiData } from "@/lib/types/admin"

interface KpiCardsProps {
  data: KpiData
}

export function KpiCards({ data }: KpiCardsProps) {
  const trend =
    data.newUsersLastMonth > 0
      ? ((data.newUsersThisMonth - data.newUsersLastMonth) / data.newUsersLastMonth) * 100
      : data.newUsersThisMonth > 0
        ? 100
        : 0

  const isPositiveTrend = trend >= 0

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="border border-white/10 bg-slate-900/60 backdrop-blur">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/70">Total Users</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{data.totalUsers}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10">
              <Users className="h-6 w-6 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-white/10 bg-slate-900/60 backdrop-blur">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/70">New This Month</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{data.newUsersThisMonth}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-500/20">
              <UserPlus className="h-6 w-6 text-green-400" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-white/10 bg-slate-900/60 backdrop-blur">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/70">New Last Month</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{data.newUsersLastMonth}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-500/20">
              <Activity className="h-6 w-6 text-yellow-400" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-white/10 bg-slate-900/60 backdrop-blur">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/70">Month Trend</p>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="text-3xl font-semibold tracking-tight text-white">{Math.abs(trend).toFixed(0)}%</p>
                {isPositiveTrend ? (
                  <span className="flex items-center text-sm font-medium text-green-400">
                    <TrendingUp className="mr-1 h-4 w-4" />
                    up
                  </span>
                ) : (
                  <span className="flex items-center text-sm font-medium text-red-400">
                    <TrendingDown className="mr-1 h-4 w-4" />
                    down
                  </span>
                )}
              </div>
            </div>
            <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${
              isPositiveTrend ? "bg-green-500/20" : "bg-red-500/20"
            }`}>
              {isPositiveTrend ? (
                <TrendingUp className="h-6 w-6 text-green-400" />
              ) : (
                <TrendingDown className="h-6 w-6 text-red-400" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

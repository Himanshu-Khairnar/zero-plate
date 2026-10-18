import Link from "next/link"
import {
  Bell,
  CircleDollarSign,
  ClipboardList,
  PackageSearch,
  TriangleAlert,
  TrendingDown,
} from "lucide-react"

import { KpiCard } from "@/components/dashboard/kpi-card"
import { Badge } from "@/components/ui/badge"
import { inr, num, pct } from "@/lib/format"

export type ManagerStats = {
  revenue7: number
  revenueChange7: number | null
  plates7: number
  wastePct: number
  wasteCost30: number
  planPending: boolean
  planStatus: string
  forecastMape: number | null
  unreadAlerts: number
  stockAlerts: number
}

export type ManagerAlert = { id: string; type: string; severity: string; message: string }

export function ManagerDashboard({
  name,
  outletName,
  organizationName,
  outletId,
  stats,
  alerts,
}: {
  name: string
  outletName: string | null
  organizationName: string | null
  outletId: string | null
  stats: ManagerStats
  alerts: ManagerAlert[]
}) {
  const q = outletId ? `?outlet=${outletId}` : ""
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-chart-3/10 via-transparent to-primary/5 p-6">
        <p className="text-sm font-medium text-muted-foreground">
          {organizationName ?? "Your organization"} ·{" "}
          {outletName ?? "Your outlet"}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Good to see you, {name}
        </h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Last 7 days at a glance, and what needs your attention today.
        </p>
      </section>

      {stats.planPending ? (
        <Link
          href={`/prep-plan${q}`}
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-primary/80 transition-colors hover:bg-primary/15 dark:text-primary/80"
        >
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Prep plan awaiting approval</p>
            <p className="text-sm">
              {stats.planStatus === "MISSING"
                ? "Tomorrow's prep plan has not been opened yet. Open it to draft from the forecast and approve before service."
                : "Tomorrow's prep plan is drafted from the forecast and needs your review before service."}
            </p>
          </div>
        </Link>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Sales · 7 days"
          value={inr(stats.revenue7)}
          hint={`${num(stats.plates7)} plates`}
          icon={CircleDollarSign}
          tone="emerald"
          trend={
            stats.revenueChange7 != null
              ? { label: `${Math.abs(stats.revenueChange7)}% vs previous week`, direction: stats.revenueChange7 >= 0 ? "up" : "down", positive: stats.revenueChange7 >= 0 }
              : undefined
          }
        />
        <KpiCard
          label="Waste · 30 days"
          value={pct(stats.wastePct, 1)}
          hint={`${inr(stats.wasteCost30)} at cost · target under 4%`}
          icon={TrendingDown}
          tone={stats.wastePct > 5 ? "red" : "amber"}
        />
        <KpiCard
          label="Forecast accuracy"
          value={stats.forecastMape != null ? `MAPE ${pct(stats.forecastMape, 1)}` : "—"}
          hint="last 28 days, per dish"
          icon={ClipboardList}
          tone="blue"
        />
        <KpiCard
          label="Stock alerts"
          value={num(stats.stockAlerts)}
          hint={`${num(stats.unreadAlerts)} unread alerts in total`}
          icon={PackageSearch}
          tone={stats.stockAlerts ? "red" : "default"}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Needs attention</h2>
          <Link href="/alerts" className="text-sm text-primary underline-offset-4 hover:underline">
            All alerts
          </Link>
        </div>
        {alerts.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing open. Stock, expiry and forecast checks run when you open Inventory or Alerts.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {alerts.map((alert) => {
              const critical = alert.severity === "critical"
              return (
                <div key={alert.id} className="flex items-start justify-between gap-3 rounded-2xl border bg-background p-4 shadow-sm">
                  <div className="flex items-start gap-2">
                    <Bell className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{alert.type.replace("_", " ")}</p>
                      <p className="mt-0.5 text-sm">{alert.message}</p>
                    </div>
                  </div>
                  <Badge variant={critical ? "destructive" : "secondary"} className="capitalize">{alert.severity}</Badge>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

import {
  Activity,
  Building,
  ShieldCheck,
  Store,
  TrendingUp,
} from "lucide-react"

import { KpiCard } from "@/components/dashboard/kpi-card"

export function AdminDashboard({
  name,
  stats,
}: {
  name: string
  stats: {
    totalOrganizations: number
    activeOutlets: number
    forecastInferencesToday: number
  }
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-gradient-to-br from-primary/5 to-transparent p-6">
        <p className="text-sm text-muted-foreground">Platform administration</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          System overview
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {name}. Monitoring all tenants and models.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Organizations"
          value={stats.totalOrganizations.toLocaleString()}
          hint="All tenants on the platform"
          icon={Building}
        />
        <KpiCard
          label="Active Outlets"
          value={stats.activeOutlets.toLocaleString()}
          hint="Reporting across tenants"
          icon={Store}
        />
        <KpiCard
          label="Forecast Inferences Today"
          value={stats.forecastInferencesToday.toLocaleString()}
          hint="Rolling 24 hours"
          icon={TrendingUp}
        />
        <KpiCard
          label="Global Health Status"
          value="Operational"
          hint="All services responding"
          icon={ShieldCheck}
        />
      </section>

      <section className="rounded-xl border bg-background p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold">System health</h2>
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex items-center justify-between">
            <span className="text-muted-foreground">API</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Healthy
            </span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-muted-foreground">Database</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Healthy
            </span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-muted-foreground">Forecast workers</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Healthy
            </span>
          </li>
        </ul>
      </section>
    </div>
  )
}

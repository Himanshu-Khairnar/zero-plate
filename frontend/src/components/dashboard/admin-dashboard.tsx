import {
  Activity,
  Building,
  ShieldCheck,
  Store,
  TrendingUp,
} from "lucide-react"

import { KpiCard } from "@/components/dashboard/kpi-card"

const HEALTH_ROWS = [
  { label: "API", status: "Healthy" },
  { label: "Database", status: "Healthy" },
  { label: "Forecast workers", status: "Healthy" },
]

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
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-transparent to-primary/5 p-6">
        <p className="text-sm font-medium text-muted-foreground">
          Platform administration
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          System overview
        </h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Signed in as {name}. Monitoring all tenants and models.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Organizations"
          value={stats.totalOrganizations.toLocaleString()}
          hint="All tenants on the platform"
          icon={Building}
          tone="violet"
        />
        <KpiCard
          label="Active Outlets"
          value={stats.activeOutlets.toLocaleString()}
          hint="Reporting across tenants"
          icon={Store}
          tone="blue"
        />
        <KpiCard
          label="Forecast Inferences Today"
          value={stats.forecastInferencesToday.toLocaleString()}
          hint="Rolling 24 hours"
          icon={TrendingUp}
          tone="emerald"
        />
        <KpiCard
          label="Global Health Status"
          value="Operational"
          hint="All services responding"
          icon={ShieldCheck}
          tone="emerald"
        />
      </section>

      <section className="rounded-2xl border bg-background p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-base font-semibold">System health</h2>
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          {HEALTH_ROWS.map((row) => (
            <li
              key={row.label}
              className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"
            >
              <span className="text-muted-foreground">{row.label}</span>
              <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                <span className="size-1.5 rounded-full bg-primary" />
                {row.status}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
